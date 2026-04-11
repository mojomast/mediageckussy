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

  test("getNextQuestion uses podcast-specific structure question instead of story world prompt", () => {
    const session = createSession();
    session.answers["canon.format"] = "podcast";
    session.answers["canon.title"] = "Project";
    session.answers["canon.logline"] = "A podcast.";
    session.answers["canon.genre"] = "comedy";
    session.answers["canon.tone"] = ["loose"];

    expect(getNextQuestion(session)?.prompt).toBe("What's the core setup of the show - the format, recurring segments, or frame listeners can expect each episode?");
  });

  test("getNextQuestion uses podcast host framing instead of story protagonist framing", () => {
    const session = createSession();
    session.answers = {
      "canon.format": "podcast",
      "canon.title": "Project",
      "canon.logline": "A podcast.",
      "canon.genre": "comedy",
      "canon.tone": ["loose"],
      "canon.world_setting": "Panel hangout format.",
      "canon.audience": ["developers"],
      "canon.comps": ["Comp One"],
      "canon.duration_count": "weekly, 45 minutes",
    };

    expect(getNextQuestion(session)?.prompt).toBe("Who is the main host or on-mic voice we should anchor around? Name and a brief description.");
  });

  test("getNextQuestion continues to optional follow-ups after required questions are answered", () => {
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

    expect(getNextQuestion(session)?.index).toBe(10);
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

  test("runInterviewTurn uses the scripted next question instead of model-invented follow-ups", async () => {
    const state = createSession();
    const provider = mockProvider(`A TV series! That's exciting.\n\nTo get a better sense of the scope, is this a single-camera or multi-camera production?\n<!-- EXTRACT: {"field":"canon.format","value":"tv_series"} -->`);

    const result = await runInterviewTurn(state, "TV series", provider);

    expect(result.response).toContain("What's your project called?");
    expect(result.response).not.toContain("single-camera or multi-camera");
  });

  test("runInterviewTurn with null extraction does not store value", async () => {
    const state = createSession();
    const provider = mockProvider(`I want to make sure I understand. What kind of project is this?\n<!-- EXTRACT: {"field":"canon.format","value":null} -->`);

    const result = await runInterviewTurn(state, "maybe screen-based", provider);

    expect(result.updatedState.answers["canon.format"]).toBeUndefined();
  });

  test("runInterviewTurn normalizes human-readable format labels for question gating", async () => {
    const state = createSession();
    const provider = mockProvider(`A TV series sounds exciting!\n<!-- EXTRACT: {"field":"canon.format","value":"TV series"} -->`);

    const result = await runInterviewTurn(state, "TV series", provider);

    expect(result.updatedState.answers["canon.format"]).toBe("tv_series");
  });

  test("runInterviewTurn skips optional follow-up when user says done", async () => {
    const state = createSession();
    state.answers = {
      "canon.format": "tv_series",
      "canon.title": "Project",
      "canon.logline": "A project.",
      "canon.genre": "thriller",
      "canon.tone": ["moody"],
      "canon.world_setting": "A world.",
      "canon.audience": ["adults"],
      "canon.comps": ["Comp A"],
      "canon.duration_count": "8 episodes, 45 minutes each",
      "canon.characters": [{ id: "lead", name: "Lead", role: "lead", description: "desc", visibility: "internal" }],
    };
    const provider = mockProvider(`Okay, we'll move on from characters then.\n<!-- EXTRACT: {"field":"canon.characters","value":null} -->`);

    const result = await runInterviewTurn(state, "done", provider);

    expect(result.updatedState.skippedQuestionIndexes).toContain(10);
    expect(result.response).toContain("What happens in the first episode?");
  });

  test("runInterviewTurn falls back to parsing character answers when extract block is missing", async () => {
    const state = createSession();
    state.answers = {
      "canon.format": "tv_series",
      "canon.title": "Project",
      "canon.logline": "A project.",
      "canon.genre": "thriller",
      "canon.tone": ["moody"],
      "canon.world_setting": "A world.",
      "canon.audience": ["adults"],
      "canon.comps": ["Comp A"],
      "canon.duration_count": "8 episodes, 45 minutes each",
    };
    const provider = mockProvider("Dara Osei, a disgraced engineer who is methodical, paranoid, and the only one who believes the signal is real - got it!");

    const result = await runInterviewTurn(state, "Dara Osei, disgraced engineer, methodical and paranoid, the only one who believes the signal is real", provider);

    expect(result.updatedState.answers["canon.characters"]).toEqual([
      {
        id: "dara-osei",
        name: "Dara Osei",
        role: "disgraced engineer",
        description: "methodical and paranoid, the only one who believes the signal is real",
        visibility: "internal",
      },
    ]);
    expect(result.response).toContain("Anyone else important?");
  });

  test("runInterviewTurn falls back to parsing episode answers when extract block is missing", async () => {
    const state = createSession();
    state.answers = {
      "canon.format": "tv_series",
      "canon.title": "Project",
      "canon.logline": "A project.",
      "canon.genre": "thriller",
      "canon.tone": ["moody"],
      "canon.world_setting": "A world.",
      "canon.audience": ["adults"],
      "canon.comps": ["Comp A"],
      "canon.duration_count": "8 episodes, 45 minutes each",
      "canon.characters": [{ id: "lead", name: "Lead", role: "lead", description: "desc", visibility: "internal" }],
    };
    state.skippedQuestionIndexes = [10];
    const provider = mockProvider("\"Dead Air\" — Dara intercepts the first broadcast and realizes it contains her own voice.");

    const result = await runInterviewTurn(state, '"Dead Air" — Dara intercepts the first broadcast and realizes it contains her own voice', provider);

    expect(result.updatedState.answers["canon.episodes"]).toEqual([
      {
        code: "S01E01",
        title: "Dead Air",
        logline: "Dara intercepts the first broadcast and realizes it contains her own voice",
        status: "planned",
        visibility: "internal",
      },
    ]);
    expect(result.response).toContain("What about episode 2?");
  });

  test("buildCanonFromAnswers with full answer set produces valid CanonProject", () => {
    const state = createSession();
    state.answers = fullAnswerSet();

    const canon = buildCanonFromAnswers(state);

    expect(() => canonProjectSchema.parse(canon)).not.toThrow();
    expect(canon.canon.characters.value).toHaveLength(2);
    expect(canon.canon.episodes.value).toHaveLength(2);
  });

  test("buildCanonFromAnswers flattens malformed nested character arrays instead of failing schema parse", () => {
    const state = createSession();
    state.answers = {
      ...fullAnswerSet(),
      "canon.characters": [
        fullAnswerSet()["canon.characters"][0],
        [fullAnswerSet()["canon.characters"][1]],
      ],
    };

    const canon = buildCanonFromAnswers(state);

    expect(canon.canon.characters.value).toHaveLength(2);
    expect(canon.canon.characters.value[1].name).toBe("Rene Ortiz");
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
