export type IterationDirectiveType =
  | "new_character"
  | "new_episode"
  | "develop_character"
  | "develop_episode"
  | "new_storyline"
  | "develop_themes"
  | "world_expansion"
  | "suggest_next"
  | "custom";

export type IterationMode = "autonomous" | "gated" | "confidence";

export type IterationRunStatus =
  | "pending"
  | "running"
  | "awaiting_review"
  | "accepted"
  | "rejected"
  | "partial"
  | "error";

export interface IterationDirective {
  type: IterationDirectiveType;
  instruction: string;
  targetId?: string;
  constraints?: string[];
  steeringNote?: string;
}

export interface IterationSuggestedDirective {
  type: IterationDirectiveType;
  instruction: string;
  targetId?: string;
}

export interface IterationProposal {
  proposalId: string;
  runId: string;
  field: string;
  operation: "add" | "update" | "append";
  value: unknown;
  rationale: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  acceptedAt?: string;
  rejectedAt?: string;
}

export interface IterationRun {
  runId: string;
  sessionId: string;
  runNumber: number;
  directive: IterationDirective;
  canonSnapshot: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  status: IterationRunStatus;
  proposals: IterationProposal[];
  summary?: string;
  confidence: number;
  error?: string;
  suggestedNextDirectives?: IterationSuggestedDirective[];
}

export interface IterationSession {
  sessionId: string;
  projectSlug: string;
  mode: IterationMode;
  maxRuns: number;
  confidenceThreshold: number;
  completedRuns: number;
  status: "running" | "paused" | "complete" | "stopped" | "error";
  runs: IterationRun[];
  startedAt: string;
  updatedAt: string;
  provider?: string;
  model?: string;
  pendingSteeringNote?: string;
}
