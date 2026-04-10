import type { InterviewState } from "./state.js";

export interface InterviewQuestion {
  index: number;
  phase: 1 | 2 | 3 | 4;
  fieldPath: string;
  fieldType: "string" | "string[]" | "character" | "episode";
  prompt: string;
  hint?: string;
  formatsOnly?: string[];
  optional?: boolean;
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    index: 0,
    phase: 1,
    fieldPath: "canon.format",
    fieldType: "string",
    prompt: "What kind of project is this?",
    hint: "TV series, feature film, podcast, or web series",
  },
  {
    index: 1,
    phase: 1,
    fieldPath: "canon.title",
    fieldType: "string",
    prompt: "What's your project called?",
  },
  {
    index: 2,
    phase: 1,
    fieldPath: "canon.logline",
    fieldType: "string",
    prompt: "Describe your project in a sentence or two. What is it about?",
    hint: "Don't worry about polish — a rough description is perfect",
  },
  {
    index: 3,
    phase: 1,
    fieldPath: "canon.genre",
    fieldType: "string",
    prompt: "What genre is it?",
    hint: "e.g. drama, thriller, sci-fi, comedy, documentary, horror",
  },
  {
    index: 4,
    phase: 1,
    fieldPath: "canon.tone",
    fieldType: "string[]",
    prompt: "How would you describe the tone or vibe?",
    hint: "e.g. 'dark and gritty', 'fun and irreverent', 'prestige slow burn'",
  },
  {
    index: 5,
    phase: 2,
    fieldPath: "canon.world_setting",
    fieldType: "string",
    prompt: "Where and when does your story take place? Describe the world.",
  },
  {
    index: 6,
    phase: 2,
    fieldPath: "canon.audience",
    fieldType: "string[]",
    prompt: "Who is your audience? Who would watch or listen to this?",
    hint: "e.g. 'adults 25-45', 'true crime fans', 'young adult readers'",
  },
  {
    index: 7,
    phase: 2,
    fieldPath: "canon.comps",
    fieldType: "string[]",
    prompt: "Name 2-3 existing shows, films, or podcasts with a similar feel.",
    hint: "These are your comps — they help position your project",
  },
  {
    index: 8,
    phase: 2,
    fieldPath: "canon.duration_count",
    fieldType: "string",
    prompt: "How many episodes are you thinking, and how long is each?",
    hint: "e.g. '10 episodes, 45 minutes each' or '6-episode limited series'",
    formatsOnly: ["tv_series", "web_series"],
  },
  {
    index: 8,
    phase: 2,
    fieldPath: "canon.duration_count",
    fieldType: "string",
    prompt: "What's the approximate runtime?",
    hint: "e.g. '100 minutes'",
    formatsOnly: ["feature_film"],
  },
  {
    index: 8,
    phase: 2,
    fieldPath: "canon.duration_count",
    fieldType: "string",
    prompt: "How often will you release, and how long per episode?",
    hint: "e.g. 'weekly, 30-40 minutes per episode'",
    formatsOnly: ["podcast"],
  },
  {
    index: 9,
    phase: 3,
    fieldPath: "canon.characters",
    fieldType: "character",
    prompt: "Tell me about your main character or host — name and a brief description.",
  },
  {
    index: 10,
    phase: 3,
    fieldPath: "canon.characters",
    fieldType: "character",
    prompt: "Anyone else important? Name and a brief description.",
    hint: "Say 'done' or 'just the one' to move on",
    optional: true,
  },
  {
    index: 11,
    phase: 3,
    fieldPath: "canon.episodes",
    fieldType: "episode",
    prompt: "What happens in the first episode? Give me a title and a one-liner.",
    formatsOnly: ["tv_series", "web_series", "podcast"],
  },
  {
    index: 12,
    phase: 3,
    fieldPath: "canon.episodes",
    fieldType: "episode",
    prompt: "What about episode 2?",
    hint: "Say 'done' to move on",
    optional: true,
    formatsOnly: ["tv_series", "web_series", "podcast"],
  },
  {
    index: 13,
    phase: 4,
    fieldPath: "canon.themes",
    fieldType: "string[]",
    prompt: "What are the central themes? What is this really about beneath the surface?",
    hint: "e.g. 'redemption, identity, found family'",
  },
  {
    index: 14,
    phase: 4,
    fieldPath: "canon.production_assumptions",
    fieldType: "string[]",
    prompt: "Anything important about the production setup, budget level, or target platform?",
    hint: "Say 'nothing specific' to skip",
    optional: true,
  },
];

export function getNextQuestion(state: InterviewState): InterviewQuestion | null {
  const format = typeof state.answers["canon.format"] === "string" ? state.answers["canon.format"] : undefined;
  const applicableQuestions = INTERVIEW_QUESTIONS.filter((question) => !question.formatsOnly || (format && question.formatsOnly.includes(format)));

  if (applicableQuestions.every((question) => question.optional || isAnswered(state.answers[question.fieldPath], question.fieldType, question.fieldPath, state.answers, question))) {
    return null;
  }

  const seenCounts = new Map<string, number>();

  for (const question of applicableQuestions) {

    const answerValue = state.answers[question.fieldPath];

    if (question.fieldType === "character" || question.fieldType === "episode") {
      const targetCount = seenCounts.get(question.fieldPath) ?? 0;
      if (Array.isArray(answerValue) && answerValue[targetCount] != null) {
        seenCounts.set(question.fieldPath, targetCount + 1);
        continue;
      }
      return question;
    }

    if (answerValue != null) {
      continue;
    }

    return question;
  }

  return null;
}

function isAnswered(
  answerValue: unknown,
  fieldType: InterviewQuestion["fieldType"],
  fieldPath: string,
  answers: Record<string, unknown>,
  question: InterviewQuestion,
) {
  if (fieldType === "character" || fieldType === "episode") {
    const matchingQuestions = INTERVIEW_QUESTIONS.filter((item) => item.fieldPath === fieldPath && item.fieldType === fieldType);
    const questionOffset = matchingQuestions.findIndex((item) => item.prompt === question.prompt);
    return Array.isArray(answerValue) && answerValue[questionOffset] != null;
  }

  return answerValue != null;
}
