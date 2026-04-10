import type { LLMProvider } from "../providers/types.js";
import { getNextQuestion } from "./questions.js";
import type { InterviewState } from "./state.js";

const OPTIONAL_SKIP_PATTERN = /^(skip|done|just the one|nothing specific)$/i;

export async function runInterviewTurn(
  state: InterviewState,
  userMessage: string,
  provider: LLMProvider,
): Promise<{
  response: string;
  updatedState: InterviewState;
  complete: boolean;
}> {
  const currentQuestion = getNextQuestion(state);
  if (!currentQuestion) {
    const completedState: InterviewState = {
      ...state,
      phase: "complete",
      updatedAt: new Date().toISOString(),
      messages: [
        ...state.messages,
        { role: "user", content: userMessage, timestamp: new Date().toISOString() },
      ],
    };
    return {
      response: "You’ve already covered everything I need. We’re ready to build your package.",
      updatedState: completedState,
      complete: true,
    };
  }

  const recentMessages = state.messages.slice(-6).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  const system = buildSystemPrompt({
    currentQuestion: currentQuestion.prompt,
    fieldPath: currentQuestion.fieldPath,
    fieldType: currentQuestion.fieldType,
    format: typeof state.answers["canon.format"] === "string" ? state.answers["canon.format"] : "unknown",
  });
  const response = await provider.complete({
    system,
    user: [
      recentMessages ? `Recent conversation:\n${recentMessages}` : "",
      `User response: ${userMessage}`,
      currentQuestion.hint ? `Question hint: ${currentQuestion.hint}` : "",
      currentQuestion.optional ? "This question is optional." : "",
    ].filter(Boolean).join("\n\n"),
  });

  const parsed = parseExtractBlock(response.content);
  const displayedResponse = stripExtractBlock(response.content).trim();
  const nextAnswers = mergeAnswer(state.answers, currentQuestion.fieldPath, parsed?.value ?? null, currentQuestion.fieldType);
  const nextQuestion = getNextQuestion({ ...state, answers: nextAnswers });
  const timestamp = new Date().toISOString();
  const nextState: InterviewState = {
    ...state,
    answers: nextAnswers,
    updatedAt: timestamp,
    questionIndex: nextQuestion?.index ?? currentQuestion.index + 1,
    phase: nextQuestion?.phase ?? "complete",
    messages: [
      ...state.messages,
      { role: "user", content: userMessage, timestamp },
      { role: "interviewer", content: displayedResponse || buildFallbackPrompt(nextQuestion), timestamp },
    ],
  };

  if (!nextQuestion) {
    const closingMessage = "That gives me a strong foundation. I’m ready to build your package and fill in the rough edges with AI drafts.";
    nextState.phase = "complete";
    nextState.messages[nextState.messages.length - 1] = {
      role: "interviewer",
      content: closingMessage,
      timestamp,
    };
    return {
      response: closingMessage,
      updatedState: nextState,
      complete: true,
    };
  }

  return {
    response: displayedResponse || buildFallbackPrompt(nextQuestion),
    updatedState: nextState,
    complete: false,
  };
}

function buildSystemPrompt(input: {
  currentQuestion: string;
  fieldPath: string;
  fieldType: "string" | "string[]" | "character" | "episode";
  format: string;
}) {
  return [
    "You are a warm, curious creative development assistant helping a writer or producer describe their media project. You are conducting a structured interview to gather the information needed to generate their production package.",
    "",
    "Your job this turn:",
    "Read what the user said",
    "Acknowledge it naturally (1 sentence — be specific, not generic)",
    "Ask the next question conversationally",
    "Do not sound like a form. Do not list multiple questions. One question per response.",
    "At the very end of your response, output a hidden extraction block:",
    `<!-- EXTRACT: {\"field\": \"${input.fieldPath}\", \"value\": <extracted_value_or_null>} -->`,
    "",
    "Extraction rules:",
    `value must be the correct type: ${input.fieldType}`,
    "For string[]: split on commas and \" and \", return array",
    "For character: { \"id\": \"<slugified-name>\", \"name\": \"<name>\", \"role\": \"<role>\", \"description\": \"<description>\", \"visibility\": \"internal\" }",
    "For episode: { \"code\": \"S01E01\", \"title\": \"<title>\", \"logline\": \"<logline>\", \"status\": \"planned\", \"visibility\": \"internal\" }",
    "If the answer is unclear, vague, or the user says \"skip\"/\"done\" for an optional question, set value to null",
    "For optional questions where user says \"done\"/\"skip\"/\"just the one\"/\"nothing specific\": set value to null (this will close the question)",
    `CURRENT_FIELD: ${input.fieldPath}`,
    `CURRENT_QUESTION: ${input.currentQuestion}`,
    `FORMAT_SO_FAR: ${input.format}`,
  ].join("\n");
}

function parseExtractBlock(content: string): { field: string; value: unknown } | null {
  const match = content.match(/<!--\s*EXTRACT:\s*([\s\S]+?)\s*-->/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as { field: string; value: unknown };
  } catch {
    return null;
  }
}

function stripExtractBlock(content: string) {
  return content.replace(/\n?<!--\s*EXTRACT:[\s\S]+?-->\s*$/m, "").trim();
}

function mergeAnswer(
  answers: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
  fieldType: "string" | "string[]" | "character" | "episode",
) {
  if (value == null) {
    return answers;
  }

  if (fieldType === "character" || fieldType === "episode") {
    const existing = Array.isArray(answers[fieldPath]) ? answers[fieldPath] as unknown[] : [];
    return {
      ...answers,
      [fieldPath]: [...existing, value],
    };
  }

  return {
    ...answers,
    [fieldPath]: value,
  };
}

function buildFallbackPrompt(nextQuestion: ReturnType<typeof getNextQuestion>) {
  if (!nextQuestion) {
    return "That gives me a strong foundation. I’m ready to build your package and fill in the rough edges with AI drafts.";
  }
  return nextQuestion.prompt;
}

export function shouldTreatAsSkipped(message: string) {
  return OPTIONAL_SKIP_PATTERN.test(message.trim());
}
