import crypto from "node:crypto";
import type { CanonProject } from "../../core/types.js";
import type { LLMProvider } from "../providers/types.js";
import { buildIterationContext, buildIterationSnapshot } from "./context.js";
import { buildDirectivePrompt } from "./directives.js";
import type {
  IterationDirective,
  IterationProposal,
  IterationRun,
  IterationSession,
} from "./types.js";

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
  humanSteeringNote?: string,
): IterationDirective | null {
  if (session.completedRuns >= session.maxRuns) {
    return null;
  }

  const next = lastRun.suggestedNextDirectives?.[0];
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
  const { parent, key } = resolveParent(canon as unknown as Record<string, unknown>, proposal.field);

  if (proposal.operation === "add") {
    const current = parent[key];
    const nextArray = Array.isArray(current) ? current : [];
    nextArray.push(proposal.value);
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
    nextArray.push(proposal.value);
    parent[key] = nextArray;
    return;
  }

  parent[key] = proposal.value;
}

function resolveParent(root: Record<string, unknown>, fieldPath: string) {
  const segments = tokenizePath(fieldPath);
  if (segments.length < 2 || segments[0].key !== "canon") {
    throw new Error(`Unknown canon field path: ${fieldPath}`);
  }

  let cursor: unknown = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor || typeof cursor !== "object") {
      throw new Error(`Unknown canon field path: ${fieldPath}`);
    }

    const objectCursor = cursor as Record<string, unknown>;
    if (!(segment.key in objectCursor)) {
      objectCursor[segment.key] = index === 0 ? {} : [];
    }

    cursor = objectCursor[segment.key];
    if (index > 0 && isCanonField(cursor) && segments[index + 1]) {
      cursor = cursor.value;
    }

    if (segment.selector != null) {
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
