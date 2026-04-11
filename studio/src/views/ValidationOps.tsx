import { useEffect, useMemo, useState } from "react";
import { api, type CanonCompletenessReport, type IterationDirective } from "../lib/api";

export function ValidationOps({ slug, setStatus, onIterateNow }: { slug: string; setStatus: (value: string) => void; onIterateNow: (directive: IterationDirective) => Promise<void> }) {
  const [validation, setValidation] = useState<any>(null);
  const [completeness, setCompleteness] = useState<CanonCompletenessReport | null>(null);

  const dimensions = useMemo(() => completeness ? [
    { key: "characters", label: "Characters", max: 25, ...completeness.dimensions.characters },
    { key: "episodes", label: "Episodes", max: 25, ...completeness.dimensions.episodes },
    { key: "themes", label: "Themes", max: 20, ...completeness.dimensions.themes },
    { key: "world", label: "World", max: 15, ...completeness.dimensions.world },
    { key: "storylines", label: "Storylines", max: 15, ...completeness.dimensions.storylines },
  ] : [], [completeness]);

  useEffect(() => {
    void loadOpsState();
  }, [slug]);

  if (!validation || !completeness) return <div className="panel">Loading validation...</div>;

  return (
    <section className="panel ops-list">
      <div className="dossier canon-ribbon card--glow">
        <div className="dossier__header">
          <span>Ops Summary</span>
          <span>{completeness.score}/100 canon // {validation.completenessScore}% package</span>
        </div>
        <div className="dossier__body canon-ribbon__body">
          <div className="canon-ribbon__metrics">
            {dimensions.map((dimension) => (
              <div key={dimension.key} className="canon-ribbon__metric">
                <span>{dimension.label}</span>
                <strong>{dimension.score}</strong>
              </div>
            ))}
          </div>
          <div className="row gap wrap">
            {completeness.suggestedDirectives.slice(0, 4).map((directive, index) => (
              <button key={`${directive.type}-${index}`} className="btn btn--ghost" onClick={() => void onIterateNow(directive)}>
                ◈ {directive.type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dossier iteration-panel card--glow">
        <div className="dossier__header">
          <span>Canon Completeness</span>
          <span>{completeness.score}/100</span>
        </div>
        <div className="dossier__body iteration-panel__body">
          {dimensions.map((dimension) => (
            <div key={dimension.key} className="iteration-review-summary">
              <div className="row between wrap">
                <strong>{dimension.label}</strong>
                <span>{dimension.score}/{dimension.max} pts</span>
              </div>
              <div className="progress-bar" aria-label={`${dimension.label} completeness`}>
                <div className="progress-bar__fill" style={{ width: `${(dimension.score / dimension.max) * 100}%` }} />
              </div>
              {dimension.gaps[0] && <p className="muted">{dimension.gaps[0]}</p>}
            </div>
          ))}

          <div className="section-label">Suggested Next Actions</div>
          <div className="iteration-proposal-list">
            {completeness.suggestedDirectives.slice(0, 3).map((directive, index) => (
              <article key={`${directive.type}-${index}`} className="dossier iteration-proposal-card">
                <div className="dossier__header">
                  <span>{directive.type.replace(/_/g, " ").toUpperCase()}</span>
                  <span>{directive.targetId ?? "GENERAL"}</span>
                </div>
                <div className="dossier__body iteration-proposal-card__body">
                  <p>{directive.instruction}</p>
                  <button className="btn btn--primary" onClick={() => void onIterateNow(directive)}>◈ Iterate Now</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="row between">
        <strong>Completeness</strong>
        <span>{validation.completenessScore}</span>
      </div>
      <div className="progress"><div style={{ width: `${validation.completenessScore}%` }} /></div>
      <div className="row gap wrap">
        <button onClick={async () => {
          setStatus("Running bulk hydration...");
          await api.runHydrate(slug, { mode: "bulk" }, async () => {
            await loadOpsState();
            setStatus("Bulk hydration finished.");
          });
        }}>Fix All Placeholders</button>
        <a className="button-link" href={api.archiveUrl(slug)}>Export Archive</a>
      </div>
      {validation.issues.map((issue: any, index: number) => (
        <div key={index} className={`issue ${issue.level}`}>
          <strong>{issue.code}</strong>
          <p>{issue.message}</p>
        </div>
      ))}
    </section>
  );

  async function loadOpsState() {
    const [validationResponse, completenessResponse] = await Promise.all([
      api.getValidation(slug),
      api.getCompleteness(slug),
    ]);
    setValidation(validationResponse.data);
    setCompleteness(completenessResponse);
  }
}
