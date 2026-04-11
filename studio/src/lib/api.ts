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
  archived?: boolean;
};

export type IterationDirectiveType =
  | "new_character"
  | "new_episode"
  | "develop_character"
  | "develop_episode"
  | "new_storyline"
  | "new_faction"
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

export type IterationDirective = {
  type: IterationDirectiveType;
  instruction: string;
  targetId?: string;
  constraints?: string[];
  steeringNote?: string;
};

export type IterationProposal = {
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
};

export type IterationRun = {
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
  suggestedNextDirectives?: Array<{
    type: IterationDirectiveType;
    instruction: string;
    targetId?: string;
  }>;
};

export type IterationSession = {
  sessionId: string;
  projectSlug: string;
  mode: IterationMode;
  maxRuns: number;
  confidenceThreshold: number;
  planner: IterationPlannerConfig;
  completedRuns: number;
  status: "running" | "paused" | "complete" | "stopped" | "error";
  runs: IterationRun[];
  startedAt: string;
  updatedAt: string;
  provider?: string;
  model?: string;
  pendingSteeringNote?: string;
};

export type IterationCanonSection = "characters" | "episodes" | "storylines" | "themes" | "world" | "meta";

export type IterationPlannerConfig = {
  strategy: "adaptive" | "coverage";
  avoidRecentWindow: number;
  sectionTargets: Partial<Record<IterationCanonSection, number>>;
};

export type CanonCompletenessReport = {
  score: number;
  dimensions: {
    characters: { score: number; gaps: string[] };
    episodes: { score: number; gaps: string[] };
    themes: { score: number; gaps: string[] };
    world: { score: number; gaps: string[] };
    storylines: { score: number; gaps: string[] };
  };
  suggestedDirectives: IterationDirective[];
};

export type SSEvent = { event: string; data: unknown };

export type ProjectExportFormat = "zip" | "pdf-bundle" | "folder-manifest";
export type ProjectExportInclude = "docs" | "site" | "canon" | "assets";
export type ProjectExportVisibility = "public" | "internal" | "all";

export type ProjectExportEntry = {
  path: string;
  kind: ProjectExportInclude;
  visibility: ProjectExportVisibility | "mixed";
  size: number;
  metadata: Record<string, unknown>;
};

export type ProjectExportManifest = {
  slug: string;
  format: ProjectExportFormat;
  visibility: ProjectExportVisibility;
  include: ProjectExportInclude[];
  files: ProjectExportEntry[];
};

export type CanonSnapshot = {
  snapshotId: string;
  projectSlug: string;
  createdAt: string;
  trigger: "iteration_accept" | "manual_edit" | "hydration" | "import";
  runId?: string;
  fieldChanges: Array<{ field: string; before: unknown; after: unknown }>;
  authorKind: "agent" | "user" | "system";
};

export type ShareRecord = {
  shareToken: string;
  projectSlug: string;
  createdAt: string;
  include: ProjectExportInclude[];
  visibility: ProjectExportVisibility;
  url: string;
};

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
  listProjects: (opts?: { includeArchived?: boolean }) => {
    const query = opts?.includeArchived ? "?includeArchived=true" : "";
    return fetchJson(`/api/projects${query}`);
  },
  getProject: (slug: string) => fetchJson(`/api/projects/${slug}`),
  createProject: (payload: unknown, onEvent?: (event: SSEvent) => void) => streamJson("/api/projects", payload, onEvent),
  updateSettings: (slug: string, payload: unknown) => fetchJson(`/api/projects/${slug}/settings`, { method: "PUT", body: JSON.stringify(payload) }),
  renameProject: async (slug: string, title: string) => {
    const response = await fetchJson(`/api/projects/${slug}/rename`, { method: "PATCH", body: JSON.stringify({ title }) });
    return response.data as ProjectSummary;
  },
  duplicateProject: async (slug: string, title?: string) => {
    const response = await fetchJson(`/api/projects/${slug}/duplicate`, { method: "POST", body: JSON.stringify({ title }) });
    return response.data as ProjectSummary;
  },
  archiveProject: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}/archive`, { method: "POST", body: JSON.stringify({}) });
    return response.data as ProjectSummary;
  },
  unarchiveProject: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}/unarchive`, { method: "POST", body: JSON.stringify({}) });
    return response.data as ProjectSummary;
  },
  deleteProject: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}`, { method: "DELETE", body: JSON.stringify({ confirm: slug }) });
    return response.data as { slug: string; deleted: true };
  },
  getCanon: (slug: string) => fetchJson(`/api/projects/${slug}/canon`),
  saveCanon: (slug: string, canon: unknown) => fetchJson(`/api/projects/${slug}/canon`, { method: "PUT", body: JSON.stringify(canon) }),
  getCanonHistory: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}/history`);
    return response.data as CanonSnapshot[];
  },
  revertCanonHistory: async (slug: string, snapshotId: string) => {
    const response = await fetchJson(`/api/projects/${slug}/history/${snapshotId}/revert`, { method: "POST", body: JSON.stringify({}) });
    return response.data;
  },
  getSuggestions: (slug: string) => fetchJson(`/api/projects/${slug}/suggestions`),
  acceptSuggestion: (slug: string, field: string) => fetchJson(`/api/projects/${slug}/suggestions/accept`, { method: "POST", body: JSON.stringify({ field }) }),
  rejectSuggestion: (slug: string, field: string) => fetchJson(`/api/projects/${slug}/suggestions/reject`, { method: "POST", body: JSON.stringify({ field }) }),
  getFiles: (slug: string) => fetchJson(`/api/projects/${slug}/files`),
  getFile: (slug: string, filePath: string) => fetchJson(`/api/projects/${slug}/files/${encodePath(filePath)}`),
  saveFile: (slug: string, filePath: string, content: string) => fetchJson(`/api/projects/${slug}/files/${encodePath(filePath)}`, { method: "PUT", body: JSON.stringify({ content }) }),
  getAssets: (slug: string) => fetchJson(`/api/projects/${slug}/assets`),
  getValidation: (slug: string) => fetchJson(`/api/projects/${slug}/validation`),
  getCompleteness: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}/completeness`);
    return response.data as CanonCompletenessReport;
  },
  listIterationSessions: async (slug: string) => {
    const response = await fetchJson(`/api/projects/${slug}/iterations`);
    return response.data as IterationSession[];
  },
  getIterationSession: async (slug: string, sessionId: string) => {
    const response = await fetchJson(`/api/projects/${slug}/iterations/${sessionId}`);
    return response.data as IterationSession;
  },
  getIterationRun: async (slug: string, sessionId: string, runId: string) => {
    const response = await fetchJson(`/api/projects/${slug}/iterations/${sessionId}/runs/${runId}`);
    return response.data as IterationRun;
  },
  startIterationSession: async (
    slug: string,
    opts: {
      mode: IterationMode;
      maxRuns: number;
      confidenceThreshold?: number;
      planner?: Partial<IterationPlannerConfig>;
      firstDirective: IterationDirective;
      provider?: string;
      model?: string;
    },
    onEvent: (event: string, data: unknown) => void,
  ) => {
    await streamJson(`/api/projects/${slug}/iterations`, opts, (event) => onEvent(event.event, event.data));
  },
  continueIterationSession: async (
    slug: string,
    sessionId: string,
    opts: {
      accepted: string[];
      steeringNote?: string;
      nextDirective?: IterationDirective;
    },
    onEvent: (event: string, data: unknown) => void,
  ) => {
    await streamJson(`/api/projects/${slug}/iterations/${sessionId}/continue`, opts, (event) => onEvent(event.event, event.data));
  },
  stopIterationSession: async (slug: string, sessionId: string) => {
    const response = await fetchJson(`/api/projects/${slug}/iterations/${sessionId}/stop`, { method: "POST", body: JSON.stringify({}) });
    return response.data as { sessionId: string; completedRuns: number; status: "stopped" };
  },
  queueIterationSteering: async (slug: string, sessionId: string, steeringNote: string) => {
    const response = await fetchJson(`/api/projects/${slug}/iterations/${sessionId}/steer`, {
      method: "POST",
      body: JSON.stringify({ steeringNote }),
    });
    return response.data as { sessionId: string; pendingSteeringNote?: string };
  },
  acceptAllIterationRun: async (slug: string, sessionId: string, runId: string, opts: { minConfidence?: number }, onEvent: (event: string, data: unknown) => void) => {
    await streamJson(`/api/projects/${slug}/iterations/${sessionId}/runs/${runId}/accept-all`, opts, (event) => onEvent(event.event, event.data));
  },
  runGenerate: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/generate`, body, onEvent),
  runHydrate: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/hydrate`, body, onEvent),
  runAsset: (slug: string, body: unknown, onEvent?: (event: SSEvent) => void) => streamJson(`/api/projects/${slug}/assets/generate`, body, onEvent),
  exportProjectManifest: async (slug: string, payload: { format: ProjectExportFormat; include: ProjectExportInclude[]; visibility: ProjectExportVisibility }) => {
    const response = await fetchJson(`/api/projects/${slug}/export`, { method: "POST", body: JSON.stringify(payload) });
    return response.data as ProjectExportManifest;
  },
  downloadProjectExport: async (slug: string, payload: { format: ProjectExportFormat; include: ProjectExportInclude[]; visibility: ProjectExportVisibility }) => {
    const response = await fetch(`/api/projects/${slug}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const payloadText = await response.text();
      throw new Error(payloadText || `Request failed: ${response.status}`);
    }
    const blob = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition") ?? "";
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
    return {
      blob,
      filename: filenameMatch?.[1] ?? `${slug}.zip`,
    };
  },
  createShareLink: async (slug: string, payload: { include: ProjectExportInclude[]; visibility: ProjectExportVisibility }) => {
    const response = await fetchJson(`/api/projects/${slug}/share`, { method: "POST", body: JSON.stringify(payload) });
    return response.data as ShareRecord;
  },
  startInterview: async (opts?: { provider?: string; model?: string }) => {
    const response = await fetchJson("/api/interview/start", { method: "POST", body: JSON.stringify(opts ?? {}) });
    return response.data as InterviewStartResponse;
  },
  sendInterviewMessage: async (sessionId: string, message: string) => {
    const response = await fetchJson("/api/interview/turn", { method: "POST", body: JSON.stringify({ sessionId, message }) });
    return response.data as InterviewTurnResponse;
  },
  completeInterview: async (sessionId: string, opts: { title?: string } | undefined, onEvent: (event: string, data: unknown) => void) => {
    const result = await streamJson("/api/interview/complete", { sessionId, ...(opts ?? {}) }, (event) => onEvent(event.event, event.data));
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
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const events: SSEvent[] = [];

  if (!reader) {
    text = await response.text();
    const parsed = parseSSE(text);
    for (const event of parsed) {
      onEvent?.(event);
      events.push(event);
    }
    return { text, events };
  }

  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      buffer += decoder.decode();
      text += buffer;
      const parsed = parseSSE(buffer);
      for (const event of parsed) {
        onEvent?.(event);
        events.push(event);
      }
      break;
    }

    const decoded = decoder.decode(chunk.value, { stream: true });
    text += decoded;
    buffer += decoded;
    const segments = buffer.split("\n\n");
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      const parsed = parseSSE(`${segment}\n\n`);
      for (const event of parsed) {
        onEvent?.(event);
        events.push(event);
      }
    }
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
