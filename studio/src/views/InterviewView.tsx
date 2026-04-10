import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StudioOptions } from "../lib/api";

type ChatMessage = { role: "interviewer" | "user" | "system"; content: string };

type Props = {
  options: StudioOptions | null;
  onOpenProject: (slug: string) => void;
};

const PHASE_LABELS = ["Concept", "World", "Characters", "Themes"];

export function InterviewView({ options, onOpenProject }: Props) {
  const [provider, setProvider] = useState<string>(options?.providers.find((item) => item.available)?.id ?? "openrouter");
  const [model, setModel] = useState<string>(options?.providers.find((item) => item.available)?.model ?? "google/gemini-2.5-flash-lite");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<number | "complete">(1);
  const [totalQuestions, setTotalQuestions] = useState(15);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildState, setBuildState] = useState<{ slug?: string; suggestionCount?: number; completenessScore?: number; step?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const lastMessageRef = useRef<string>("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

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
    if (sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const start = await api.startInterview({ provider, model });
        if (cancelled) return;
        setSessionId(start.sessionId);
        setPhase(start.phase);
        setTotalQuestions(start.totalQuestions);
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
  }, [model, provider, sessionId]);

  const currentPhaseIndex = phase === "complete" ? 4 : phase;
  const progressText = phase === "complete" ? "Complete" : `Phase ${phase} of 4`;
  const availableProviders = useMemo(() => options?.providers.filter((item) => item.available) ?? [], [options]);

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
      if (response.complete) {
        setPhase("complete");
        setBuilding(true);
        await api.completeInterview(sessionId, (event, data) => {
          if (event === "progress" && typeof data === "object" && data) {
            setBuildState((current) => ({ ...current, ...(data as Record<string, unknown>) }));
          }
          if (event === "done" && typeof data === "object" && data) {
            const done = data as { slug: string; suggestionCount: number; completenessScore: number };
            setBuildState(done);
            setBuilding(false);
          }
        });
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setMessages((current) => [...current, { role: "system", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const progressPercent = phase === "complete"
    ? 100
    : Math.max(0, Math.min(100, Math.round(((currentPhaseIndex - 1) / 4) * 100 + (100 / totalQuestions))));

  return (
    <main className="interview-shell">
      <header className="interview-header">
        <div className="row between wrap">
          <div className="brand-row"><span className="diamond">◆</span><span>mediageckussy</span></div>
          <span className="muted">{progressText}</span>
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
        <div className="progress" aria-label="Interview progress">
          <div style={{ width: `${progressPercent}%` }} />
        </div>
      </header>

      <section className="interview-transcript">
        <div className="welcome-card">
          <strong>Let&apos;s build your project together.</strong>
          <p>Answer ~15 questions and we&apos;ll generate your full package for you.</p>
          <label>
            <span>Provider</span>
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
        </div>

        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
            {message.role === "interviewer" && <span className="diamond">◆</span>}
            <div>{message.content}</div>
          </article>
        ))}

        {loading && (
          <div className="typing-indicator" aria-label="Typing indicator">
            <span></span><span></span><span></span>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span>{error}</span>
            <button onClick={() => void submitMessage(lastMessageRef.current)}>Retry</button>
          </div>
        )}

        {(phase === "complete" || building || buildState.slug) && (
          <section className="completion-card">
            {!buildState.slug ? (
              <>
                <strong>✓ Great! Building your package...</strong>
                <div className="build-step">◌ Generating files... {buildState.step === "generate" ? "[spinner]" : ""}</div>
                <div className="build-step">◌ Hydrating copy... {building ? "[spinner]" : ""}</div>
              </>
            ) : (
              <>
                <strong>✓ Your package is ready!</strong>
                <h2>{buildState.slug}</h2>
                <p>{buildState.suggestionCount ?? 0} suggestions ready to review</p>
                <p>Completeness: {buildState.completenessScore ?? 0}%</p>
                <button onClick={() => onOpenProject(buildState.slug ?? "")}>Open Project →</button>
              </>
            )}
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
            <input
              aria-label="Interview answer"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
              placeholder="Type your answer..."
            />
            <button type="submit" disabled={loading || !input.trim()}>Send →</button>
          </form>
        </footer>
      )}
    </main>
  );
}
