import { useMemo, useState } from "react";
import type { ProjectSummary, StudioOptions } from "../lib/api";

type Props = {
  projects: ProjectSummary[];
  options: StudioOptions | null;
  status: string;
  onOpen: (slug: string) => void;
  onStartInterview: () => void;
  onCreate: (input: {
    title: string;
    mediaType: string;
    packageTier: "light" | "standard" | "full";
    provider: string;
    model: string;
  }) => Promise<void>;
};

export function ProjectDashboard({ projects, options, status, onOpen, onCreate, onStartInterview }: Props) {
  const availableProviders = useMemo(() => options?.providers.filter((provider) => provider.available) ?? [], [options]);
  const [title, setTitle] = useState("Night Signal");
  const [mediaType, setMediaType] = useState(options?.formats[0] ?? "tv_series");
  const [packageTier, setPackageTier] = useState<"light" | "standard" | "full">("full");
  const [provider, setProvider] = useState(availableProviders[0]?.id ?? "openrouter");
  const [model, setModel] = useState(availableProviders[0]?.model ?? "google/gemini-2.5-flash-lite");

  return (
    <main className="dashboard-layout">
      <section className="panel interview-banner">
        <div>
          <div className="eyebrow">◆ New here? Start with an interview →</div>
          <p>Answer a few questions and we&apos;ll build your package.</p>
        </div>
        <button className="primary-button" onClick={onStartInterview}>Start Interview</button>
      </section>

      <section className="panel launch-panel">
        <div className="eyebrow">Hosted Demo</div>
        <h1>Build a project, iterate with built-in inference, then export the package.</h1>
        <p className="muted">This Studio pass is optimized for a hosted demo flow: browser-first project creation, prompt-guided hydration, live editing, and downloadable package archives.</p>
        <div className="form-grid">
          <label>
            <span>Project title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Format</span>
            <select value={mediaType} onChange={(event) => setMediaType(event.target.value)}>
              {(options?.formats ?? []).map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </label>
          <label>
            <span>Package tier</span>
            <select value={packageTier} onChange={(event) => setPackageTier(event.target.value as "light" | "standard" | "full") }>
              {(options?.packageTiers ?? ["light", "standard", "full"]).map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </label>
          <label>
            <span>Inference provider</span>
            <select
              value={provider}
              onChange={(event) => {
                const nextProvider = availableProviders.find((item) => item.id === event.target.value);
                setProvider(event.target.value);
                setModel(nextProvider?.model ?? "");
              }}
            >
              {availableProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="full-width">
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
        </div>
        <div className="row gap wrap">
          <button className="primary-button" onClick={() => onCreate({ title, mediaType, packageTier, provider, model })}>Create Project</button>
          <span className="status-inline">{status}</span>
        </div>
      </section>

      <section className="dashboard-grid">
        {projects.length === 0 && (
          <article className="panel empty-state-card">
            <div className="eyebrow">No Projects Yet</div>
            <h2>Start with the interview or create a starter package.</h2>
            <p className="muted">Your hosted demo projects will appear here once they are generated into `output/`.</p>
            <div className="row gap wrap">
              <button className="primary-button" onClick={onStartInterview}>Start Interview</button>
              <button onClick={() => onCreate({ title, mediaType, packageTier, provider, model })}>Create Project</button>
            </div>
          </article>
        )}

        {projects.map((project) => (
          <article key={project.slug} className="card project-card">
            <div className="row between wrap">
              <h2>{project.title}</h2>
              <span className="format-badge">{project.mediaType}</span>
            </div>
            <div className="row between wrap card-topline">
              <p>{project.slug} · {project.packageTier}</p>
              <span className={`badge ${project.validation.ok ? "ok" : "warn"}`}>{project.validation.ok ? "Ready" : "Needs Work"}</span>
            </div>
            <p className="muted">Inference: {project.settings?.llmProvider ?? "default"} · {project.settings?.llmModel ?? ""}</p>
            <div className="row between wrap metric-row">
              <span>Completeness</span>
              <strong>{project.validation.completenessScore}%</strong>
            </div>
            <div className="progress"><div style={{ width: `${project.validation.completenessScore}%` }} /></div>
            <div className="row between wrap project-meta-row">
              <span className="muted">{project.pendingSuggestionCount} pending suggestions</span>
              <span className={`badge ${project.pendingSuggestionCount > 0 ? "warn" : "ok"}`}>{project.pendingSuggestionCount > 0 ? "Review Needed" : "Suggestions Clear"}</span>
            </div>
            <div className="row gap wrap">
              <button onClick={() => onOpen(project.slug)}>Open Workspace</button>
              <a className="button-link" href={`/api/projects/${project.slug}/archive`}>Download Archive</a>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
