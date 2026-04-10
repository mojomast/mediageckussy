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
              <button className="btn btn--ghost" onClick={async () => {
                setStatus(`Hydrating canon.${selectedField}...`);
                await api.runHydrate(slug, {
                  field: `canon.${selectedField}`,
                  provider: projectSettings?.llmProvider,
                  model: projectSettings?.llmModel,
                  promptHint,
                  force: true,
                }, async (event) => {
                  if (event.event === "done") {
                    await loadState();
                    setStatus(`Suggestion ready for canon.${selectedField}.`);
                  }
                });
              }}>AI Fill ◈</button>
              <button className="btn btn--primary" onClick={async () => {
                setStatus("Regenerating package...");
                await api.runGenerate(slug, {}, (event) => {
                  if (event.event === "done") {
                    setStatus("Package regenerated.");
                  }
                });
              }}>Regenerate Package</button>
            </div>
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
          <button className="btn btn--ghost" onClick={async () => {
            setStatus(`Hydrating canon.${selectedField}...`);
            await api.runHydrate(slug, {
              field: `canon.${selectedField}`,
              provider: projectSettings?.llmProvider,
              model: projectSettings?.llmModel,
              promptHint,
              force: true,
            }, async (event) => {
              if (event.event === "done") {
                await loadState();
                setStatus(`Suggestion ready for canon.${selectedField}.`);
              }
            });
          }}>Suggest</button>
        </div>

        {selectedSuggestion ? (
          <article className="dossier suggestion-card suggestion-card--amber">
            <div className="dossier__header">
              <span>AI Suggestion</span>
              <span>CONFIDENCE: {formatConfidence(selectedSuggestion.confidence)}</span>
            </div>
            <div className="dossier__body suggestion-card__body">
              <pre>{selectedSuggestion.value}</pre>
              <div className="row gap wrap">
                <button className="btn btn--primary" onClick={async () => {
                  if (typeof field.value === "string") {
                    setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: selectedSuggestion.value } } });
                  }
                  await api.acceptSuggestion(slug, selectedSuggestion.field);
                  await loadState();
                  setStatus(`Accepted ${selectedSuggestion.field}.`);
                }}>Accept</button>
                <button className="btn btn--danger" onClick={async () => {
                  await api.rejectSuggestion(slug, selectedSuggestion.field);
                  await loadState();
                  setStatus(`Rejected ${selectedSuggestion.field}.`);
                }}>Reject</button>
                <button className="btn btn--ghost" onClick={async () => {
                  if (typeof field.value === "string") {
                    setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: selectedSuggestion.value } } });
                  }
                  await api.acceptSuggestion(slug, selectedSuggestion.field);
                  await loadState();
                  setStatus(`Accepted edited suggestion for ${selectedSuggestion.field}.`);
                }}>Edit &amp; Accept</button>
              </div>
            </div>
          </article>
        ) : (
          <p className="muted">No pending suggestion for this field yet.</p>
        )}
      </aside>
    </div>
  );
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
