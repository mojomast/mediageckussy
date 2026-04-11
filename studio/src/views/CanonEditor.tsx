import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { api, type CanonCompletenessReport, type CanonSnapshot, type IterationDirective } from "../lib/api";

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
  onIterateNow: (directive: IterationDirective) => Promise<void>;
};

const FIELD_GROUPS = [
  {
    label: "Core",
    fields: ["title", "logline", "format", "genre", "tone", "audience", "comps", "duration_count"],
  },
  {
    label: "Story",
    fields: ["themes", "themes_structured", "structure", "episodes", "storylines", "motifs"],
  },
  {
    label: "World",
    fields: ["world_setting", "locations", "world_lore", "factions", "characters"],
  },
  {
    label: "Production",
    fields: ["production_assumptions", "business_assumptions", "legal_assumptions", "publication_flags"],
  },
] as const;

export function CanonEditor({ slug, projectSettings, onProjectSettingsChange, status, setStatus, onIterateNow }: Props) {
  const [canon, setCanon] = useState<CanonState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [completeness, setCompleteness] = useState<CanonCompletenessReport | null>(null);
  const [selectedField, setSelectedField] = useState<string>("title");
  const [promptHint, setPromptHint] = useState("Tighten the idea while keeping the current tone and format constraints.");
  const [iterationCount, setIterationCount] = useState(2);
  const [refinementGoals, setRefinementGoals] = useState("specificity, canon consistency, voice");
  const [hydrationState, setHydrationState] = useState<HydrationState | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [history, setHistory] = useState<CanonSnapshot[]>([]);

  async function loadState() {
    const [canonResponse, suggestionResponse, completenessResponse] = await Promise.all([
      api.getCanon(slug),
      api.getSuggestions(slug),
      api.getCompleteness(slug),
    ]);
    const nextCanon = canonResponse.data as CanonState;
    setCanon(nextCanon);
    setSuggestions(((suggestionResponse.data ?? []) as Suggestion[]).filter((item) => item.status === "pending"));
    setCompleteness(completenessResponse);
    setHistory(await api.getCanonHistory(slug));
  }

  useEffect(() => {
    void loadState();
  }, [slug]);

  useEffect(() => {
    if (!canon) {
      return;
    }
    if (!canon.canon[selectedField]) {
      setSelectedField(Object.keys(canon.canon)[0] ?? "title");
    }
  }, [canon, selectedField]);

  const field = canon?.canon?.[selectedField];
  const selectedSuggestion = useMemo(
    () => suggestions.find((item) => item.field === `canon.${selectedField}`),
    [selectedField, suggestions],
  );
  const isHydratingSelectedField = hydrationState?.field === selectedField;
  const fieldActions = useMemo(() => buildFieldActions(selectedField), [selectedField]);
  const displayedGroups = useMemo(
    () => FIELD_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.filter((key) => canon?.canon[key]),
    })).filter((group) => group.fields.length > 0),
    [canon],
  );

  useEffect(() => {
    if (!field || typeof field.value === "string") {
      setJsonDraft("");
      setJsonError(null);
      return;
    }

    setJsonDraft(JSON.stringify(field.value, null, 2));
    setJsonError(null);
  }, [field, selectedField]);

  if (!canon || !field) return <div className="panel">Loading canon...</div>;

  const completenessDimensions = completeness ? [
    ["Characters", completeness.dimensions.characters.score],
    ["Episodes", completeness.dimensions.episodes.score],
    ["Themes", completeness.dimensions.themes.score],
    ["World", completeness.dimensions.world.score],
    ["Storylines", completeness.dimensions.storylines.score],
  ] : [];

  return (
    <div className="three-column hosted-grid">
      <aside className="panel sidebar">
        <div className="section-label">Canon Fields</div>
        <div className="canon-field-groups">
          {displayedGroups.map((group) => (
            <section key={group.label} className="canon-field-group">
              <div className="canon-field-group__title">{group.label}</div>
              {group.fields.map((key) => {
                const value = canon.canon[key];
                return (
                  <button key={key} className={`field-button ${selectedField === key ? "selected" : ""}`} onClick={() => setSelectedField(key)}>
                    <span className={`status-dot ${value.status}`}></span>
                    <span className="canon-field-button__label">{formatFieldName(key)}</span>
                    <span className="canon-field-button__count">{summarizeFieldValue(value.value)}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </aside>

      <section className="editor-panel canon-editor-main">
        {completeness && (
          <article className="dossier canon-ribbon card--glow">
            <div className="dossier__header">
              <span>Canon Completeness</span>
              <span>{completeness.score}/100</span>
            </div>
            <div className="dossier__body canon-ribbon__body">
              <div className="canon-ribbon__metrics">
                {completenessDimensions.map(([label, score]) => (
                  <div key={label} className="canon-ribbon__metric">
                    <span>{label}</span>
                    <strong>{score}</strong>
                  </div>
                ))}
              </div>
              <div className="canon-ribbon__actions row gap wrap">
                {completeness.suggestedDirectives.slice(0, 3).map((directive, index) => (
                  <button key={`${directive.type}-${index}`} className="btn btn--ghost" onClick={() => void onIterateNow(directive)}>
                    ◈ {directive.type.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          </article>
        )}

        <article className="dossier canon-field-card">
          <div className="dossier__header canon-field-card__header">
            <span>canon.{selectedField}</span>
            <div className="row gap wrap">
              <span className="badge badge--dim">{field.status}</span>
              <span className="badge badge--dim">OWNER: {field.owner}</span>
            </div>
          </div>
          <div className="dossier__body canon-field-card__body">
            <div className="canon-field-card__summary row gap wrap">
              <span className="badge badge--dim">{formatFieldName(selectedField)}</span>
              <span className="badge badge--dim">{summarizeFieldValue(field.value)}</span>
              {selectedSuggestion && <span className="badge badge--warn">SUGGESTION READY</span>}
            </div>

            <div className="canon-field-card__value">
              {typeof field.value === "string" ? (
                <textarea
                  value={field.value}
                  disabled={field.status === "locked"}
                  onChange={(event) => setCanon(updateFieldValue(canon, selectedField, event.target.value))}
                />
              ) : (
                <>
                  <Editor
                    height="60vh"
                    defaultLanguage="json"
                    value={jsonDraft}
                    onChange={(value) => {
                      setJsonDraft(value ?? "");
                      setJsonError(null);
                    }}
                    options={{ readOnly: field.status === "locked" }}
                  />
                  {jsonError && <p className="canon-field-card__error">{jsonError}</p>}
                </>
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

            <div className="canon-field-actions row gap wrap">
              <button className="btn btn--ghost" onClick={() => void saveCurrentField()}>Save Field</button>
              <button className="btn btn--ghost" disabled={field.status === "locked"} onClick={() => void hydrateSelectedField("field")}>AI Fill ◈</button>
              <button className="btn btn--primary" onClick={async () => {
                setStatus("Regenerating package...");
                await api.runGenerate(slug, {}, (event) => {
                  if (event.event === "done") {
                    setStatus("Package regenerated.");
                  }
                });
              }}>Regenerate Package</button>
            </div>

            <div className="canon-iterate-strip">
              <div className="section-label">Iterate This Section</div>
              <div className="row gap wrap">
                {fieldActions.map((directive, index) => (
                  <button key={`${directive.type}-${index}`} className="btn btn--ghost" onClick={() => void onIterateNow(directive)}>
                    ◈ {directive.instruction}
                  </button>
                ))}
              </div>
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
          <span>Iterations</span>
          <input type="number" min={1} max={5} value={iterationCount} onChange={(event) => setIterationCount(Number(event.target.value) || 1)} />
        </label>
        <label>
          <span>Refine these areas</span>
          <input value={refinementGoals} onChange={(event) => setRefinementGoals(event.target.value)} placeholder="specificity, canon consistency, voice" />
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
                <button className="btn btn--ghost" onClick={() => void handleAcceptSuggestion(selectedSuggestion.field, true)}>Keep Edits &amp; Accept</button>
              </div>
            </div>
          </article>
        ) : (
          <p className="muted">No pending suggestion for this field yet.</p>
        )}

        <div className="section-label">History</div>
        <div className="canon-history-list">
          {history.length === 0 && <p className="muted">No canon snapshots yet.</p>}
          {history.slice(0, 8).map((entry) => (
            <article key={entry.snapshotId} className="dossier canon-history-card">
              <div className="dossier__header">
                <span>{entry.trigger.replace(/_/g, " ")}</span>
                <span>{entry.authorKind}</span>
              </div>
              <div className="dossier__body canon-history-card__body">
                <p>{formatUpdatedAt(entry.createdAt)}</p>
                <p className="muted">{entry.fieldChanges.slice(0, 2).map((change) => change.field).join(", ") || "field changes recorded"}</p>
                <button className="btn btn--ghost" onClick={async () => {
                  await api.revertCanonHistory(slug, entry.snapshotId);
                  await loadState();
                  setStatus(`Reverted to snapshot ${entry.snapshotId}.`);
                }}>Revert</button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );

  async function saveCurrentField() {
    if (!canon || !field) {
      return;
    }
    try {
      const nextCanon = materializeDraftCanon(canon, selectedField, field, jsonDraft);
      setCanon(nextCanon);
      await api.saveCanon(slug, nextCanon);
      setJsonError(null);
      await loadState();
      setStatus(`Saved canon.${selectedField}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setJsonError(message);
      setStatus(message);
    }
  }

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
        iterations: iterationCount,
        refinementGoals: splitRefinementGoals(refinementGoals),
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
          setHydrationState({ mode, field: selectedField, step: message, progress: 100 });
          setStatus(message);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hydration failed.";
      setHydrationState({ mode, field: selectedField, step: message, progress: 100 });
      setStatus(message);
    }
  }

  async function handleAcceptSuggestion(fieldPath: string, preserveEditorValue: boolean) {
    try {
      if (preserveEditorValue) {
        if (!canon || !field) {
          return;
        }
        const nextCanon = materializeDraftCanon(canon, selectedField, field, jsonDraft);
        setCanon(nextCanon);
        await api.saveCanon(slug, nextCanon);
      }

      await api.acceptSuggestion(slug, fieldPath);
      await loadState();
      setStatus(`${preserveEditorValue ? "Accepted suggestion after preserving editor edits for" : "Accepted"} ${fieldPath}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accept failed.";
      setJsonError(message);
      setStatus(message);
    }
  }
}

function splitRefinementGoals(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
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

function formatFieldName(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeFieldValue(value: unknown) {
  if (typeof value === "string") {
    return value.length > 32 ? `${value.slice(0, 32)}...` : value || "String";
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (value && typeof value === "object") {
    return `${Object.keys(value).length} keys`;
  }
  return String(value ?? "empty");
}

function updateFieldValue(canon: CanonState, field: string, value: unknown): CanonState {
  return {
    ...canon,
    canon: {
      ...canon.canon,
      [field]: {
        ...canon.canon[field],
        value,
      },
    },
  };
}

function materializeDraftCanon(canon: CanonState, selectedField: string, field: CanonField, jsonDraft: string) {
  if (typeof field.value === "string") {
    return canon;
  }

  try {
    const parsed = JSON.parse(jsonDraft);
    return updateFieldValue(canon, selectedField, parsed);
  } catch {
    throw new Error(`Invalid JSON in canon.${selectedField}.`);
  }
}

function buildFieldActions(field: string): IterationDirective[] {
  if (field === "characters") {
    return [
      { type: "develop_character", instruction: "Deepen existing character relationships and arc notes." },
      { type: "new_character", instruction: "Add one new character who pressures the current ensemble." },
    ];
  }
  if (field === "episodes") {
    return [
      { type: "develop_episode", instruction: "Deepen episode beats, scenes, and endings." },
      { type: "new_episode", instruction: "Add the next episode that best expands current arcs." },
    ];
  }
  if (field === "storylines") {
    return [{ type: "new_storyline", instruction: "Add or strengthen a storyline arc that spans the current slate." }];
  }
  if (["themes", "themes_structured", "motifs"].includes(field)) {
    return [{ type: "develop_themes", instruction: "Sharpen themes, motifs, and thematic expression." }];
  }
  if (["world_setting", "locations", "world_lore"].includes(field)) {
    return [{ type: "world_expansion", instruction: "Expand the world with clearer places, lore, and atmosphere." }];
  }
  if (field === "factions") {
    return [
      { type: "new_faction", instruction: "Add a faction or organization tied to the current character network." },
      { type: "world_expansion", instruction: "Expand the institutions that shape this world." },
    ];
  }
  return [{ type: "custom", instruction: `Refine canon.${field} for specificity and consistency.` }];
}
