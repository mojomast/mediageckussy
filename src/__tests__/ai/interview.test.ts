import { describe, expect, test } from "vitest";
import { canonProjectSchema } from "../../core/schema.js";
import { buildCanonFromAnswers } from "../../ai/interview/canonBuilder.js";
import { INTERVIEW_QUESTIONS, getNextQuestion } from "../../ai/interview/questions.js";
import { runInterviewTurn } from "../../ai/interview/runner.js";
import { createSession } from "../../ai/interview/state.js";
import type { LLMProvider } from "../../ai/providers/types.js";

describe("interview engine", () => {
  test("createSession returns phase 1, questionIndex 0", () => {
    const session = createSession();
    expect(session.phase).toBe(1);
    expect(session.questionIndex).toBe(0);
  });

  test("getNextQuestion returns Q0 on fresh state", () => {
    const session = createSession();
    expect(getNextQuestion(session)?.index).toBe(0);
  });

  test("getNextQuestion skips format-gated questions when format does not match", () => {
    const session = createSession();
    session.answers["canon.format"] = "feature_film";
    session.answers["canon.title"] = "Project";
    session.answers["canon.logline"] = "A film.";
    session.answers["canon.genre"] = "drama";
    session.answers["canon.tone"] = ["moody"];
    session.answers["canon.world_setting"] = "A city.";
    session.answers["canon.audience"] = ["adults"];
    session.answers["canon.comps"] = ["Comp One"];

    expect(getNextQuestion(session)?.prompt).toBe("What's the approximate runtime?");
  });

  test("getNextQuestion returns null when all required questions answered", () => {
    const session = createSession();
    session.answers = {
      "canon.format": "tv_series",
      "canon.title": "Project",
      "canon.logline": "A project.",
      "canon.genre": "drama",
      "canon.tone": ["warm"],
      "canon.world_setting": "A place.",
      "canon.audience": ["adults"],
      "canon.comps": ["Comp One"],
      "canon.duration_count": "8 x 30 min",
      "canon.characters": [{ id: "lead", name: "Lead", role: "lead", description: "desc", visibility: "internal" }],
      "canon.episodes": [{ code: "S01E01", title: "Pilot", logline: "Start", status: "planned", visibility: "internal" }],
      "canon.themes": ["identity"],
    };

    expect(getNextQuestion(session)).toBeNull();
  });

  test("runInterviewTurn stores extracted value and advances", async () => {
    const state = createSession();
    const provider = mockProvider(`Absolutely, a TV series sounds like the right frame. What's your project called?\n<!-- EXTRACT: {"field":"canon.format","value":"tv_series"} -->`);

    const result = await runInterviewTurn(state, "It's a TV series", provider);

    expect(result.updatedState.answers["canon.format"]).toBe("tv_series");
    expect(result.updatedState.phase).toBe(1);
    expect(result.updatedState.questionIndex).toBe(1);
    expect(result.complete).toBe(false);
  });

  test("runInterviewTurn with null extraction does not store value", async () => {
    const state = createSession();
    const provider = mockProvider(`I want to make sure I understand. What kind of project is this?\n<!-- EXTRACT: {"field":"canon.format","value":null} -->`);

    const result = await runInterviewTurn(state, "maybe screen-based", provider);

    expect(result.updatedState.answers["canon.format"]).toBeUndefined();
  });

  test("buildCanonFromAnswers with full answer set produces valid CanonProject", () => {
    const state = createSession();
    state.answers = fullAnswerSet();

    const canon = buildCanonFromAnswers(state);

    expect(() => canonProjectSchema.parse(canon)).not.toThrow();
    expect(canon.canon.characters.value).toHaveLength(2);
    expect(canon.canon.episodes.value).toHaveLength(2);
  });

  test("buildCanonFromAnswers all fields have status draft and owner agent", () => {
    const canon = buildCanonFromAnswers({
      ...createSession(),
      answers: fullAnswerSet(),
    });

    for (const field of Object.values(canon.canon)) {
      expect(field.status).toBe("draft");
      expect(field.owner).toBe("agent");
    }
  });
});

function mockProvider(content: string): LLMProvider {
  return {
    id: "mock",
    name: "Mock",
    async complete() {
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
  };
}

function fullAnswerSet() {
  return {
    "canon.format": "tv_series",
    "canon.title": "Signal Harbor",
    "canon.logline": "A disgraced harbor dispatcher uncovers a criminal weather network while trying to rebuild her life.",
    "canon.genre": "thriller",
    "canon.tone": ["moody", "prestige"],
    "canon.world_setting": "A storm-battered port city in the near future.",
    "canon.audience": ["adults 25-45", "thriller fans"],
    "canon.comps": ["Mare of Easttown", "Dark Winds"],
    "canon.duration_count": "8 episodes, 45 minutes each",
    "canon.characters": [
      { id: "maya-vale", name: "Maya Vale", role: "dispatcher", description: "A gifted but isolated harbor dispatcher.", visibility: "internal" },
      { id: "rene-ortiz", name: "Rene Ortiz", role: "investigator", description: "A local investigator with a grudge.", visibility: "internal" },
    ],
    "canon.episodes": [
      { code: "S01E01", title: "Low Tide", logline: "Maya intercepts a strange signal tied to a missing trawler.", status: "planned", visibility: "internal" },
      { code: "S01E01", title: "Black Water", logline: "A second signal points to corruption inside the port authority.", status: "planned", visibility: "internal" },
    ],
    "canon.themes": ["trust", "survival", "institutional decay"],
    "canon.production_assumptions": ["mid-budget streaming drama", "coastal night shoots"],
  };
}
