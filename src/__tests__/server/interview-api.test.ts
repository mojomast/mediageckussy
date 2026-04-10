import fs from "fs-extra";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../../server/app.js";
import { archiveRoot, workspaceRoot } from "../../server/workspace.js";

vi.mock("../../ai/hydrators/bulkHydrator.js", async () => {
  const actual = await vi.importActual<typeof import("../../ai/hydrators/bulkHydrator.js")>("../../ai/hydrators/bulkHydrator.js");
  return {
    ...actual,
    hydratePackage: vi.fn(async () => ({
      provider: "mock",
      generatedAt: new Date().toISOString(),
      tokenTotals: { prompt: 0, completion: 0 },
      fieldSuggestions: 2,
      documentReplacements: 0,
      skipped: [],
    })),
  };
});

const providerState = vi.hoisted(() => ({
  responses: [] as string[],
}));

vi.mock("../../ai/providers/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../ai/providers/index.js")>("../../ai/providers/index.js");
  return {
    ...actual,
    resolveProvider: vi.fn(() => ({
      id: "mock",
      name: "Mock",
      async complete() {
        const content = providerState.responses.shift();
        if (!content) {
          throw new Error("No mock response queued");
        }
        return {
          content,
          model: "mock-llm",
          usage: { promptTokens: 0, completionTokens: 0 },
          durationMs: 0,
        };
      },
      async isAvailable() {
        return true;
      },
    })),
  };
});

describe("interview API", () => {
  const app = createApp();

  beforeEach(async () => {
    providerState.responses.length = 0;
    await fs.remove(path.join(workspaceRoot, "_interviews"));
    await fs.remove(path.join(workspaceRoot, "interview-demo"));
    await fs.remove(path.join(archiveRoot, "interview-demo.tar.gz"));
  });

  afterEach(() => {
    providerState.responses.length = 0;
  });

  test("POST /api/interview/start returns sessionId and first question string", async () => {
    const response = await request(app).post("/api/interview/start").send({ provider: "openrouter", model: "google/gemini-2.5-flash-lite" });

    expect(response.body.ok).toBe(true);
    expect(response.body.data.sessionId).toBeDefined();
    expect(response.body.data.message).toContain("What kind of project is this?");
    expect(response.body.data.phase).toBe(1);
    expect(response.body.data.totalQuestions).toBe(15);
  });

  test("POST /api/interview/turn with valid sessionId and message returns response and updated progress", async () => {
    const start = await request(app).post("/api/interview/start").send({ provider: "openrouter", model: "google/gemini-2.5-flash-lite" });
    providerState.responses.push("That sounds like a strong TV premise. What's your project called?\n<!-- EXTRACT: {\"field\":\"canon.format\",\"value\":\"tv_series\"} -->");

    const response = await request(app)
      .post("/api/interview/turn")
      .send({ sessionId: start.body.data.sessionId, message: "It is a TV series" });

    expect(response.body.ok).toBe(true);
    expect(response.body.data.message).toContain("What's your project called?");
    expect(response.body.data.phase).toBe(1);
    expect(response.body.data.questionIndex).toBe(1);
  });

  test("POST /api/interview/turn with unknown sessionId returns 404", async () => {
    const response = await request(app)
      .post("/api/interview/turn")
      .send({ sessionId: "missing-session", message: "hello" });

    expect(response.status).toBe(404);
  });

  test("POST /api/interview/complete streams SSE events and ends with done slug", async () => {
    const start = await request(app).post("/api/interview/start").send({ provider: "openrouter", model: "google/gemini-2.5-flash-lite" });
    const sessionId = start.body.data.sessionId as string;
    const interviewDir = path.join(workspaceRoot, "_interviews", sessionId);
    const statePath = path.join(interviewDir, "state.json");
    const state = await fs.readJson(statePath);
    state.answers = {
      "canon.format": "tv_series",
      "canon.title": "Interview Demo",
      "canon.logline": "A producer uses a guided interview to turn a rough pitch into a full package.",
      "canon.genre": "drama",
      "canon.tone": ["smart", "grounded"],
      "canon.world_setting": "A contemporary creative studio.",
      "canon.audience": ["industry readers"],
      "canon.comps": ["The Studio", "Halt and Catch Fire"],
      "canon.duration_count": "8 episodes, 30 minutes each",
      "canon.characters": [{ id: "ava-lane", name: "Ava Lane", role: "producer", description: "An ambitious producer shaping a new show.", visibility: "internal" }],
      "canon.episodes": [{ code: "S01E01", title: "Cold Open", logline: "Ava pitches the project through an AI-guided interview.", status: "planned", visibility: "internal" }],
      "canon.themes": ["authorship", "iteration"],
      "canon.production_assumptions": ["lean demo production"],
    };
    state.phase = "complete";
    await fs.writeJson(statePath, state, { spaces: 2 });

    const response = await request(app)
      .post("/api/interview/complete")
      .send({ sessionId })
      .buffer(true)
      .parse((res, callback) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => callback(null, body));
      });

    expect(String(response.body)).toContain("event: started");
    expect(String(response.body)).toContain("event: progress");
    expect(String(response.body)).toContain("event: done");
    expect(String(response.body)).toContain("interview-demo");
  });
});
