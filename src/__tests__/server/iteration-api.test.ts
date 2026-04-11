import fs from "fs-extra";
import path from "node:path";
import request, { type Response as SupertestResponse } from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../../server/app.js";
import { archiveRoot, workspaceRoot } from "../../server/workspace.js";

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

describe("iteration API", () => {
  const app = createApp();

  beforeEach(async () => {
    providerState.responses.length = 0;
    await fs.remove(path.join(workspaceRoot, "iteration-demo"));
    await fs.remove(path.join(archiveRoot, "iteration-demo.tar.gz"));

    await request(app)
      .post("/api/projects")
      .send({ title: "Iteration Demo", mediaType: "tv_series", packageTier: "full" })
      .buffer(true)
      .parse(parseSSEBody);
  });

  test("POST /api/projects/:slug/iterations in gated mode pauses after first run and persists session", async () => {
    providerState.responses.push(JSON.stringify({
      summary: "Adds Vera Moss as a compromised handler.",
      confidence: 0.82,
      proposals: [
        {
          field: "canon.characters",
          operation: "add",
          value: {
            id: "vera-moss",
            name: "Vera Moss",
            role: "field liaison",
            description: "A compromised government handler attached to the harbor investigation.",
            visibility: "internal",
          },
          rationale: "This adds pressure to the existing command structure.",
          confidence: 0.82,
        },
      ],
      suggestedNextDirectives: [
        {
          type: "develop_character",
          instruction: "Deepen Vera Moss.",
          targetId: "vera-moss",
        },
      ],
    }));

    const response = await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "gated",
        maxRuns: 3,
        firstDirective: {
          type: "new_character",
          instruction: "Add a morally ambiguous handler.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const text = String(response.body);
    expect(text).toContain("event: run_start");
    expect(text).toContain("event: run_complete");
    expect(text).toContain("event: hitl_pause");

    const sessions = await request(app).get("/api/projects/iteration-demo/iterations");
    expect(sessions.body.ok).toBe(true);
    expect(sessions.body.data[0].status).toBe("paused");
    expect(sessions.body.data[0].completedRuns).toBe(1);
  });

  test("POST /api/projects/:slug/iterations persists planner configuration", async () => {
    providerState.responses.push(JSON.stringify({
      summary: "Adds Vera Moss as a compromised handler.",
      confidence: 0.82,
      proposals: [],
      suggestedNextDirectives: [],
    }));

    await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "gated",
        maxRuns: 3,
        planner: {
          strategy: "coverage",
          avoidRecentWindow: 3,
          sectionTargets: {
            characters: 1,
            episodes: 2,
            themes: 1,
          },
        },
        firstDirective: {
          type: "new_character",
          instruction: "Add a morally ambiguous handler.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const sessions = await request(app).get("/api/projects/iteration-demo/iterations");
    expect(sessions.body.data[0].planner.strategy).toBe("coverage");
    expect(sessions.body.data[0].planner.avoidRecentWindow).toBe(3);
    expect(sessions.body.data[0].planner.sectionTargets.episodes).toBe(2);
  });

  test("POST /api/projects/:slug/iterations in autonomous mode runs to completion", async () => {
    providerState.responses.push(
      JSON.stringify({
        summary: "Adds Vera Moss as a compromised handler.",
        confidence: 0.82,
        proposals: [
          {
            field: "canon.characters",
            operation: "add",
            value: {
              id: "vera-moss",
              name: "Vera Moss",
              role: "field liaison",
              description: "A compromised government handler attached to the harbor investigation.",
              visibility: "internal",
            },
            rationale: "This adds pressure to the existing command structure.",
            confidence: 0.82,
          },
        ],
        suggestedNextDirectives: [
          {
            type: "new_episode",
            instruction: "Create an episode that tests Vera.",
          },
        ],
      }),
      JSON.stringify({
        summary: "Adds a new episode featuring Dara and Vera.",
        confidence: 0.86,
        proposals: [
          {
            field: "canon.episodes",
            operation: "add",
            value: {
              code: "S01E03",
              title: "Dead Frequency",
              logline: "Dara and Vera trace the original broadcast to a reclaimed relay station.",
              status: "planned",
              visibility: "internal",
            },
            rationale: "This naturally escalates the first character addition.",
            confidence: 0.86,
          },
        ],
        suggestedNextDirectives: [],
      }),
    );

    const response = await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "autonomous",
        maxRuns: 2,
        firstDirective: {
          type: "new_character",
          instruction: "Add a morally ambiguous handler.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const text = String(response.body);
    expect(text).toContain("event: loop_complete");

    const canon = await request(app).get("/api/projects/iteration-demo/canon");
    expect(canon.body.data.canon.characters.value.some((item: { id: string }) => item.id === "vera-moss")).toBe(true);
    expect(canon.body.data.canon.episodes.value.some((item: { code: string }) => item.code === "S01E03")).toBe(true);
  });

  test("POST /api/projects/:slug/iterations/:sessionId/continue applies accepted proposals and resumes", async () => {
    providerState.responses.push(
      JSON.stringify({
        summary: "Adds Vera Moss as a compromised handler.",
        confidence: 0.82,
        proposals: [
          {
            field: "canon.characters",
            operation: "add",
            value: {
              id: "vera-moss",
              name: "Vera Moss",
              role: "field liaison",
              description: "A compromised government handler attached to the harbor investigation.",
              visibility: "internal",
            },
            rationale: "This adds pressure to the existing command structure.",
            confidence: 0.82,
          },
        ],
        suggestedNextDirectives: [
          {
            type: "develop_character",
            instruction: "Deepen Vera Moss.",
            targetId: "vera-moss",
          },
        ],
      }),
      JSON.stringify({
        summary: "Deepens Vera with a backstory note.",
        confidence: 0.9,
        proposals: [
          {
            field: "canon.characters[vera-moss].description",
            operation: "update",
            value: "A compromised handler who once helped bury the relay incident she is now forced to investigate.",
            rationale: "This gives Vera an immediate inner conflict.",
            confidence: 0.9,
          },
        ],
        suggestedNextDirectives: [],
      }),
    );

    await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "confidence",
        maxRuns: 2,
        confidenceThreshold: 0.9,
        firstDirective: {
          type: "new_character",
          instruction: "Add a morally ambiguous handler.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const sessionResponse = await request(app).get("/api/projects/iteration-demo/iterations");
    const session = sessionResponse.body.data[0];
    const proposalId = session.runs[0].proposals[0].proposalId as string;

    const continueResponse = await request(app)
      .post(`/api/projects/iteration-demo/iterations/${session.sessionId}/continue`)
      .send({ accepted: [proposalId], steeringNote: "Make her loyalty visibly unstable." })
      .buffer(true)
      .parse(parseSSEBody);

    expect(String(continueResponse.body)).toContain("event: loop_complete");

    const canon = await request(app).get("/api/projects/iteration-demo/canon");
    const vera = canon.body.data.canon.characters.value.find((item: { id: string }) => item.id === "vera-moss");
    expect(vera.description).toContain("relay incident");
  });

  test("POST /api/projects/:slug/iterations/:sessionId/stop marks session stopped", async () => {
    providerState.responses.push(JSON.stringify({
      summary: "Adds Vera Moss as a compromised handler.",
      confidence: 0.82,
      proposals: [],
      suggestedNextDirectives: [],
    }));

    await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "gated",
        maxRuns: 2,
        firstDirective: {
          type: "suggest_next",
          instruction: "Suggest the best next steps.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const sessionResponse = await request(app).get("/api/projects/iteration-demo/iterations");
    const session = sessionResponse.body.data[0];

    const stopResponse = await request(app)
      .post(`/api/projects/iteration-demo/iterations/${session.sessionId}/stop`)
      .send({});

    expect(stopResponse.body.ok).toBe(true);
    expect(stopResponse.body.data.status).toBe("stopped");
  });

  test("POST /api/projects/:slug/iterations/:sessionId/runs/:runId/accept-all applies proposals and regenerates", async () => {
    providerState.responses.push(JSON.stringify({
      summary: "Adds Vera Moss as a compromised handler.",
      confidence: 0.82,
      proposals: [
        {
          field: "canon.characters",
          operation: "add",
          value: {
            id: "vera-moss",
            name: "Vera Moss",
            role: "field liaison",
            description: "A compromised government handler attached to the harbor investigation.",
            visibility: "internal",
          },
          rationale: "This adds pressure to the existing command structure.",
          confidence: 0.82,
        },
      ],
      suggestedNextDirectives: [],
    }));

    await request(app)
      .post("/api/projects/iteration-demo/iterations")
      .send({
        mode: "gated",
        maxRuns: 1,
        firstDirective: {
          type: "new_character",
          instruction: "Add a morally ambiguous handler.",
        },
      })
      .buffer(true)
      .parse(parseSSEBody);

    const sessionResponse = await request(app).get("/api/projects/iteration-demo/iterations");
    const session = sessionResponse.body.data[0];
    const run = session.runs[0];

    const acceptResponse = await request(app)
      .post(`/api/projects/iteration-demo/iterations/${session.sessionId}/runs/${run.runId}/accept-all`)
      .send({ minConfidence: 0.8 })
      .buffer(true)
      .parse(parseSSEBody);

    expect(String(acceptResponse.body)).toContain("event: started");
    expect(String(acceptResponse.body)).toContain("event: done");

    const canon = await request(app).get("/api/projects/iteration-demo/canon");
    expect(canon.body.data.canon.characters.value.some((item: { id: string }) => item.id === "vera-moss")).toBe(true);
  });
});

function parseSSEBody(res: SupertestResponse, callback: (error: Error | null, body: string) => void) {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk: string) => {
    body += chunk;
  });
  res.on("end", () => callback(null, body));
}
