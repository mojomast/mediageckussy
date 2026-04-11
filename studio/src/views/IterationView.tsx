import { useEffect, useMemo, useState } from "react";
import {
  api,
  type IterationDirective,
  type IterationDirectiveType,
  type IterationProposal,
  type IterationRun,
  type IterationSession,
} from "../lib/api";

type CanonOption = { id: string; label: string };

type CanonState = {
  canon: {
    title?: { value: string };
    format?: { value: string };
    tone?: { value: string[] };
    logline?: { value: string };
    themes?: { value: unknown[] };
    world_setting?: { value: string };
    characters?: { value: Array<{ id: string; name: string }> };
    episodes?: { value: Array<{ code: string; title: string }> };
  };
};

type Props = {
  slug: string;
  projectSettings: { llmProvider: string; llmModel: string } | null;
  setStatus: (value: string) => void;
};

const DIRECTIVE_OPTIONS: Array<{ value: IterationDirectiveType; label: string }> = [
  { value: "new_character", label: "New Character" },
  { value: "develop_character", label: "Develop Character" },
  { value: "new_episode", label: "New Episode" },
  { value: "develop_episode", label: "Develop Episode" },
  { value: "new_storyline", label: "New Storyline" },
  { value: "develop_themes", label: "Develop Themes" },
  { value: "world_expansion", label: "World Expansion" },
  { value: "suggest_next", label: "Let AI Suggest Next" },
  { value: "custom", label: "Custom Directive" },
];

export function IterationView({ slug, projectSettings, setStatus }: Props) {
  const [canon, setCanon] = useState<CanonState | null>(null);
  const [sessions, setSessions] = useState<IterationSession[]>([]);
  const [session, setSession] = useState<IterationSession | null>(null);
  const [viewMode, setViewMode] = useState<"current" | "history">("current");
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [directiveType, setDirectiveType] = useState<IterationDirectiveType>("new_character");
  const [instruction, setInstruction] = useState("Add a morally ambiguous government handler who can pressure the existing command structure.");
  const [targetId, setTargetId] = useState("");
  const [constraints, setConstraints] = useState("");
  const [mode, setMode] = useState<IterationSession["mode"]>("gated");
  const [maxRuns, setMaxRuns] = useState(5);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75);
  const [provider, setProvider] = useState(projectSettings?.llmProvider ?? "openrouter");
  const [model, setModel] = useState(projectSettings?.llmModel ?? "");
  const [steeringDraft, setSteeringDraft] = useState("");
  const [queuedSteering, setQueuedSteering] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState<Record<string, boolean>>({});
  const [reviewSteeringNote, setReviewSteeringNote] = useState("");
  const [overrideType, setOverrideType] = useState<IterationDirectiveType>("develop_episode");
  const [overrideTargetId, setOverrideTargetId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isQueueingSteering, setIsQueueingSteering] = useState(false);

  const characterOptions = useMemo<CanonOption[]>(() => (canon?.canon.characters?.value ?? []).map((item) => ({ id: item.id, label: `${item.id} // ${item.name}` })), [canon]);
  const episodeOptions = useMemo<CanonOption[]>(() => (canon?.canon.episodes?.value ?? []).map((item) => ({ id: item.code, label: `${item.code} // ${item.title}` })), [canon]);
  const targetOptions = directiveType === "develop_character" ? characterOptions : directiveType === "develop_episode" ? episodeOptions : [];
  const pausedRun = session?.status === "paused" ? session.runs[session.runs.length - 1] ?? null : null;
  const isActive = Boolean(session && ["running", "paused", "error"].includes(session.status));
  const isReview = Boolean(pausedRun && session?.status === "paused");
  const selectedHistorySession = useMemo(() => sessions.find((entry) => entry.sessionId === selectedHistorySessionId) ?? sessions[0] ?? null, [selectedHistorySessionId, sessions]);
  const canonDiff = useMemo(() => selectedHistorySession && canon ? buildCanonDiff(selectedHistorySession, canon) : [], [canon, selectedHistorySession]);

  useEffect(() => {
    setProvider(projectSettings?.llmProvider ?? "openrouter");
    setModel(projectSettings?.llmModel ?? "");
  }, [projectSettings?.llmModel, projectSettings?.llmProvider]);

  useEffect(() => {
    void loadState();
  }, [slug]);

  useEffect(() => {
    if (!pausedRun) {
      setReviewAccepted({});
      return;
    }
    setReviewAccepted(Object.fromEntries(pausedRun.proposals.map((proposal) => [proposal.proposalId, true])));
    setSelectedRunId(pausedRun.runId);
    setOverrideType((pausedRun.suggestedNextDirectives?.[0]?.type as IterationDirectiveType | undefined) ?? "develop_episode");
    setOverrideTargetId(pausedRun.suggestedNextDirectives?.[0]?.targetId ?? "");
  }, [pausedRun]);

  return (
    <div className="iteration-shell">
      <div className="row gap wrap iteration-view-toggle">
        <button className={`btn ${viewMode === "current" ? "btn--primary" : "btn--ghost"}`} onClick={() => setViewMode("current")}>Current</button>
        <button className={`btn ${viewMode === "history" ? "btn--primary" : "btn--ghost"}`} onClick={() => setViewMode("history")}>History</button>
      </div>

      {viewMode === "history" && selectedHistorySession ? (
        <div className="three-column hosted-grid iteration-history-layout">
          <aside className="panel sidebar">
            <div className="section-label">Iteration Sessions</div>
            {sessions.map((entry, index) => (
              <button key={entry.sessionId} className={`field-button ${selectedHistorySession.sessionId === entry.sessionId ? "selected" : ""}`} onClick={() => setSelectedHistorySessionId(entry.sessionId)}>
                <span className="status-dot approved"></span>
                <span>
                  ◈ Session {sessions.length - index}
                  <br />
                  {formatDateOnly(entry.startedAt)} // {entry.completedRuns} runs // {entry.status}
                </span>
              </button>
            ))}
          </aside>

          <section className="dossier iteration-panel card--glow iteration-history-main">
            <div className="dossier__header">
              <span>Session Detail</span>
              <span>{selectedHistorySession.completedRuns} runs // {countAcceptedProposals(selectedHistorySession)} accepted // {selectedHistorySession.status}</span>
            </div>
            <div className="dossier__body iteration-panel__body">
              <div className="row between wrap">
                <div>
                  <div className="section-label">Session {selectedHistorySession.sessionId}</div>
                  <p>{formatDateOnly(selectedHistorySession.startedAt)} // Mode: {selectedHistorySession.mode}</p>
                </div>
                <div className="row gap wrap">
                  {selectedHistorySession.status !== "complete" && selectedHistorySession.status !== "stopped" && (
                    <button className="btn btn--ghost" onClick={() => {
                      setSession(selectedHistorySession);
                      setViewMode("current");
                    }}>◈ Continue This Session</button>
                  )}
                  <button className="btn btn--ghost" onClick={() => {
                    setViewMode("current");
                    setSession(null);
                  }}>⟳ Start New Session</button>
                </div>
              </div>

              <div className="iteration-run-list">
                {selectedHistorySession.runs.map((run) => (
                  <article key={run.runId} className="dossier iteration-run-card">
                    <button type="button" className="iteration-run-card__toggle" onClick={() => setSelectedRunId((current) => current === run.runId ? null : run.runId)}>
                      <span>◈ RUN {run.runNumber} {run.directive.type.toUpperCase()} {formatConfidence(run.confidence)}</span>
                      <span>{run.summary ?? "No summary"}</span>
                    </button>
                    {selectedRunId === run.runId && (
                      <div className="dossier__body iteration-run-card__body">
                        {run.proposals.map((proposal) => (
                          <div key={proposal.proposalId} className="iteration-history-proposal-row">
                            <span>{proposal.field} {proposal.operation.toUpperCase()}</span>
                            <span>{proposal.status === "accepted" ? "✓ ACCEPTED" : proposal.status.toUpperCase()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="panel iteration-diff-panel">
            <div className="row between wrap">
              <div className="section-label">Canon Changes</div>
              <button className="btn btn--ghost" onClick={() => setShowDiff((current) => !current)}>{showDiff ? "Hide Diff" : "Show Diff"}</button>
            </div>
            {showDiff && (
              <div className="iteration-diff-list">
                {canonDiff.length === 0 && <p className="muted">No field-level changes detected against the current canon.</p>}
                {canonDiff.map((entry) => (
                  <article key={entry.field} className="dossier iteration-diff-card">
                    <div className="dossier__header">
                      <span>{entry.field}</span>
                      <span>{entry.kind}</span>
                    </div>
                    <div className="dossier__body iteration-proposal-card__body">
                      <p>Before: {entry.before}</p>
                      <p>After: {entry.after}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {viewMode === "current" && !isActive && (
        <section className="dossier iteration-panel card--glow">
          <div className="dossier__header">
            <span>Canon Iteration Engine</span>
            <span>Dossier: {slug} // Iteration Lab</span>
          </div>
          <div className="dossier__body iteration-panel__body">
            <label>
              <span className="section-label">Directive Type</span>
              <select value={directiveType} onChange={(event) => setDirectiveType(event.target.value as IterationDirectiveType)}>
                {DIRECTIVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              <span className="section-label">Instruction</span>
              <textarea className="hint-area compact" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
            </label>

            {targetOptions.length > 0 && (
              <label>
                <span className="section-label">Target</span>
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                  <option value="">Select target</option>
                  {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            )}

            <label>
              <span className="section-label">Constraints</span>
              <textarea className="hint-area compact" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="One constraint per line" />
            </label>

            <div className="iteration-settings-grid">
              <div className="section-label iteration-settings-grid__full">Loop Settings</div>
              <div className="iteration-mode-row">
                {(["gated", "autonomous", "confidence"] as const).map((value) => (
                  <button key={value} type="button" className={`btn ${mode === value ? "btn--primary" : "btn--ghost"}`} onClick={() => setMode(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <label>
                <span>Max Runs</span>
                <input type="number" min={1} max={50} value={maxRuns} onChange={(event) => setMaxRuns(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
              </label>
              {mode === "confidence" && (
                <label>
                  <span>Confidence Threshold</span>
                  <input type="number" min={0} max={1} step="0.01" value={confidenceThreshold} onChange={(event) => setConfidenceThreshold(Math.max(0, Math.min(1, Number(event.target.value) || 0)))} />
                </label>
              )}
              <label>
                <span>Provider</span>
                <input value={provider} onChange={(event) => setProvider(event.target.value)} />
              </label>
              <label>
                <span>Model</span>
                <input value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
            </div>

            <div className="row gap wrap">
              <button className="btn btn--primary" disabled={isStarting || !instruction.trim()} onClick={() => void startSession()}>
                ◈ Begin Iteration
              </button>
            </div>
          </div>
        </section>
      )}

      {viewMode === "current" && session && !isReview && isActive && (
        <section className="dossier iteration-panel card--glow">
          <div className="dossier__header">
            <span>Iteration Loop</span>
            <span>Run {Math.min(session.completedRuns + (session.status === "running" ? 1 : 0), session.maxRuns)}/{session.maxRuns}</span>
          </div>
          <div className="dossier__body iteration-panel__body">
            <div className="row between wrap">
              <div className="iteration-status-line">SESSION: {session.sessionId}</div>
              <button className="btn btn--danger" disabled={isStopping} onClick={() => void stopSession()}>Stop</button>
            </div>

            <div className="iteration-run-list">
              {buildRunCards(session).map((entry) => (
                <article key={entry.key} className={`dossier iteration-run-card ${entry.kind === "running" ? "iteration-run-card--running" : ""}`}>
                  <button type="button" className="iteration-run-card__toggle" onClick={() => setSelectedRunId((current) => current === entry.run?.runId ? null : entry.run?.runId ?? current)}>
                    <span>{entry.label}</span>
                    <span>{entry.statusLabel}</span>
                  </button>
                  {entry.kind === "running" && (
                    <div className="dossier__body iteration-run-card__body">
                      <div className="progress-bar iteration-progress-bar iteration-progress-bar--animated"><div className="progress-bar__fill" style={{ width: "42%" }} /></div>
                    </div>
                  )}
                  {entry.run && selectedRunId === entry.run.runId && (
                    <div className="dossier__body iteration-run-card__body">
                      <p>{entry.run.summary ?? "No summary available yet."}</p>
                      <p className="muted">Confidence: {formatConfidence(entry.run.confidence)} // {entry.run.proposals.filter((proposal: IterationProposal) => proposal.status === "accepted").length} proposals accepted</p>
                      {entry.run.proposals.length > 0 && (
                        <div className="iteration-proposal-list">
                          {entry.run.proposals.map((proposal) => (
                            <article key={proposal.proposalId} className={`dossier iteration-proposal-card ${proposal.confidence < 0.7 ? "iteration-proposal-card--amber" : ""}`}>
                              <div className="dossier__header">
                                <span>{proposal.field}</span>
                                <span>{proposal.operation} // {formatConfidence(proposal.confidence)}</span>
                              </div>
                              <div className="dossier__body iteration-proposal-card__body">
                                <pre>{formatValue(proposal.value)}</pre>
                                <p>{proposal.rationale}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="dossier iteration-steering-card">
              <div className="dossier__header">
                <span>Steering</span>
                <span>{queuedSteering ? "Queued" : "Idle"}</span>
              </div>
              <div className="dossier__body iteration-steering-card__body">
                <label>
                  <span className="section-label">Inject a note for the next run</span>
                  <textarea className="hint-area compact" value={steeringDraft} onChange={(event) => setSteeringDraft(event.target.value)} placeholder="Make the next run connect to Vera's backstory..." />
                </label>
                <div className="row gap wrap">
                  <button className="btn btn--ghost" disabled={isQueueingSteering || !steeringDraft.trim()} onClick={() => void queueSteering()}>
                    Queue Note
                  </button>
                  {queuedSteering && <span className="muted">Queued: {queuedSteering}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {viewMode === "current" && session && pausedRun && isReview && (
        <section className="dossier iteration-panel card--amber">
          <div className="dossier__header">
            <span>Awaiting Review</span>
            <span>Run {pausedRun.runNumber}/{session.maxRuns} // Paused</span>
          </div>
          <div className="dossier__body iteration-panel__body">
            <div className="iteration-review-summary">
              <div className="section-label">Run Complete</div>
              <p>Type: {pausedRun.directive.type} // Confidence: {formatConfidence(pausedRun.confidence)}</p>
              <p>{pausedRun.summary}</p>
            </div>

            <div className="iteration-proposal-list">
              {pausedRun.proposals.map((proposal) => (
                <article key={proposal.proposalId} className={`dossier iteration-proposal-card ${proposal.confidence < 0.7 ? "iteration-proposal-card--amber" : ""}`}>
                  <div className="dossier__header">
                    <span>{proposal.field}</span>
                    <span>CONF: {formatConfidence(proposal.confidence)}</span>
                  </div>
                  <div className="dossier__body iteration-proposal-card__body">
                    <div className="row between wrap">
                      <strong>{proposal.operation.toUpperCase()}</strong>
                      <div className="row gap wrap">
                        <button type="button" className={`btn ${reviewAccepted[proposal.proposalId] !== false ? "btn--primary" : "btn--ghost"}`} onClick={() => setReviewAccepted((current) => ({ ...current, [proposal.proposalId]: true }))}>✓</button>
                        <button type="button" className={`btn ${reviewAccepted[proposal.proposalId] === false ? "btn--danger" : "btn--ghost"}`} onClick={() => setReviewAccepted((current) => ({ ...current, [proposal.proposalId]: false }))}>✗</button>
                      </div>
                    </div>
                    <pre>{formatValue(proposal.value)}</pre>
                    <p>Rationale: {proposal.rationale}</p>
                  </div>
                </article>
              ))}
            </div>

            <label>
              <span className="section-label">Steering Note for Next Run</span>
              <textarea className="hint-area compact" value={reviewSteeringNote} onChange={(event) => setReviewSteeringNote(event.target.value)} />
            </label>

            <div className="iteration-override-row">
              <label>
                <span className="section-label">Next Directive Override</span>
                <select value={overrideType} onChange={(event) => setOverrideType(event.target.value as IterationDirectiveType)}>
                  {DIRECTIVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {(overrideType === "develop_character" || overrideType === "develop_episode") && (
                <label>
                  <span className="section-label">Target</span>
                  <select value={overrideTargetId} onChange={(event) => setOverrideTargetId(event.target.value)}>
                    <option value="">Select target</option>
                    {(overrideType === "develop_character" ? characterOptions : episodeOptions).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
              )}
            </div>

            <div className="row gap wrap">
              <button className="btn btn--primary" disabled={isContinuing} onClick={() => void continueSession(true)}>
                ✓ Accept Selected &amp; Continue
              </button>
              <button className="btn btn--danger" disabled={isContinuing} onClick={() => void continueSession(false)}>
                ✗ Reject All &amp; Stop
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  async function loadState() {
    const [canonResponse, nextSessions] = await Promise.all([
      api.getCanon(slug),
      api.listIterationSessions(slug),
    ]);
    setCanon(canonResponse.data as CanonState);
    setSessions(nextSessions);
    setSession(nextSessions[0] ?? null);
    setSelectedHistorySessionId((current) => current ?? nextSessions[0]?.sessionId ?? null);
    setQueuedSteering(nextSessions[0]?.pendingSteeringNote ?? "");
  }

  async function refreshSession(sessionId: string) {
    const nextSession = await api.getIterationSession(slug, sessionId);
    setSession(nextSession);
    setQueuedSteering(nextSession.pendingSteeringNote ?? "");
    const nextSessions = await api.listIterationSessions(slug);
    setSessions(nextSessions);
  }

  async function startSession() {
    setIsStarting(true);
    setStatus("Starting iteration session...");
    try {
      await api.startIterationSession(slug, {
        mode,
        maxRuns,
        confidenceThreshold,
        provider,
        model,
        firstDirective: {
          type: directiveType,
          instruction,
          targetId: targetId || undefined,
          constraints: splitLines(constraints),
        },
      }, handleIterationEvent);
      const nextSessions = await api.listIterationSessions(slug);
      const nextSession = nextSessions[0] ?? null;
      setSessions(nextSessions);
      setSession(nextSession);
      setQueuedSteering(nextSession?.pendingSteeringNote ?? "");
      await loadState();
      setStatus(nextSession?.status === "paused" ? "Iteration paused for review." : "Iteration session complete.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to start iteration session.");
    } finally {
      setIsStarting(false);
    }
  }

  async function continueSession(shouldContinue: boolean) {
    if (!session || !pausedRun) return;
    if (!shouldContinue) {
      await stopSession();
      return;
    }

    setIsContinuing(true);
    setStatus(`Continuing iteration session ${session.sessionId}...`);

    try {
      await api.continueIterationSession(slug, session.sessionId, {
        accepted: pausedRun.proposals.filter((proposal: IterationProposal) => reviewAccepted[proposal.proposalId] !== false).map((proposal: IterationProposal) => proposal.proposalId),
        steeringNote: reviewSteeringNote.trim() || undefined,
        nextDirective: buildOverrideDirective(),
      }, handleIterationEvent);
      await loadState();
      setReviewSteeringNote("");
      setStatus("Iteration resumed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to continue iteration session.");
    } finally {
      setIsContinuing(false);
    }
  }

  async function stopSession() {
    if (!session) return;
    setIsStopping(true);
    try {
      await api.stopIterationSession(slug, session.sessionId);
      await loadState();
      setStatus(`Stopped iteration session ${session.sessionId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to stop iteration session.");
    } finally {
      setIsStopping(false);
    }
  }

  async function queueSteering() {
    if (!session || !steeringDraft.trim()) return;
    setIsQueueingSteering(true);
    try {
      const result = await api.queueIterationSteering(slug, session.sessionId, steeringDraft.trim());
      setQueuedSteering(result.pendingSteeringNote ?? "");
      setSteeringDraft("");
      await refreshSession(session.sessionId);
      setStatus("Queued steering note for the next run.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to queue steering note.");
    } finally {
      setIsQueueingSteering(false);
    }
  }

  function handleIterationEvent(event: string, data: unknown) {
    if (event === "run_start") {
      setStatus(`Iteration run ${(data as { runNumber?: number })?.runNumber ?? "?"} started.`);
      return;
    }
    if (event === "run_complete") {
      const payload = data as { sessionId?: string; summary?: string };
      if (payload.sessionId) {
        void refreshSession(payload.sessionId);
      }
      setStatus(payload.summary ?? "Iteration run complete.");
      return;
    }
    if (event === "hitl_pause") {
      const payload = data as { sessionId?: string };
      if (payload.sessionId) {
        void refreshSession(payload.sessionId);
      }
      setStatus("Iteration paused for review.");
      return;
    }
    if (event === "loop_complete") {
      setStatus(`Iteration session ${(data as { sessionId?: string })?.sessionId ?? ""} complete.`.trim());
      return;
    }
    if (event === "error") {
      const payload = data as { message?: string };
      setStatus(payload.message ?? "Iteration request failed.");
    }
  }

  function buildOverrideDirective(): IterationDirective | undefined {
    if (!reviewSteeringNote.trim() && !overrideTargetId && !(pausedRun?.suggestedNextDirectives?.length)) {
      return undefined;
    }
    return {
      type: overrideType,
      instruction: buildDefaultInstruction(overrideType, overrideTargetId),
      targetId: overrideTargetId || undefined,
    };
  }
}

function buildCanonDiff(session: IterationSession, canon: CanonState) {
  const baseline = session.runs[0]?.canonSnapshot as Record<string, unknown> | undefined;
  if (!baseline) {
    return [] as Array<{ field: string; before: string; after: string; kind: string }>;
  }

  const current = {
    title: canon.canon.title?.value,
    format: canon.canon.format?.value,
    tone: canon.canon.tone?.value ?? [],
    logline: canon.canon.logline?.value,
    themes: canon.canon.themes?.value ?? [],
    world_setting: canon.canon.world_setting?.value,
    characters: canon.canon.characters?.value ?? [],
    episodes: canon.canon.episodes?.value ?? [],
  };

  const diffs: Array<{ field: string; before: string; after: string; kind: string }> = [];

  if (JSON.stringify(baseline.characters) !== JSON.stringify(current.characters)) {
    diffs.push({
      field: "canon.characters",
      before: summarizeNamedArray((baseline.characters as Array<{ name?: string }> | undefined) ?? [], "name"),
      after: summarizeNamedArray(current.characters, "name"),
      kind: "Changed",
    });
  }

  if (JSON.stringify(baseline.episodes) !== JSON.stringify(current.episodes)) {
    diffs.push({
      field: "canon.episodes",
      before: summarizeNamedArray((baseline.episodes as Array<{ code?: string }> | undefined) ?? [], "code"),
      after: summarizeNamedArray(current.episodes, "code"),
      kind: "Changed",
    });
  }

  const scalarFields: Array<keyof typeof current> = ["title", "format", "logline", "tone", "themes", "world_setting"];
  for (const field of scalarFields) {
    if (JSON.stringify(baseline[field]) !== JSON.stringify(current[field])) {
      diffs.push({
        field: `canon.${field}`,
        before: summarizeValue(baseline[field]),
        after: summarizeValue(current[field]),
        kind: Array.isArray(current[field]) ? "Changed Array" : "Changed",
      });
    }
  }

  return diffs;
}

function summarizeNamedArray(items: Array<Record<string, unknown>>, key: "name" | "code") {
  return `[${items.map((item) => String(item[key] ?? item.id ?? "?")).join(", ")}]`;
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function countAcceptedProposals(session: IterationSession) {
  return session.runs.reduce((count, run) => count + run.proposals.filter((proposal) => proposal.status === "accepted").length, 0);
}

function formatDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function buildRunCards(session: IterationSession) {
  const cards: Array<{ key: string; kind: "completed" | "running" | "pending"; run?: IterationRun; label: string; statusLabel: string }> = [];
  for (const run of session.runs) {
    cards.push({
      key: run.runId,
      kind: session.status === "running" && run === session.runs[session.runs.length - 1] ? "running" : "completed",
      run,
      label: `◈ RUN ${run.runNumber} // ${run.directive.type.toUpperCase()}`,
      statusLabel: run.status.toUpperCase(),
    });
  }
  for (let runNumber = session.runs.length + 1; runNumber <= session.maxRuns; runNumber += 1) {
    cards.push({ key: `pending-${runNumber}`, kind: "pending", label: `○ RUN ${runNumber}`, statusLabel: "PENDING" });
  }
  return cards;
}

function splitLines(value: string) {
  return value.split("\n").map((entry) => entry.trim()).filter(Boolean);
}

function formatConfidence(value: number) {
  return value.toFixed(2);
}

function formatValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function buildDefaultInstruction(type: IterationDirectiveType, targetId: string) {
  if (type === "develop_character") return `Develop character ${targetId || "selected character"}.`;
  if (type === "develop_episode") return `Develop episode ${targetId || "selected episode"}.`;
  return DIRECTIVE_OPTIONS.find((option) => option.value === type)?.label ?? "Continue iteration";
}
