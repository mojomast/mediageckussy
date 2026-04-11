import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../lib/api";

type CanonField = {
  value: unknown;
  status: string;
  owner: string;
  updated_at?: string;
  confidence?: number;
  downstream_dependencies?: string[];
};

type CanonState = {
  canon: Record<string, CanonField>;
};

type Suggestion = {
  field: string;
  value: string;
  provider?: string;
  model?: string;
  confidence?: number;
  status: string;
};

type HydrationState = {
  mode: "field" | "panel";
  field: string;
  step: string;
  progress: number;
};

type Props = {
  slug: string;
  projectSettings: { llmProvider: string; llmModel: string } | null;
  onProjectSettingsChange: (settings: { llmProvider: string; llmModel: string }) => void;
  status: string;
  setStatus: (value: string) => void;
};

export function CanonEditor({ slug, projectSettings, onProjectSettingsChange, status, setStatus }: Props) {
  const [canon, setCanon] = useState<CanonState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedField, setSelectedField] = useState<string>("title");
  const [promptHint, setPromptHint] = useState("Tighten the idea while keeping the current tone and format constraints.");
  const [hydrationState, setHydrationState] = useState<HydrationState | null>(null);

  async function loadState() {
    const [canonResponse, suggestionResponse] = await Promise.all([
      api.getCanon(slug),
      api.getSuggestions(slug),
    ]);
    setCanon(canonResponse.data as CanonState);
    setSuggestions(((suggestionResponse.data ?? []) as Suggestion[]).filter((item) => item.status === "pending"));
  }

  useEffect(() => {
    void loadState();
  }, [slug]);

  const field = canon?.canon?.[selectedField];
  const selectedSuggestion = useMemo(
    () => suggestions.find((item) => item.field === `canon.${selectedField}`),
    [selectedField, suggestions],
  );
  const isHydratingSelectedField = hydrationState?.field === selectedField;

  if (!canon || !field) return <div className="panel">Loading canon...</div>;

  return (
    <div className="three-column hosted-grid">
      <aside className="panel sidebar">
        <div className="section-label">Canon Fields</div>
        {Object.entries(canon.canon).map(([key, value]) => (
          <button key={key} className={`field-button ${selectedField === key ? "selected" : ""}`} onClick={() => setSelectedField(key)}>
            <span className={`status-dot ${value.status}`}></span>
            <span>{key}</span>
          </button>
        ))}
      </aside>

      <section className="editor-panel">
        <article className="dossier canon-field-card">
          <div className="dossier__header canon-field-card__header">
            <span>canon.{selectedField}</span>
            <div className="row gap wrap">
              <span className="badge badge--dim">{field.status}</span>
              <span className="badge badge--dim">OWNER: {field.owner}</span>
            </div>
          </div>
          <div className="dossier__body canon-field-card__body">
            <div className="canon-field-card__value">
              {typeof field.value === "string" ? (
                <textarea value={field.value} disabled={field.status === "locked"} onChange={(event) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: event.target.value } } })} />
              ) : (
                <Editor height="60vh" defaultLanguage="json" value={JSON.stringify(field.value, null, 2)} onChange={(value) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: JSON.parse(value ?? "null") } } })} options={{ readOnly: field.status === "locked" }} />
              )}
            </div>

            <div className="canon-field-card__meta">
              <div>
                <div className="canon-field-card__meta-label">CONFIDENCE: {formatConfidence(field.confidence)}</div>
                <div className="progress-bar" aria-label="Field confidence">
                  <div className="progress-bar__fill" style={{ width: `${normalizeConfidence(field.confidence) * 100}%` }} />
                </div>
              </div>
              <div className="row gap wrap muted canon-field-card__meta-line">
                <span>UPDATED: {formatUpdatedAt(field.updated_at)}</span>
                <span>DOWNSTREAM: {field.downstream_dependencies?.length ?? 0} files</span>
              </div>
            </div>

            <div className="row gap wrap">
              <button className="btn btn--ghost" onClick={async () => {
                await api.saveCanon(slug, canon);
                setStatus("Canon saved.");
              }}>Edit</button>
              <button className="btn btn--ghost" disabled={field.status === "locked"}>Lock</button>
              <button className="btn btn--ghost" disabled={isHydratingSelectedField} onClick={() => void hydrateSelectedField("field")}>AI Fill ◈</button>
              <button className="btn btn--primary" onClick={async () => {
                setStatus("Regenerating package...");
                await api.runGenerate(slug, {}, (event) => {
                  if (event.event === "done") {
                    setStatus("Package regenerated.");
                  }
                });
              }}>Regenerate Package</button>
            </div>
            {isHydratingSelectedField && hydrationState && (
              <div className="dossier hydration-status-card">
                <div className="dossier__header">
                  <span>INFERENCE ACTIVE</span>
                  <span>{hydrationState.progress}%</span>
                </div>
                <div className="dossier__body hydration-status-card__body">
                  <div className="section-label">canon.{selectedField}</div>
                  <div className="progress-bar" aria-label="Hydration progress">
                    <div className="progress-bar__fill" style={{ width: `${hydrationState.progress}%` }} />
                  </div>
                  <p>{hydrationState.step}</p>
                  <div className="typing-dots" aria-label="Inference in progress"><span></span><span></span><span></span></div>
                </div>
              </div>
            )}
            <p className="status-inline">{status}</p>
          </div>
        </article>
      </section>

      <aside className="panel ai-panel">
        <div className="section-label">Inference</div>
        <h3>Prompt-guided hydration</h3>
        <label>
          <span>Prompt hint</span>
          <textarea className="hint-area" value={promptHint} onChange={(event) => setPromptHint(event.target.value)} />
        </label>
        <label>
          <span>Provider</span>
          <input value={projectSettings?.llmProvider ?? ""} onChange={(event) => onProjectSettingsChange({ llmProvider: event.target.value, llmModel: projectSettings?.llmModel ?? "" })} />
        </label>
        <label>
          <span>Model</span>
          <input value={projectSettings?.llmModel ?? ""} onChange={(event) => onProjectSettingsChange({ llmProvider: projectSettings?.llmProvider ?? "", llmModel: event.target.value })} />
        </label>
        <div className="row gap wrap">
          <button onClick={async () => {
            if (!projectSettings) return;
            await api.updateSettings(slug, projectSettings);
            setStatus("Inference settings saved.");
          }}>Save Settings</button>
          <button className="btn btn--ghost" disabled={isHydratingSelectedField} onClick={() => void hydrateSelectedField("panel")}>Suggest</button>
        </div>

        {isHydratingSelectedField && hydrationState && (
          <div className="hydration-inline-status">
            <div className="row between wrap">
              <span className="section-label">Inference Pipeline</span>
              <span>{hydrationState.progress}%</span>
            </div>
            <div className="progress-bar" aria-label="Inference pipeline progress">
              <div className="progress-bar__fill" style={{ width: `${hydrationState.progress}%` }} />
            </div>
            <p className="muted">{hydrationState.step}</p>
          </div>
        )}

        {selectedSuggestion ? (
          <article className="dossier suggestion-card suggestion-card--amber">
            <div className="dossier__header">
              <span>AI Suggestion</span>
              <span>CONFIDENCE: {formatConfidence(selectedSuggestion.confidence)}</span>
            </div>
            <div className="dossier__body suggestion-card__body">
              <pre>{selectedSuggestion.value}</pre>
              <div className="row gap wrap">
                <button className="btn btn--primary" onClick={() => void handleAcceptSuggestion(selectedSuggestion.field, false)}>Accept</button>
                <button className="btn btn--danger" onClick={async () => {
                  try {
                    await api.rejectSuggestion(slug, selectedSuggestion.field);
                    await loadState();
                    setStatus(`Rejected ${selectedSuggestion.field}.`);
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : "Reject failed.");
                  }
                }}>Reject</button>
                <button className="btn btn--ghost" onClick={() => void handleAcceptSuggestion(selectedSuggestion.field, true)}>Edit &amp; Accept</button>
              </div>
            </div>
          </article>
        ) : (
          <p className="muted">No pending suggestion for this field yet.</p>
        )}
      </aside>
    </div>
  );

  async function hydrateSelectedField(mode: "field" | "panel") {
    setHydrationState({
      mode,
      field: selectedField,
      step: `Preparing canon.${selectedField} prompt package...`,
      progress: 15,
    });
    setStatus(`Hydrating canon.${selectedField}...`);

    try {
      await api.runHydrate(slug, {
        field: `canon.${selectedField}`,
        provider: projectSettings?.llmProvider,
        model: projectSettings?.llmModel,
        promptHint,
        force: true,
      }, async (event) => {
        if (event.event === "started") {
          setHydrationState({
            mode,
            field: selectedField,
            step: `Submitting canon.${selectedField} to ${projectSettings?.llmProvider ?? "provider"}...`,
            progress: 45,
          });
          return;
        }

        if (event.event === "done") {
          setHydrationState({
            mode,
            field: selectedField,
            step: `Suggestion received for canon.${selectedField}. Updating review panel...`,
            progress: 100,
          });
          await loadState();
          setStatus(`Suggestion ready for canon.${selectedField}.`);
          setTimeout(() => setHydrationState((current) => current?.field === selectedField ? null : current), 600);
        }

        if (event.event === "error") {
          const message = typeof event.data === "object" && event.data && "message" in (event.data as Record<string, unknown>)
            ? String((event.data as { message?: unknown }).message ?? "Hydration failed.")
            : "Hydration failed.";
          setHydrationState({
            mode,
            field: selectedField,
            step: message,
            progress: 100,
          });
          setStatus(message);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hydration failed.";
      setHydrationState({
        mode,
        field: selectedField,
        step: message,
        progress: 100,
      });
      setStatus(message);
    }
  }

  async function handleAcceptSuggestion(fieldPath: string, preserveEditorValue: boolean) {
    try {
      if (preserveEditorValue && canon && field && typeof field.value === "string") {
        await api.saveCanon(slug, {
          ...canon,
          canon: {
            ...canon.canon,
            [selectedField]: {
              ...field,
              value: field.value,
            },
          },
        });
      }

      await api.acceptSuggestion(slug, fieldPath);
      await loadState();
      setStatus(`${preserveEditorValue ? "Accepted edited suggestion for" : "Accepted"} ${fieldPath}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Accept failed.");
    }
  }
}

function formatConfidence(value: number | undefined) {
  return (value ?? 0).toFixed(2);
}

function normalizeConfidence(value: number | undefined) {
  return Math.max(0, Math.min(1, value ?? 0));
}

function formatUpdatedAt(value: string | undefined) {
  if (!value) return "UNKNOWN";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}
