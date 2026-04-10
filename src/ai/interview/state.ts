import crypto from "node:crypto";

export interface InterviewMessage {
  role: "interviewer" | "user";
  content: string;
  timestamp: string;
}

export interface InterviewState {
  sessionId: string;
  slug: string;
  phase: 1 | 2 | 3 | 4 | "complete";
  questionIndex: number;
  answers: Record<string, unknown>;
  messages: InterviewMessage[];
  startedAt: string;
  updatedAt: string;
  provider?: string;
  model?: string;
}

export function createSession(): InterviewState {
  const sessionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  return {
    sessionId,
    slug: sessionId,
    phase: 1,
    questionIndex: 0,
    answers: {},
    messages: [],
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isComplete(state: InterviewState): boolean {
  return state.phase === "complete";
}
