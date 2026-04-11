import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StudioOptions } from "../lib/api";

type ChatMessage = { role: "interviewer" | "user" | "system"; content: string };

type Props = {
  options: StudioOptions | null;
  onProjectReady: (slug: string) => void;
  onOpenProject: (slug: string) => void;
};

type BuildState = {
  slug?: string;
  suggestionCount?: number;
  completenessScore?: number;
  step?: string;
  error?: string;
};

const SESSION_STORAGE_KEY = "studio-interview-session-id";

const PHASE_LABELS = ["FORMAT", "WORLD", "CHARACTERS", "THEMES"];

export function InterviewView({ options, onProjectReady, onOpenProject }: Props) {
  const [provider, setProvider] = useState<string>(options?.providers.find((item) => item.available)?.id ?? "openrouter");
  const [model, setModel] = useState<string>(options?.providers.find((item) => item.available)?.model ?? "google/gemini-2.5-flash-lite");
  const [sessionId, setSessionId] = useState<string | null>(() => window.localStorage.getItem(SESSION_STORAGE_KEY));
  const [phase, setPhase] = useState<number | "complete">(1);
  const [totalQuestions, setTotalQuestions] = useState(15);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildState, setBuildState] = useState<BuildState>({});
  const [error, setError] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState<number>(() => {
    const stored = window.localStorage.getItem("studio-interview-font-scale");
    return stored ? Number(stored) || 1 : 1;
  });
  const lastMessageRef = useRef<string>("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--interview-font-scale", String(fontScale));
    window.localStorage.setItem("studio-interview-font-scale", String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    if (sessionId) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionId]);

  useEffect(() => {
    const available = options?.providers.find((item) => item.available);
    if (available) {
      setProvider((current) => current === "openrouter" ? available.id : current);
      setModel((current) => current === "google/gemini-2.5-flash-lite" ? available.model : current);
    }
  }, [options]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, building]);

  useEffect(() => {
    if (sessionId || messages.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const start = await api.startInterview({ provider, model });
        if (cancelled) return;
        setSessionId(start.sessionId);
        setPhase(start.phase);
        setTotalQuestions(start.totalQuestions);
        setQuestionIndex(1);
        setMessages([{ role: "interviewer", content: start.message }]);
        setError(null);
      } catch {
        if (!cancelled) {
          setError("Something went wrong. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages.length, model, provider, sessionId]);

  const currentPhaseIndex = phase === "complete" ? 4 : phase;
  const progressText = phase === "complete" ? "Phase 4 of 4" : `Phase ${phase} of 4`;
  const availableProviders = useMemo(() => options?.providers.filter((item) => item.available) ?? [], [options]);
  const currentPhaseLabel = PHASE_LABELS[Math.max(0, currentPhaseIndex - 1)] ?? PHASE_LABELS[0];
  const progressPercent = phase === "complete"
    ? 100
    : Math.max(
      0,
      Math.min(100, Math.round((((currentPhaseIndex - 1) + questionIndex / Math.max(totalQuestions, 1)) / 4) * 100)),
    );

  async function submitMessage(message: string) {
    if (!sessionId || !message.trim()) return;
    setLoading(true);
    setError(null);
    lastMessageRef.current = message;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");

    try {
      const response = await api.sendInterviewMessage(sessionId, message);
      setMessages((current) => [...current, { role: "interviewer", content: response.message }]);
      setPhase(response.phase);
      setQuestionIndex(response.questionIndex + 1);
      if (response.complete) {
        setPhase("complete");
        await completeProjectBuild(sessionId);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setMessages((current) => [...current, { role: "system", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function completeProjectBuild(activeSessionId: string) {
    setBuilding(true);
    setBuildState({});
    setError(null);

    await api.completeInterview(activeSessionId, (event, data) => {
      if (event === "progress" && typeof data === "object" && data) {
        setBuildState((current) => ({ ...current, ...(data as Record<string, unknown>) }));
      }
      if (event === "done" && typeof data === "object" && data) {
        const done = data as { slug: string; suggestionCount: number; completenessScore: number };
        setBuildState(done);
        setBuilding(false);
        setSessionId(null);
        onProjectReady(done.slug);
      }
      if (event === "error") {
        const message = typeof data === "object" && data && "message" in data
          ? String((data as { message?: unknown }).message ?? "Interview build failed.")
          : "Interview build failed.";
        setBuildState((current) => ({ ...current, error: message }));
        setError(message);
        setBuilding(false);
      }
    });
  }

  return (
    <main className="interview-shell">
      <header className="interview-header">
        <div className="interview-header__eyebrow">INTERVIEW // NEW PROJECT INITIALIZATION</div>
        <div className="interview-header__phase-row">
          <div>
            <div className="interview-header__phase">{progressText}: {currentPhaseLabel}</div>
            <div className="interview-header__labels">{PHASE_LABELS.join(" · ")}</div>
          </div>
          <div className="interview-header__controls">
            <span className="badge badge--dim">{progressText}</span>
            <label className="interview-font-control">
              <span>TEXT SIZE</span>
              <input
                aria-label="Interview font size"
                type="range"
                min="0.9"
                max="1.35"
                step="0.05"
                value={fontScale}
                onChange={(event) => setFontScale(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
        <div className="interview-phase-bar" aria-label="Phase progress bar">
          {PHASE_LABELS.map((label, index) => {
            const segmentNumber = index + 1;
            const state = currentPhaseIndex > segmentNumber ? "complete" : currentPhaseIndex === segmentNumber ? "current" : "upcoming";
            return (
              <div key={label} className={`phase-segment ${state}`}>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="progress-bar interview-progress" aria-label="Interview progress">
          <div className="progress-bar__fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </header>

      <section className="interview-transcript">
        <section className="dossier welcome-dossier">
          <div className="dossier__header">
            <span>G.E.C.K. INITIALIZATION SEQUENCE</span>
          </div>
          <div className="dossier__body welcome-dossier__body">
            <p>UNIT: MEDIA PACKAGE GENERATOR v2</p>
            <p>STATUS: AWAITING PROJECT PARAMETERS</p>
            <p>
              This unit will conduct a short intake interview to gather project parameters. Responses will be used to
              generate a canon-locked media package.
            </p>
            <p>ESTIMATED TIME: 5-8 MINUTES</p>
            <p>QUESTIONS: ~15</p>
            <label className="welcome-dossier__provider">
              <span>PROVIDER</span>
              <select
                aria-label="Provider"
                value={provider}
                onChange={(event) => {
                  const next = availableProviders.find((item) => item.id === event.target.value);
                  setProvider(event.target.value);
                  setModel(next?.model ?? "");
                }}
                disabled={Boolean(sessionId)}
              >
                {availableProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button className="btn btn--primary welcome-dossier__action" type="button" disabled={Boolean(sessionId)}>
              Begin Initialization
            </button>
          </div>
        </section>

        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`transcript-entry transcript-entry--${message.role}`}>
            <div className="transcript-entry__label">
              {message.role === "interviewer" ? "◈ G.E.C.K. //" : message.role === "user" ? "◉ OPERATOR //" : "SYSTEM //"}
            </div>
            <div className={`bubble ${message.role === "interviewer" ? "bubble--interviewer" : message.role === "user" ? "bubble--user" : "transcript-entry__system"}`}>
              {message.content}
            </div>
          </article>
        ))}

        {loading && (
          <div className="transcript-entry transcript-entry--interviewer">
            <div className="transcript-entry__label">◈ G.E.C.K. //</div>
            <div className="bubble bubble--interviewer typing-indicator" aria-label="Typing indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span>{error}</span>
            <button onClick={() => void submitMessage(lastMessageRef.current)}>Retry</button>
          </div>
        )}

        {(phase === "complete" || building || buildState.slug || buildState.error) && (
          <section className="completion-card dossier">
            <div className="dossier__body completion-card__body">
              <strong>◈ INTERVIEW COMPLETE</strong>
              {completionLines(buildState, building).map((line, index) => (
                <div
                  key={line}
                  className="completion-card__line"
                  style={{ animationDelay: `${index * 200}ms` }}
                >
                  {line}
                </div>
              ))}
              {buildState.error && <div className="issue error">{buildState.error}</div>}
              {buildState.error && sessionId && (
                <button className="btn btn--amber" onClick={() => void completeProjectBuild(sessionId)}>
                  Retry Build
                </button>
              )}
              {buildState.slug && (
                <button className="btn btn--primary" onClick={() => onOpenProject(buildState.slug ?? "")}>Open Project Dossier →</button>
              )}
            </div>
          </section>
        )}

        <div ref={transcriptEndRef} />
      </section>

      {phase !== "complete" && !buildState.slug && (
        <footer className="interview-footer">
          <form
            className="interview-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMessage(input);
            }}
          >
            <label className={`interview-input ${loading ? "interview-input--loading" : ""}`}>
              <span className="interview-input__prompt">&gt;_</span>
              <input
                aria-label="Interview answer"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={loading}
                placeholder="type response..."
              />
            </label>
            <button className="btn btn--primary" type="submit" disabled={loading || !input.trim()}>Transmit →</button>
          </form>
        </footer>
      )}
    </main>
  );
}

function completionLines(buildState: BuildState, building: boolean) {
  if (buildState.error) {
    return [
      "Compiling project parameters... [████████████] DONE",
      "Initializing canon lock... [████████████] DONE",
      "Generating package... [████████░░░░] INTERRUPTED",
      "Running AI hydration... [░░░░░░░░░░░░] ABORTED",
    ];
  }

  const completeness = buildState.completenessScore ?? 72;
  const slug = buildState.slug ?? "pending-project";
  const projectName = slug.replace(/-/g, " ").toUpperCase();
  const pending = buildState.suggestionCount ?? 14;

  return [
    "Compiling project parameters... [████████████] DONE",
    "Initializing canon lock... [████████████] DONE",
    `Generating package... [${buildProgressBar(building ? completeness : completeness)}] ${completeness}%`,
    "Running AI hydration... [████████████] DONE",
    `PROJECT: ${projectName}`,
    `SLUG: ${slug}`,
    `COMPLETENESS: ${completeness}%`,
    `SUGGESTIONS: ${pending} PENDING`,
  ];
}

function buildProgressBar(percent: number) {
  const filled = Math.max(0, Math.min(12, Math.round((percent / 100) * 12)));
  return `${"█".repeat(filled)}${"░".repeat(12 - filled)}`;
}
