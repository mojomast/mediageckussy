import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../lib/api";

type Props = {
  slug: string;
  projectSettings: { llmProvider: string; llmModel: string } | null;
  onProjectSettingsChange: (settings: { llmProvider: string; llmModel: string }) => void;
  status: string;
  setStatus: (value: string) => void;
};

export function CanonEditor({ slug, projectSettings, onProjectSettingsChange, status, setStatus }: Props) {
  const [canon, setCanon] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedField, setSelectedField] = useState<string>("title");
  const [promptHint, setPromptHint] = useState("Tighten the idea while keeping the current tone and format constraints.");

  async function loadState() {
    const [canonResponse, suggestionResponse] = await Promise.all([
      api.getCanon(slug),
      api.getSuggestions(slug),
    ]);
    setCanon(canonResponse.data);
    setSuggestions((suggestionResponse.data ?? []).filter((item: any) => item.status === "pending"));
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
        {Object.entries(canon.canon).map(([key, value]: [string, any]) => (
          <button key={key} className={`field-button ${selectedField === key ? "selected" : ""}`} onClick={() => setSelectedField(key)}>
            <span className={`status-dot ${value.status}`}></span>
            <span>{key}</span>
          </button>
        ))}
      </aside>

      <section className="panel editor-panel">
        <div className="row between wrap">
          <div>
            <div className="section-label">Field Editor</div>
            <h2>{selectedField}</h2>
          </div>
          <div className="provider-pill">{projectSettings?.llmProvider} · {projectSettings?.llmModel}</div>
        </div>

        <div className="field-meta row gap wrap muted">
          <span>Status: {field.status}</span>
          <span>Owner: {field.owner}</span>
          <span>Confidence: {field.confidence}</span>
        </div>

        {typeof field.value === "string" ? (
          <textarea value={field.value} disabled={field.status === "locked"} onChange={(event) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: event.target.value } } })} />
        ) : (
          <Editor height="60vh" defaultLanguage="json" value={JSON.stringify(field.value, null, 2)} onChange={(value) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: JSON.parse(value ?? "null") } } })} options={{ readOnly: field.status === "locked" }} />
        )}

        <div className="row gap wrap">
          <button onClick={async () => {
            await api.saveCanon(slug, canon);
            setStatus("Canon saved.");
          }}>Save Canon</button>
          <button onClick={async () => {
            setStatus("Regenerating package...");
            await api.runGenerate(slug, {}, (event) => {
              if (event.event === "done") {
                setStatus("Package regenerated.");
              }
            });
          }}>Regenerate Package</button>
        </div>
        <p className="status-inline">{status}</p>
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
          <button onClick={async () => {
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
          <div className="suggestion-card">
            <strong>Pending suggestion</strong>
            <p className="muted">{selectedSuggestion.provider} · {selectedSuggestion.model} · confidence {selectedSuggestion.confidence}</p>
            <pre>{selectedSuggestion.value}</pre>
            <div className="row gap wrap">
              <button onClick={async () => {
                await api.acceptSuggestion(slug, selectedSuggestion.field);
                await loadState();
                setStatus(`Accepted ${selectedSuggestion.field}.`);
              }}>Accept</button>
              <button onClick={async () => {
                await api.rejectSuggestion(slug, selectedSuggestion.field);
                await loadState();
                setStatus(`Rejected ${selectedSuggestion.field}.`);
              }}>Reject</button>
            </div>
          </div>
        ) : (
          <p className="muted">No pending suggestion for this field yet.</p>
        )}
      </aside>
    </div>
  );
}
