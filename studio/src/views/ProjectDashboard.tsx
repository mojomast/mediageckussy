import { useEffect, useState } from "react";
import { api, type IterationSession, type ProjectSummary } from "../lib/api";

type Props = {
  projects: ProjectSummary[];
  status: string;
  setStatus?: (value: string) => void;
  onOpen: (slug: string) => void;
  onContinueIterating: (slug: string) => void;
  onIterateSuggested: (slug: string) => Promise<void>;
  onStartInterview: () => void;
  onProjectsChange?: () => Promise<void>;
};

export function ProjectDashboard({ projects, status, setStatus, onOpen, onContinueIterating, onIterateSuggested, onStartInterview, onProjectsChange }: Props) {
  const hasProjects = projects.length > 0;
  const [iterationMeta, setIterationMeta] = useState<Record<string, { label: string; hasSession: boolean }>>({});
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (projects.length === 0) {
      setIterationMeta({});
      return;
    }

    void Promise.all(projects.map(async (project) => {
      try {
        const sessions = await api.listIterationSessions(project.slug);
        return [project.slug, summarizeLatestSession(sessions)] as const;
      } catch {
        return [project.slug, { label: "LAST ITERATION: NONE", hasSession: false }] as const;
      }
    })).then((entries) => {
      if (!cancelled) {
        setIterationMeta(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projects]);

  return (
    <main className="dashboard-layout">
      {!hasProjects && (
        <section className="dashboard-empty dot-grid">
          <div className="dashboard-empty__glyph text-glow">◈</div>
          <h1 className="dashboard-empty__title text-display">G.E.C.K.</h1>
          <p className="dashboard-empty__subtitle">Media Package Generator</p>
          <div className="dashboard-empty__rule" aria-hidden="true" />
          <p className="dashboard-empty__unit">UNIT v2.0.0 // FUTURE-TEC DIVISION</p>
          <div className="dashboard-empty__rule" aria-hidden="true" />
          <p className="dashboard-empty__lead">
            This kit contains everything required to establish a viable media project in the post-development wasteland.
          </p>
          <div className="dashboard-empty__contents">
            <p>Contents include:</p>
            <ul>
              <li>Canon lock file and field provenance system</li>
              <li>AI-assisted copy hydration</li>
              <li>Creative asset generation</li>
              <li>Static site export and archive delivery</li>
            </ul>
          </div>
          <button className="btn btn--primary dashboard-empty__cta" onClick={onStartInterview}>Initialize New Project</button>
          <div className="divider-starburst">Or Load Existing Canon</div>
          <div className="dashboard-dropzone" role="presentation">
            <span>DROP canon.yaml HERE</span>
          </div>
          <p className="status-inline">{status}</p>
        </section>
      )}

      {hasProjects && (
        <>
          <section className="card card--glow interview-banner dashboard-banner">
            <div>
              <div className="dashboard-banner__title">◈ NEW PROJECT? START WITH AN INTERVIEW</div>
              <p>Answer ~15 questions. Walk away with a full package.</p>
            </div>
            <button className="btn btn--primary" onClick={onStartInterview}>Begin Interview →</button>
          </section>

          <section className="dashboard-grid">
            {projects.map((project) => {
              const suggestionTone = project.pendingSuggestionCount > 0 ? "text-glow--amber" : "muted";
              const suggestionText = project.pendingSuggestionCount > 0
                ? `${project.pendingSuggestionCount} suggestions pending`
                : "0 suggestions pending";
              const renameDraft = renameDrafts[project.slug] ?? project.title;
              const isBusy = busySlug === project.slug;

              return (
                <article key={project.slug} className="dossier project-dossier card--glow">
                  <div className="dossier__header">
                    <span>Dossier</span>
                    <div className="row gap wrap">
                      {project.archived && <span className="badge badge--dim">Archived</span>}
                      <span className="badge badge--dim">{formatLabel(project.mediaType)}</span>
                      <span className={`badge ${project.validation.ok ? "badge--ok" : "badge--warn"}`}>
                        {project.validation.ok ? "Draft" : "Review"}
                      </span>
                    </div>
                  </div>
                  <div className="dossier__body project-dossier__body">
                    <h2 className="project-dossier__title text-display">{project.title}</h2>
                    <p className="project-dossier__meta">
                      Generated: {formatGeneratedAt(project.generatedAt)} // <span className={suggestionTone}>{suggestionText}</span>
                    </p>
                    <div className="project-dossier__progress">
                      <div className="progress-bar" aria-label="Project completeness">
                        <div className="progress-bar__fill" style={{ width: `${project.validation.completenessScore}%` }} />
                      </div>
                      <span>{project.validation.completenessScore}% complete</span>
                    </div>
                    <div className="project-settings-panel">
                      <label>
                        <span className="section-label">Project Settings</span>
                        <input value={renameDraft} onChange={(event) => setRenameDrafts((current) => ({ ...current, [project.slug]: event.target.value }))} />
                      </label>
                      <div className="row gap wrap project-settings-panel__actions">
                        <button className="btn btn--ghost" disabled={isBusy || renameDraft.trim() === project.title} onClick={() => void runProjectAction(project.slug, async () => {
                          await api.renameProject(project.slug, renameDraft);
                        })}>Rename</button>
                        <button className="btn btn--ghost" disabled={isBusy} onClick={() => void runProjectAction(project.slug, async () => {
                          await api.duplicateProject(project.slug);
                        })}>Duplicate</button>
                        {!project.archived && <button className="btn btn--ghost" disabled={isBusy} onClick={() => void runProjectAction(project.slug, async () => {
                          await api.archiveProject(project.slug);
                        })}>Archive</button>}
                        {project.archived && <button className="btn btn--ghost" disabled={isBusy} onClick={() => void runProjectAction(project.slug, async () => {
                          await api.unarchiveProject(project.slug);
                        })}>Unarchive</button>}
                        <button className="btn btn--danger" disabled={isBusy} onClick={() => void runProjectAction(project.slug, async () => {
                          await api.deleteProject(project.slug);
                        })}>Delete</button>
                      </div>
                    </div>
                    <p className="project-dossier__meta">{iterationMeta[project.slug]?.label ?? "LAST ITERATION: LOADING..."}</p>
                    <div className="row gap wrap project-dossier__actions">
                      <button className="btn btn--ghost" disabled={project.archived} onClick={() => onOpen(project.slug)}>Open →</button>
                      <button className="btn btn--ghost" disabled={project.archived} onClick={() => void onIterateSuggested(project.slug)}>◈ Iterate Now</button>
                      <button className="btn btn--ghost" disabled={project.archived} onClick={() => onContinueIterating(project.slug)}>◈ Continue Iterating</button>
                      {!project.archived && <a className="btn btn--ghost" href={`/api/projects/${project.slug}/archive`}>Download Archive</a>}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );

  async function runProjectAction(slug: string, action: () => Promise<void>) {
    try {
      setBusySlug(slug);
      setStatus?.(`Updating ${slug}...`);
      await action();
      await onProjectsChange?.();
      setStatus?.(`Updated ${slug}.`);
    } catch (error) {
      setStatus?.(error instanceof Error ? error.message : `Failed to update ${slug}.`);
    } finally {
      setBusySlug(null);
    }
  }
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} // ${hours}:${minutes}`;
}

function formatLabel(mediaType: string) {
  return mediaType.replace(/_/g, " ").toUpperCase();
}

function summarizeLatestSession(sessions: IterationSession[]) {
  const latest = sessions[0];
  if (!latest) {
    return { label: "LAST ITERATION: NONE", hasSession: false };
  }

  const acceptedCount = latest.runs.reduce((count, run) => count + run.proposals.filter((proposal) => proposal.status === "accepted").length, 0);
  return {
    label: `LAST ITERATION: ${formatGeneratedAt(latest.startedAt)} // ${latest.completedRuns} runs // ${acceptedCount} proposals accepted`,
    hasSession: true,
  };
}
