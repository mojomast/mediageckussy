import { describe, expect, test } from "vitest";
import { MockLLMProvider } from "../../ai/providers/index.js";
import { buildIterationContext } from "../../ai/iteration/context.js";
import {
  applyProposals,
  buildNextDirective,
  runIterationStep,
  shouldPauseForHITL,
} from "../../ai/iteration/runner.js";
import { createIterationSession } from "../../ai/iteration/session.js";
import type { IterationDirective, IterationRun, IterationSession } from "../../ai/iteration/types.js";
import type { CanonProject } from "../../core/types.js";

describe("iteration engine", () => {
  test("buildIterationContext with a full canon stays under 2500 approximate tokens", () => {
    const canon = buildCanon();
    const session = createSessionWithHistory();
    const directive: IterationDirective = {
      type: "new_storyline",
      instruction: "Create a new three-episode arc.",
    };

    const context = buildIterationContext(canon, session, directive);

    expect(Math.ceil(context.length / 4)).toBeLessThanOrEqual(2500);
  });

  test("buildIterationContext marks locked fields", () => {
    const canon = buildCanon();
    canon.canon.tone.status = "locked";
    canon.canon.world_setting.status = "locked";

    const context = buildIterationContext(canon, createSessionWithHistory(), {
      type: "world_expansion",
      instruction: "Add locations.",
    });

    expect(context).toContain("[LOCKED: do not modify]");
  });

  test("buildIterationContext includes only last 3 run summaries", () => {
    const context = buildIterationContext(buildCanon(), createSessionWithHistory(), {
      type: "suggest_next",
      instruction: "Suggest the next steps.",
    });

    expect(context).toContain("Run 2:");
    expect(context).toContain("Run 3:");
    expect(context).toContain("Run 4:");
    expect(context).not.toContain("Run 1:");
  });

  test("runIterationStep with valid JSON returns proposals with proposalIds", async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({
        summary: "Adds a new character tied to the signal conspiracy.",
        confidence: 0.84,
        proposals: [
          {
            field: "canon.characters",
            operation: "add",
            value: {
              id: "vera-moss",
              name: "Vera Moss",
              role: "field liaison",
              description: "A capable handler whose loyalty is under strain.",
              visibility: "internal",
            },
            rationale: "This creates a useful pressure point around institutional trust.",
            confidence: 0.84,
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
    ]);

    const run = await runIterationStep(
      createSessionWithHistory(),
      { type: "new_character", instruction: "Add a new government handler." },
      buildCanon(),
      provider,
    );

    expect(run.status).not.toBe("error");
    expect(run.proposals[0]?.proposalId).toBeTruthy();
    expect(run.suggestedNextDirectives?.[0]?.targetId).toBe("vera-moss");
  });

  test("runIterationStep with malformed JSON returns error status", async () => {
    const provider = new MockLLMProvider(["not json"]);

    const run = await runIterationStep(
      createSessionWithHistory(),
      { type: "new_character", instruction: "Add a new government handler." },
      buildCanon(),
      provider,
    );

    expect(run.status).toBe("error");
  });

  test("applyProposals with add operation pushes to array field", async () => {
    const session = createSessionWithHistory();
    const run = baseRun({
      proposals: [
        {
          proposalId: "proposal-add",
          runId: "run-1",
          field: "canon.characters",
          operation: "add",
          value: {
            id: "vera-moss",
            name: "Vera Moss",
            role: "field liaison",
            description: "A capable handler whose loyalty is under strain.",
            visibility: "internal",
          },
          rationale: "Adds pressure to the ensemble.",
          confidence: 0.9,
          status: "pending",
        },
      ],
    });

    const nextCanon = await applyProposals(session, run, buildCanon(), ["proposal-add"]);

    expect(nextCanon.canon.characters.value).toHaveLength(3);
    expect(run.proposals[0]?.status).toBe("accepted");
  });

  test("applyProposals with update operation replaces field value", async () => {
    const session = createSessionWithHistory();
    const run = baseRun({
      proposals: [
        {
          proposalId: "proposal-update",
          runId: "run-1",
          field: "canon.logline",
          operation: "update",
          value: "A relay station conspiracy threatens the last honest signal.",
          rationale: "Sharpens the central tension.",
          confidence: 0.92,
          status: "pending",
        },
      ],
    });

    const nextCanon = await applyProposals(session, run, buildCanon(), ["proposal-update"]);

    expect(nextCanon.canon.logline.value).toBe("A relay station conspiracy threatens the last honest signal.");
  });

  test("applyProposals normalizes iteration episode payloads to canon schema", async () => {
    const session = createSessionWithHistory();
    const run = baseRun({
      proposals: [
        {
          proposalId: "proposal-episode",
          runId: "run-1",
          field: "canon.episodes",
          operation: "add",
          value: {
            code: "S01E03",
            title: "Dead Frequency",
            logline: "Dara and Vera trace the signal to a relay station.",
            featured_characters: ["dara-osei", "vera-moss"],
            story_function: "Escalates the conspiracy.",
          },
          rationale: "Adds the next escalation.",
          confidence: 0.88,
          status: "pending",
        },
      ],
    });

    const nextCanon = await applyProposals(session, run, buildCanon(), ["proposal-episode"]);

    expect(nextCanon.canon.episodes.value[2]).toEqual({
      code: "S01E03",
      title: "Dead Frequency",
      logline: "Dara and Vera trace the signal to a relay station.",
      status: "planned",
      visibility: "internal",
    });
  });

  test("shouldPauseForHITL returns true for gated mode", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "gated", maxRuns: 5 });
    expect(shouldPauseForHITL(session, baseRun())).toBe(true);
  });

  test("shouldPauseForHITL returns true for confidence mode below threshold", () => {
    const session = createIterationSession({
      projectSlug: "signal-harbor",
      mode: "confidence",
      maxRuns: 5,
      confidenceThreshold: 0.75,
    });

    expect(shouldPauseForHITL(session, baseRun({ confidence: 0.71 }))).toBe(true);
  });

  test("shouldPauseForHITL returns true for error runs", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "autonomous", maxRuns: 5 });
    expect(shouldPauseForHITL(session, baseRun({ status: "error" }))).toBe(true);
  });

  test("buildNextDirective returns null when completedRuns reaches maxRuns", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "autonomous", maxRuns: 2 });
    session.completedRuns = 2;

    expect(buildNextDirective(session, baseRun(), buildCanon())).toBeNull();
  });

  test("buildNextDirective prefers a different canon section so the loop builds outward", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "autonomous", maxRuns: 6 });
    session.completedRuns = 1;
    session.runs = [
      baseRun({
        runNumber: 1,
        directive: { type: "new_character", instruction: "Add a new character." },
      }),
    ];

    const next = buildNextDirective(session, baseRun({
      directive: { type: "develop_character", instruction: "Deepen Dara Osei.", targetId: "dara-osei" },
      suggestedNextDirectives: [
        { type: "develop_character", instruction: "Deepen Vera Moss.", targetId: "vera-moss" },
        { type: "new_episode", instruction: "Create an episode that tests the new alliance." },
      ],
    }), buildCanon());

    expect(["new_episode", "develop_episode"]).toContain(next?.type);
  });

  test("buildNextDirective falls back to completeness-driven adjacent work when needed", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "autonomous", maxRuns: 6 });
    session.completedRuns = 1;

    const next = buildNextDirective(session, baseRun({
      directive: { type: "new_character", instruction: "Add Vera Moss." },
      suggestedNextDirectives: [],
    }), buildCanon());

    expect(next).not.toBeNull();
    expect(next?.type).not.toBe("new_character");
  });

  test("createIterationSession returns a running session", () => {
    const session = createIterationSession({ projectSlug: "signal-harbor", mode: "gated", maxRuns: 5 });

    expect(session.status).toBe("running");
    expect(session.completedRuns).toBe(0);
    expect(session.confidenceThreshold).toBe(0.75);
    expect(session.planner.strategy).toBe("coverage");
    expect(session.planner.avoidRecentWindow).toBe(2);
  });

  test("buildNextDirective honors coverage targets for under-covered sections", () => {
    const session = createIterationSession({
      projectSlug: "signal-harbor",
      mode: "autonomous",
      maxRuns: 6,
      planner: {
        strategy: "coverage",
        avoidRecentWindow: 2,
        sectionTargets: { characters: 1, episodes: 2, world: 1 },
      },
    });
    session.completedRuns = 2;
    session.runs = [
      baseRun({ directive: { type: "new_character", instruction: "Add Vera Moss." } }),
      baseRun({ directive: { type: "develop_character", instruction: "Deepen Vera Moss.", targetId: "vera-moss" }, runNumber: 2 }),
    ];

    const next = buildNextDirective(session, baseRun({
      runNumber: 2,
      directive: { type: "develop_character", instruction: "Deepen Vera Moss.", targetId: "vera-moss" },
      suggestedNextDirectives: [
        { type: "world_expansion", instruction: "Add a relay station district." },
        { type: "new_episode", instruction: "Create an episode that uses Vera in the field." },
      ],
    }), buildCanon());

    expect(["new_episode", "develop_episode"]).toContain(next?.type);
  });
});

function createSessionWithHistory(): IterationSession {
  const session = createIterationSession({ projectSlug: "signal-harbor", mode: "autonomous", maxRuns: 5 });
  session.completedRuns = 4;
  session.runs = [
    baseRun({ runId: "run-1", runNumber: 1, summary: "Introduced Dara's core mystery." }),
    baseRun({ runId: "run-2", runNumber: 2, summary: "Expanded Reyes and the station chain of command." }),
    baseRun({ runId: "run-3", runNumber: 3, summary: "Added episode escalation around the first relay tower." }),
    baseRun({ runId: "run-4", runNumber: 4, summary: "Proposed a new broadcast pattern that hints at sabotage." }),
  ];
  return session;
}

function baseRun(overrides: Partial<IterationRun> = {}): IterationRun {
  return {
    runId: overrides.runId ?? "run-0",
    sessionId: overrides.sessionId ?? "session-1",
    runNumber: overrides.runNumber ?? 1,
    directive: overrides.directive ?? { type: "new_character", instruction: "Add a new character." },
    canonSnapshot: overrides.canonSnapshot ?? {},
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? new Date().toISOString(),
    status: overrides.status ?? "pending",
    proposals: overrides.proposals ?? [],
    summary: overrides.summary ?? "Introduced a new canon development.",
    confidence: overrides.confidence ?? 0.88,
    error: overrides.error,
    suggestedNextDirectives: overrides.suggestedNextDirectives ?? [
      {
        type: "develop_character",
        instruction: "Deepen Dara Osei.",
        targetId: "dara-osei",
      },
    ],
  };
}

function buildCanon(): CanonProject {
  const now = new Date().toISOString();
  return {
    id: "signal-harbor",
    slug: "signal-harbor",
    package_tier: "standard",
    outputs: {
      website: { enabled: true },
      press_bundle: { enabled: true },
      partner_bundle: { enabled: true },
    },
    canon: {
      title: field("Signal Harbor", now, "locked"),
      logline: field("A disgraced engineer chases a hostile broadcast through a collapsing port city.", now),
      format: field("tv_series", now, "locked"),
      genre: field("Sci-fi thriller", now),
      tone: field(["tense", "haunted", "grounded"], now),
      audience: field(["adult genre fans"], now),
      comps: field(["Dark", "Severance"], now),
      duration_count: field("8 x 45 min", now),
      themes: field([
        "institutional decay",
        "trust under surveillance",
        "memory as evidence",
        "the cost of obedience",
      ], now),
      world_setting: field(
        "Signal Harbor is a storm-battered relay city built around obsolete communications infrastructure. Its docks, signal towers, flood tunnels, and municipal archives are all layered with decades of sealed emergencies, privatized fixes, and the residue of past evacuations.",
        now,
      ),
      production_assumptions: field(["modular sets", "night exteriors"], now),
      business_assumptions: field(["streaming-first release"], now),
      legal_assumptions: field(["fictional institutions only"], now),
      publication_flags: field({ site_enabled: true }, now),
      characters: field([
        {
          id: "dara-osei",
          name: "Dara Osei",
          role: "disgraced engineer",
          description: "Methodical, isolated, and convinced the relay network is replaying hidden state violence back at the city.",
          visibility: "internal",
        },
        {
          id: "reyes",
          name: "Station Commander Reyes",
          role: "station commander",
          description: "A rigid operations chief trying to keep the harbor functional long enough to survive the next public failure.",
          visibility: "internal",
        },
      ], now),
      episodes: field([
        {
          code: "S01E01",
          title: "Dead Air",
          logline: "Dara intercepts a signal that contains fragments of a disaster report that never entered the archive.",
          status: "planned",
          visibility: "internal",
        },
        {
          code: "S01E02",
          title: "Flood Channel",
          logline: "A maintenance dive reveals that one relay shaft has been repurposed into a sealed evidence cache.",
          status: "planned",
          visibility: "internal",
        },
      ], now),
      structure: field([], now),
    },
  };
}

function field<T>(value: T, updatedAt: string, status: "draft" | "approved" | "locked" | "deprecated" = "draft") {
  return {
    value,
    status,
    owner: status === "locked" ? "user" as const : "agent" as const,
    updated_at: updatedAt,
    confidence: status === "locked" ? 1 : 0.8,
    downstream_dependencies: [],
    visibility: "internal" as const,
  };
}
