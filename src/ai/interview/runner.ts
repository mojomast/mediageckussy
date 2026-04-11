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
  const skippedOptional = Boolean(currentQuestion.optional && parsed?.value == null && shouldTreatAsSkipped(userMessage));
  const extractedValue = parsed?.value ?? inferAnswerValue(userMessage, currentQuestion.fieldType, currentQuestion.index, skippedOptional);
  const nextAnswers = mergeAnswer(state.answers, currentQuestion.fieldPath, extractedValue, currentQuestion.fieldType);
  const timestamp = new Date().toISOString();
  const candidateState: InterviewState = {
    ...state,
    answers: nextAnswers,
    skippedQuestionIndexes: skippedOptional
      ? [...state.skippedQuestionIndexes, currentQuestion.index]
      : state.skippedQuestionIndexes,
    updatedAt: timestamp,
  };
  const nextQuestion = getNextQuestion(candidateState);
  const nextPrompt = buildResponseMessage(displayedResponse, nextQuestion);
  const nextState: InterviewState = {
    ...candidateState,
    questionIndex: nextQuestion?.index ?? currentQuestion.index + 1,
    phase: nextQuestion?.phase ?? "complete",
    messages: [
      ...state.messages,
      { role: "user", content: userMessage, timestamp },
      { role: "interviewer", content: nextPrompt, timestamp },
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
    response: nextPrompt,
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
  const formatGuidance = podcastFormatGuidance(input.format, input.fieldPath);

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
    formatGuidance,
    `CURRENT_FIELD: ${input.fieldPath}`,
    `CURRENT_QUESTION: ${input.currentQuestion}`,
    `FORMAT_SO_FAR: ${input.format}`,
  ].join("\n");
}

function podcastFormatGuidance(format: string, fieldPath: string) {
  if (format !== "podcast") {
    return "Format guidance: respect the user's chosen format and never rewrite the next question into a different medium.";
  }

  if (fieldPath === "canon.world_setting") {
    return "Format guidance: this is a podcast. Do not ask about fictional worldbuilding, setting, or story location unless the user explicitly says it is a narrative fiction podcast. Ask about the show structure, format, recurring segments, and listener experience instead.";
  }

  if (fieldPath === "canon.characters") {
    return "Format guidance: this is a podcast. Treat characters as hosts, co-hosts, guests, or recurring voices. Do not frame them as fictional protagonists unless the user explicitly says the podcast is scripted fiction.";
  }

  if (fieldPath === "canon.episodes") {
    return "Format guidance: this is a podcast. Treat episodes as topics, hooks, recurring bits, or installment concepts. Do not ask what 'happens' in a story episode unless the user explicitly says the podcast is scripted fiction.";
  }

  return "Format guidance: this is a podcast. Keep questions anchored in show concept, host chemistry, audience, release cadence, and recurring episode structure.";
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

  if (fieldPath === "canon.format" && typeof value === "string") {
    return {
      ...answers,
      [fieldPath]: normalizeFormat(value),
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

function buildResponseMessage(modelText: string, nextQuestion: ReturnType<typeof getNextQuestion>) {
  if (!nextQuestion) {
    return buildFallbackPrompt(nextQuestion);
  }

  const acknowledgement = firstNonQuestionSentence(modelText);
  return acknowledgement ? `${acknowledgement}\n\n${nextQuestion.prompt}` : nextQuestion.prompt;
}

function firstNonQuestionSentence(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const sentence = normalized.match(/^.+?[.!?](?=\s|$)/)?.[0]?.trim() ?? normalized;
  return sentence.endsWith("?") ? "" : sentence;
}

function normalizeFormat(value: string) {
  const normalized = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (normalized === "tv" || normalized === "tv_series" || normalized === "tvseries") return "tv_series";
  if (normalized === "feature" || normalized === "film" || normalized === "feature_film" || normalized === "featurefilm") return "feature_film";
  if (normalized === "podcast") return "podcast";
  if (normalized === "web" || normalized === "web_series" || normalized === "webseries") return "web_series";
  return normalized;
}

function inferAnswerValue(
  userMessage: string,
  fieldType: "string" | "string[]" | "character" | "episode",
  questionIndex: number,
  skippedOptional: boolean,
) {
  if (skippedOptional) {
    return null;
  }

  if (fieldType === "character") {
    return inferCharacter(userMessage);
  }

  if (fieldType === "episode") {
    return inferEpisode(userMessage, questionIndex);
  }

  return null;
}

function inferCharacter(userMessage: string) {
  const parts = userMessage.split(",").map((item) => item.trim()).filter(Boolean);
  const name = parts[0];
  if (!name) {
    return null;
  }

  const role = parts[1] || "supporting character";
  const description = parts.slice(2).join(", ") || parts[1] || userMessage.trim();
  return {
    id: slugify(name),
    name,
    role,
    description,
    visibility: "internal",
  };
}

function inferEpisode(userMessage: string, questionIndex: number) {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return null;
  }

  const titleMatch = trimmed.match(/^"([^"]+)"\s*[—-]\s*(.+)$/);
  const title = titleMatch?.[1] ?? trimmed.split(/[—-]/)[0]?.replace(/^"|"$/g, "").trim() ?? `Episode ${questionIndex - 10}`;
  const logline = (titleMatch?.[2]?.trim() ?? trimmed.split(/[—-]/).slice(1).join("-").trim()) || trimmed;
  const episodeNumber = Math.max(1, questionIndex - 10);
  return {
    code: `S01E${String(episodeNumber).padStart(2, "0")}`,
    title,
    logline,
    status: "planned",
    visibility: "internal",
  };
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "character";
}

export function shouldTreatAsSkipped(message: string) {
  return OPTIONAL_SKIP_PATTERN.test(message.trim());
}
