export type StudioOptions = {
  providers: Array<{ id: string; name: string; model: string; available: boolean }>;
  formats: string[];
  packageTiers: Array<"light" | "standard" | "full">;
};

export type ProjectSummary = {
  slug: string;
  title: string;
  mediaType: string;
  packageTier: string;
  generatedAt: string;
  validation: { ok: boolean; completenessScore: number; issues: Array<{ level: string; code: string; message: string }> };
  pendingSuggestionCount: number;
  settings?: { llmProvider: string; llmModel: string };
};

export type SSEvent = { event: string; data: unknown };

export type InterviewStartResponse = {
  sessionId: string;
  message: string;
  phase: number;
  totalQuestions: number;
};

export type InterviewTurnResponse = {
  message: string;
  phase: number | "complete";
  questionIndex: number;
  complete: boolean;
};

export const api = {
  getStudioOptions: () => fetchJson("/api/studio/options"),
  listProjects: () => fetchJson("/api/projects"),
  getProject: (slug: string) => fetchJson(`/api/projects/${slug}`),
  createProject: (payload: unknown, onEvent?: (event: SSEvent) => void) => streamJson("/api/projects", payload, onEvent),
  updateSettings: (slug: string, payload: unknown) => fetchJson(`/api/projects/${slug}/settings`, { method: "PUT", body: JSON.stringify(payload) }),
  getCanon: (slug: string) => fetchJson(`/api/projects/${slug}/canon`),
  saveCanon: (slug: string, canon: unknown) => fetchJson(`/api/projects/${slug}/canon`, { method: "PUT", body: JSON.stringify(canon) }),
  getSuggestions: (slug: string) => fetchJson(`/api/projects/${slug}/suggestions`),
  acceptSuggestion: (slug: string, field: string) => fetchJson(`/api/projects/${slug}/suggestions/accept`, { method: "POST", body: JSON.stringify({ field }) }),
  rejectSuggestion: (slug: string, field: string) => fetchJson(`/api/projects/${slug}/suggestions/reject`, { method: "POST", body: JSON.stringify({ field }) }),
  getFiles: (slug: string) => fetchJson(`/api/projects/${slug}/files`),
  getFile: (slug: string, filePath: string) => fetchJson(`/api/projects/${slug}/files/${encodePath(filePath)}`),
  saveFile: (slug: string, filePath: string, content: string) => fetchJson(`/api/projects/${slug}/files/${encodePath(filePath)}`, { method: "PUT", body: JSON.stringify({ content }) }),
  getAssets: (slug: string) => fetchJson(`/api/projects/${slug}/assets`),
  getValidation: (slug: string) => fetchJson(`/api/projects/${slug}/validation`),
  runGenerate: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/generate`, body, onEvent),
  runHydrate: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/hydrate`, body, onEvent),
  runAsset: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/assets/generate`, body, onEvent),
  startInterview: async (opts?: { provider?: string; model?: string }) => {
    const response = await fetchJson("/api/interview/start", { method: "POST", body: JSON.stringify(opts ?? {}) });
    return response.data as InterviewStartResponse;
  },
  sendInterviewMessage: async (sessionId: string, message: string) => {
    const response = await fetchJson("/api/interview/turn", { method: "POST", body: JSON.stringify({ sessionId, message }) });
    return response.data as InterviewTurnResponse;
  },
  completeInterview: async (sessionId: string, onEvent: (event: string, data: unknown) => void) => {
    const result = await streamJson("/api/interview/complete", { sessionId }, (event) => onEvent(event.event, event.data));
    return result;
  },
  siteUrl: (slug: string, filePath = "index.html") => `/api/projects/${slug}/site/${encodePath(filePath)}`,
  assetUrl: (slug: string, filePath: string) => `/api/projects/${slug}/assets-file/${encodePath(filePath)}`,
  archiveUrl: (slug: string) => `/api/projects/${slug}/archive`,
};

function encodePath(filePath: string) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }
  return payload;
}

async function streamJson(url: string, body: unknown, onEvent?: (event: SSEvent) => void) {
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const text = await response.text();
  const events = parseSSE(text);
  for (const event of events) {
    onEvent?.(event);
  }
  return { text, events };
}

function parseSSE(payload: string): SSEvent[] {
  return payload
    .split("\n\n")
    .map((chunk) => {
      const eventMatch = chunk.match(/event: (.+)/);
      const dataMatch = chunk.match(/data: ([\s\S]+)/);
      if (!eventMatch || !dataMatch) {
        return undefined;
      }
      try {
        return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) };
      } catch {
        return { event: eventMatch[1], data: dataMatch[1] };
      }
    })
    .filter(Boolean) as SSEvent[];
}
