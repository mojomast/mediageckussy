import type { ProjectSummary } from "../lib/api";

type Props = {
  projects: ProjectSummary[];
  status: string;
  onOpen: (slug: string) => void;
  onStartInterview: () => void;
};

export function ProjectDashboard({ projects, status, onOpen, onStartInterview }: Props) {
  const hasProjects = projects.length > 0;

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

              return (
                <article key={project.slug} className="dossier project-dossier card--glow">
                  <div className="dossier__header">
                    <span>Dossier</span>
                    <div className="row gap wrap">
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
                    <div className="row gap wrap project-dossier__actions">
                      <button className="btn btn--ghost" onClick={() => onOpen(project.slug)}>Open →</button>
                      <a className="btn btn--ghost" href={`/api/projects/${project.slug}/archive`}>Download Archive</a>
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
