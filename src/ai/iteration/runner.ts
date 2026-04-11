import crypto from "node:crypto";
import type {
  CanonProject,
  FactionEntry,
  LocationEntry,
  MotifEntry,
  StorylineEntry,
  ThemeEntry,
  WorldLoreEntry,
} from "../../core/types.js";
import type { LLMProvider } from "../providers/types.js";
import { analyzeCanonCompleteness } from "./completeness.js";
import { buildIterationContext, buildIterationSnapshot } from "./context.js";
import { buildDirectivePrompt } from "./directives.js";
import type {
  IterationCanonSection,
  IterationDirective,
  IterationProposal,
  IterationRun,
  IterationSession,
} from "./types.js";

const OPTIONAL_CANON_ARRAY_FIELDS = new Set([
  "storylines",
  "locations",
  "world_lore",
  "motifs",
  "themes_structured",
  "factions",
  "structure",
]);

export async function runIterationStep(
  session: IterationSession,
  directive: IterationDirective,
  canon: CanonProject,
  provider: LLMProvider,
): Promise<IterationRun> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const runNumber = session.completedRuns + 1;
  const canonSnapshot = buildIterationSnapshot(canon);

  try {
    const context = buildIterationContext(canon, session, directive);
    const prompt = buildDirectivePrompt(directive, context);
    const response = await provider.complete({
      system: prompt.system,
      user: prompt.user,
      responseFormat: "json",
    });
    const parsed = parseIterationResponse(response.content);

    if (!isValidIterationPayload(parsed)) {
      return {
        runId,
        sessionId: session.sessionId,
        runNumber,
        directive,
        canonSnapshot,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "error",
        proposals: [],
        confidence: 0,
        error: response.content,
      };
    }

    return {
      runId,
      sessionId: session.sessionId,
      runNumber,
      directive,
      canonSnapshot,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "pending",
      proposals: parsed.proposals.map((proposal) => ({
        proposalId: crypto.randomUUID(),
        runId,
        field: String(proposal.field),
        operation: proposal.operation,
        value: proposal.value,
        rationale: String(proposal.rationale ?? ""),
        confidence: clampConfidence(Number(proposal.confidence ?? 0)),
        status: "pending",
      })),
      summary: String(parsed.summary),
      confidence: clampConfidence(Number(parsed.confidence)),
      suggestedNextDirectives: Array.isArray(parsed.suggestedNextDirectives)
        ? parsed.suggestedNextDirectives
            .filter(isSuggestedDirective)
            .map((item) => ({
              type: item.type,
              instruction: item.instruction,
              targetId: item.targetId,
            }))
        : [],
    };
  } catch (error) {
    return {
      runId,
      sessionId: session.sessionId,
      runNumber,
      directive,
      canonSnapshot,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "error",
      proposals: [],
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyProposals(
  _session: IterationSession,
  run: IterationRun,
  canon: CanonProject,
  accepted: string[],
): Promise<CanonProject> {
  const acceptedIds = new Set(accepted);
  const nextCanon = structuredClone(canon) as CanonProject;
  const timestamp = new Date().toISOString();

  for (const proposal of run.proposals) {
    if (acceptedIds.has(proposal.proposalId)) {
      applyProposal(nextCanon, proposal);
      proposal.status = "accepted";
      proposal.acceptedAt = timestamp;
      proposal.rejectedAt = undefined;
      continue;
    }

    proposal.status = "rejected";
    proposal.rejectedAt = timestamp;
    proposal.acceptedAt = undefined;
  }

  return nextCanon;
}

export function shouldPauseForHITL(
  session: IterationSession,
  run: IterationRun,
): boolean {
  if (run.status === "error") {
    return true;
  }

  if (session.mode === "gated") {
    return true;
  }

  return session.mode === "confidence" && run.confidence < session.confidenceThreshold;
}

export function buildNextDirective(
  session: IterationSession,
  lastRun: IterationRun,
  canon: CanonProject,
  humanSteeringNote?: string,
): IterationDirective | null {
  if (session.completedRuns >= session.maxRuns) {
    return null;
  }

  const next = chooseNextDirective(session, lastRun, canon);
  if (!next) {
    return null;
  }

  return {
    type: next.type,
    instruction: next.instruction,
    targetId: next.targetId,
    steeringNote: humanSteeringNote,
  };
}

function chooseNextDirective(session: IterationSession, lastRun: IterationRun, canon: CanonProject) {
  const completeness = analyzeCanonCompleteness(canon);
  const modelSuggestions = lastRun.suggestedNextDirectives ?? [];
  const structuralSuggestions = completeness.suggestedDirectives;
  const recentSections = session.runs
    .slice(-Math.max(1, session.planner.avoidRecentWindow))
    .map((run) => sectionForDirective(run.directive.type));
  const preferredSections = nextSectionsFor(sectionForDirective(lastRun.directive.type));
  const candidates = [...modelSuggestions, ...structuralSuggestions];
  const sectionCounts = countSections(session);
  const targetSections = underCoveredSections(session, sectionCounts);

  if (candidates.length === 0) {
    return undefined;
  }

  const scored = candidates.map((candidate, index) => {
    const section = sectionForDirective(candidate.type);
    let score = 0;

    if (section !== sectionForDirective(lastRun.directive.type)) {
      score += 4;
    }

    const preferredIndex = preferredSections.indexOf(section);
    if (preferredIndex >= 0) {
      score += preferredSections.length - preferredIndex;
    }

    if (!recentSections.includes(section)) {
      score += 3;
    }

    if (session.planner.strategy === "coverage" && targetSections.includes(section)) {
      score += 5;
    }

    if (session.planner.strategy === "coverage" && recentSections.includes(section)) {
      score -= 4;
    }

    if (structuralSuggestions.some((suggestion) => directivesMatch(suggestion, candidate))) {
      score += 2;
    }

    if (modelSuggestions.some((suggestion) => directivesMatch(suggestion, candidate))) {
      score += 1;
    }

    score -= index * 0.01;
    return { candidate, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.candidate;
}

function countSections(session: IterationSession) {
  return session.runs.reduce<Record<IterationCanonSection, number>>((counts, run) => {
    const section = sectionForDirective(run.directive.type);
    counts[section] += 1;
    return counts;
  }, {
    characters: 0,
    episodes: 0,
    storylines: 0,
    themes: 0,
    world: 0,
    meta: 0,
  });
}

function underCoveredSections(session: IterationSession, counts: Record<IterationCanonSection, number>) {
  return (Object.entries(session.planner.sectionTargets) as Array<[IterationCanonSection, number | undefined]>)
    .filter((entry): entry is [IterationCanonSection, number] => typeof entry[1] === "number")
    .filter(([section, target]) => counts[section] < target)
    .map(([section]) => section);
}

function directivesMatch(left: { type: IterationDirective["type"]; targetId?: string; instruction: string }, right: { type: IterationDirective["type"]; targetId?: string; instruction: string }) {
  return left.type === right.type && left.targetId === right.targetId && left.instruction === right.instruction;
}

function nextSectionsFor(section: IterationCanonSection) {
  switch (section) {
    case "characters":
      return ["episodes", "themes", "world", "storylines", "meta"];
    case "episodes":
      return ["storylines", "characters", "world", "themes", "meta"];
    case "storylines":
      return ["episodes", "themes", "characters", "world", "meta"];
    case "themes":
      return ["world", "storylines", "episodes", "characters", "meta"];
    case "world":
      return ["characters", "episodes", "storylines", "themes", "meta"];
    case "meta":
    default:
      return ["characters", "episodes", "storylines", "themes", "world"];
  }
}

function sectionForDirective(type: IterationDirective["type"]): IterationCanonSection {
  switch (type) {
    case "new_character":
    case "develop_character":
      return "characters";
    case "new_episode":
    case "develop_episode":
      return "episodes";
    case "new_storyline":
      return "storylines";
    case "develop_themes":
      return "themes";
    case "world_expansion":
      return "world";
    case "suggest_next":
    case "custom":
    default:
      return "meta";
  }
}

function parseIterationResponse(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body);
}

function isValidIterationPayload(value: unknown): value is {
  summary: string;
  confidence: number;
  proposals: Array<{
    field: string;
    operation: IterationProposal["operation"];
    value: unknown;
    rationale: string;
    confidence: number;
  }>;
  suggestedNextDirectives?: Array<{ type: IterationDirective["type"]; instruction: string; targetId?: string }>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string" || typeof candidate.confidence !== "number" || !Array.isArray(candidate.proposals)) {
    return false;
  }

  return candidate.proposals.every((proposal) => {
    if (!proposal || typeof proposal !== "object") {
      return false;
    }

    const entry = proposal as Record<string, unknown>;
    return typeof entry.field === "string"
      && (entry.operation === "add" || entry.operation === "update" || entry.operation === "append")
      && typeof entry.rationale === "string"
      && typeof entry.confidence === "number";
  });
}

function isSuggestedDirective(value: unknown): value is { type: IterationDirective["type"]; instruction: string; targetId?: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.type === "string" && typeof candidate.instruction === "string";
}

function clampConfidence(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function applyProposal(canon: CanonProject, proposal: IterationProposal) {
  const normalizedValue = normalizeProposalValue(proposal);
  const { parent, key } = resolveParent(canon as unknown as Record<string, unknown>, proposal.field);

  if (proposal.operation === "add") {
    const current = parent[key];
    const nextArray = Array.isArray(current) ? current : [];
    nextArray.push(normalizedValue);
    parent[key] = nextArray;
    return;
  }

  if (proposal.operation === "append") {
    const current = parent[key];
    if (typeof current === "string") {
      parent[key] = `${current}${proposal.value == null ? "" : String(proposal.value)}`;
      return;
    }

    const nextArray = Array.isArray(current) ? current : [];
    nextArray.push(normalizedValue);
    parent[key] = nextArray;
    return;
  }

  parent[key] = normalizedValue;
}

function normalizeProposalValue(proposal: IterationProposal) {
  if (proposal.field === "canon.characters" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const value = proposal.value as Record<string, unknown>;
    return {
      id: String(value.id ?? ""),
      name: String(value.name ?? ""),
      role: String(value.role ?? ""),
      description: String(value.description ?? ""),
      visibility: value.visibility === "public" ? "public" : "internal",
    };
  }

  if (proposal.field === "canon.episodes" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const value = proposal.value as Record<string, unknown>;
    return {
      code: String(value.code ?? ""),
      title: String(value.title ?? ""),
      logline: String(value.logline ?? ""),
      status: value.status === "draft" || value.status === "approved" ? value.status : "planned",
      visibility: value.visibility === "public" ? "public" : "internal",
    };
  }

  if (proposal.field === "canon.structure" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const value = proposal.value as Record<string, unknown>;
    return {
      id: String(value.id ?? ""),
      title: String(value.title ?? ""),
      summary: String(value.summary ?? ""),
      visibility: value.visibility === "public" ? "public" : "internal",
    };
  }

  if (proposal.field === "canon.storylines" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      title: String(v.title ?? ""),
      logline: String(v.logline ?? ""),
      episodes: Array.isArray(v.episodes) ? v.episodes.map(String) : [],
      characters: Array.isArray(v.characters) ? v.characters.map(String) : [],
      theme_connection: String(v.theme_connection ?? ""),
      arc_shape: Array.isArray(v.arc_shape) ? v.arc_shape.map(String) : [],
      visibility: v.visibility === "public" ? "public" : "internal",
    } satisfies StorylineEntry;
  }

  if (proposal.field === "canon.locations" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      name: String(v.name ?? ""),
      description: String(v.description ?? ""),
      atmosphere: String(v.atmosphere ?? ""),
      frequent_characters: Array.isArray(v.frequent_characters) ? v.frequent_characters.map(String) : [],
      visibility: v.visibility === "public" ? "public" : "internal",
    } satisfies LocationEntry;
  }

  if (proposal.field === "canon.world_lore" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      fact: String(v.fact ?? ""),
      narrative_implication: String(v.narrative_implication ?? ""),
    } satisfies WorldLoreEntry;
  }

  if (proposal.field === "canon.motifs" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      description: String(v.description ?? ""),
      theme_connection: v.theme_connection ? String(v.theme_connection) : undefined,
    } satisfies MotifEntry;
  }

  if (proposal.field === "canon.themes_structured" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      label: String(v.label ?? v.theme ?? ""),
      theme_expression: v.theme_expression ? String(v.theme_expression) : undefined,
      motif: v.motif ? String(v.motif) : undefined,
    } satisfies ThemeEntry;
  }

  if (proposal.field === "canon.factions" && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)) {
    const v = proposal.value as Record<string, unknown>;
    return {
      id: String(v.id ?? crypto.randomUUID()),
      name: String(v.name ?? ""),
      description: String(v.description ?? ""),
      allegiance: v.allegiance ? String(v.allegiance) : undefined,
      members: Array.isArray(v.members) ? v.members.map(String) : [],
      visibility: v.visibility === "public" ? "public" : "internal",
    } satisfies FactionEntry;
  }

  if (/^canon\.characters\[.+\]\.backstory$/.test(proposal.field) && proposal.value != null) {
    return Array.isArray(proposal.value)
      ? proposal.value.map(String)
      : [String(proposal.value)];
  }

  if (
    /^canon\.characters\[.+\]\.initial_relationships$/.test(proposal.field)
    && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)
  ) {
    const v = proposal.value as Record<string, unknown>;
    return {
      characterId: String(v.characterId ?? v.character_id ?? ""),
      dynamic: String(v.dynamic ?? ""),
    };
  }

  if (/^canon\.characters\[.+\]\.episode_hooks$/.test(proposal.field) && proposal.value != null) {
    return String(proposal.value);
  }

  if (
    /^canon\.episodes\[.+\]\.scenes$/.test(proposal.field)
    && proposal.value && typeof proposal.value === "object" && !Array.isArray(proposal.value)
  ) {
    const v = proposal.value as Record<string, unknown>;
    return {
      scene_number: typeof v.scene_number === "number" ? v.scene_number : 1,
      location: String(v.location ?? ""),
      characters: Array.isArray(v.characters) ? v.characters.map(String) : [],
      beat: String(v.beat ?? ""),
    };
  }

  if (/^canon\.episodes\[.+\]\.featured_characters$/.test(proposal.field) && proposal.value != null) {
    return String(proposal.value);
  }

  return proposal.value;
}

function resolveParent(root: Record<string, unknown>, fieldPath: string) {
  const segments = tokenizePath(fieldPath);
  if (segments.length < 2 || segments[0].key !== "canon") {
    throw new Error(`Unknown canon field path: ${fieldPath}`);
  }

  let cursor: unknown = root;
  let canonFieldUnwrapped = false;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor || typeof cursor !== "object") {
      throw new Error(`Unknown canon field path: ${fieldPath}`);
    }

    if (!canonFieldUnwrapped && isCanonField(cursor) && index > 0) {
      cursor = (cursor as { value: unknown }).value;
      canonFieldUnwrapped = true;
      index -= 1;
      continue;
    }

    const objectCursor = cursor as Record<string, unknown>;
    if (!(segment.key in objectCursor)) {
      if (index === 0) {
        objectCursor[segment.key] = {};
      } else if (index === 1 && OPTIONAL_CANON_ARRAY_FIELDS.has(segment.key)) {
        objectCursor[segment.key] = {
          value: [],
          status: "draft",
          owner: "agent",
          updated_at: new Date().toISOString(),
          confidence: 0,
          downstream_dependencies: [],
          visibility: "internal",
        };
      } else {
        objectCursor[segment.key] = [];
      }
    }

    cursor = objectCursor[segment.key];
    canonFieldUnwrapped = false;

    if (segment.selector != null) {
      if (isCanonField(cursor)) {
        cursor = (cursor as { value: unknown }).value;
      }

      if (!Array.isArray(cursor)) {
        throw new Error(`Field path does not resolve to an array: ${fieldPath}`);
      }

      const resolvedIndex = resolveArrayIndex(cursor, segment.selector);
      if (resolvedIndex === -1) {
        throw new Error(`Unable to resolve selector "${segment.selector}" in ${fieldPath}`);
      }
      cursor = cursor[resolvedIndex];
    }
  }

  if (!cursor || typeof cursor !== "object") {
    throw new Error(`Unknown canon field path: ${fieldPath}`);
  }

  const finalSegment = segments[segments.length - 1];
  const objectCursor = cursor as Record<string, unknown>;

  if (segments.length === 2 && isCanonField(objectCursor[finalSegment.key])) {
    return { parent: objectCursor[finalSegment.key] as Record<string, unknown>, key: "value" };
  }

  if (finalSegment.selector != null) {
    const target = objectCursor[finalSegment.key];
    if (!Array.isArray(target)) {
      objectCursor[finalSegment.key] = [];
    }
    const arrayTarget = objectCursor[finalSegment.key] as unknown[];
    const resolvedIndex = resolveArrayIndex(arrayTarget, finalSegment.selector);
    if (resolvedIndex === -1) {
      throw new Error(`Unable to resolve selector "${finalSegment.selector}" in ${fieldPath}`);
    }
    return { parent: arrayTarget as unknown as Record<string, unknown>, key: String(resolvedIndex) };
  }

  return { parent: objectCursor, key: finalSegment.key };
}

function tokenizePath(fieldPath: string) {
  return fieldPath.split(".").map((segment) => {
    const match = segment.match(/^([^\[]+)(?:\[(.+)\])?$/);
    if (!match) {
      throw new Error(`Invalid field path: ${fieldPath}`);
    }
    return {
      key: match[1],
      selector: match[2],
    };
  });
}

function resolveArrayIndex(items: unknown[], selector: string) {
  if (/^\d+$/.test(selector)) {
    const index = Number(selector);
    return index >= 0 && index < items.length ? index : -1;
  }

  return items.findIndex((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return record.id === selector || record.code === selector;
  });
}

function isCanonField(value: unknown): value is { value: unknown } {
  return Boolean(value) && typeof value === "object" && "value" in (value as Record<string, unknown>);
}
