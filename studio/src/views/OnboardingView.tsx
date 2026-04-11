import { useMemo, useState } from "react";
import { api, type ProjectSummary, type StudioOptions } from "../lib/api";

type Props = {
  options: StudioOptions | null;
  projects: ProjectSummary[];
  setStatus: (value: string) => void;
  onProjectCreated: (slug: string) => void;
  onOpenProject: (slug: string) => void;
  onStartInterview: (opts: { title?: string; provider?: string; model?: string }) => void;
};

type StartMode = "interview" | "quick-ai" | "blank";

const MEDIA_LABELS: Record<string, string> = {
  tv_series: "TV Series",
  feature_film: "Feature Film",
  podcast: "Podcast",
  web_series: "Web Series",
};

export function OnboardingView({ options, projects, setStatus, onProjectCreated, onOpenProject, onStartInterview }: Props) {
  const [mediaType, setMediaType] = useState(options?.formats[0] ?? "tv_series");
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [provider, setProvider] = useState(options?.providers.find((item) => item.available)?.id ?? "openrouter");
  const [model, setModel] = useState(options?.providers.find((item) => item.available)?.model ?? "google/gemini-2.5-flash-lite");
  const [isLaunching, setIsLaunching] = useState<StartMode | null>(null);

  const availableProviders = useMemo(() => options?.providers.filter((item) => item.available) ?? [], [options]);
  const activeProjects = projects.filter((project) => !project.archived);

  return (
    <main className="dashboard-layout onboarding-layout">
      <section className="card card--glow onboarding-hero">
        <div>
          <div className="section-label">New Project</div>
          <h1 className="text-display">Start from format, facts, and mode.</h1>
          <p className="muted">Pick the package shape, seed the canon, then choose whether to interview, draft with AI, or start clean.</p>
        </div>
        <div className="onboarding-provider-row">
          <label>
            <span>Provider</span>
            <select value={provider} onChange={(event) => {
              const next = availableProviders.find((item) => item.id === event.target.value);
              setProvider(event.target.value);
              setModel(next?.model ?? "");
            }}>
              {availableProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel onboarding-panel">
        <div className="section-label">1. Media Type</div>
        <div className="dashboard-grid onboarding-media-grid">
          {(options?.formats ?? ["tv_series", "feature_film", "podcast", "web_series"]).map((format) => (
            <button key={format} className={`card onboarding-card ${mediaType === format ? "onboarding-card--active" : ""}`} onClick={() => setMediaType(format)}>
              <strong>{MEDIA_LABELS[format] ?? format.replace(/_/g, " ")}</strong>
              <span>{format === "tv_series" ? "Season grid, canon growth, press+site package" : format === "feature_film" ? "Feature pitch, world, cast, partner materials" : format === "podcast" ? "Show format, episodes, host and sponsor kit" : "Episodes, creator package, launch site"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel onboarding-panel">
        <div className="section-label">2. Quick Facts</div>
        <div className="form-grid">
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Required" />
          </label>
          <label>
            <span>Genre</span>
            <input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Optional" />
          </label>
          <label className="full-width">
            <span>Logline</span>
            <textarea className="hint-area compact" value={logline} onChange={(event) => setLogline(event.target.value)} placeholder="Optional" />
          </label>
          <label>
            <span>Tone</span>
            <input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="funny, tense, grounded" />
          </label>
          <label>
            <span>Audience</span>
            <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="fans of..., streamers, buyers" />
          </label>
        </div>
      </section>

      <section className="panel onboarding-panel">
        <div className="section-label">3. Start Mode</div>
        <div className="dashboard-grid onboarding-mode-grid">
          <button className="card onboarding-card" disabled={!title.trim() || isLaunching !== null} onClick={() => void launch("interview")}>
            <strong>Interview Me</strong>
            <span>Use the guided intake flow with your title and provider preselected.</span>
          </button>
          <button className="card onboarding-card" disabled={!title.trim() || isLaunching !== null} onClick={() => void launch("quick-ai")}>
            <strong>Quick AI Draft</strong>
            <span>Create the project, seed the canon, run one short `suggest_next` iteration, then open canon.</span>
          </button>
          <button className="card onboarding-card" disabled={!title.trim() || isLaunching !== null} onClick={() => void launch("blank")}>
            <strong>Start Blank</strong>
            <span>Create the hosted project with the quick facts only, then edit canon directly.</span>
          </button>
        </div>
      </section>

      {activeProjects.length > 0 && (
        <section className="panel onboarding-panel">
          <div className="row between wrap">
            <div>
              <div className="section-label">Existing Projects</div>
              <h2>Continue where the package is thinnest.</h2>
            </div>
          </div>
          <div className="dashboard-grid">
            {activeProjects.map((project) => (
              <article key={project.slug} className="dossier project-dossier card--glow">
                <div className="dossier__header">
                  <span>{MEDIA_LABELS[project.mediaType] ?? project.mediaType}</span>
                  <span className="badge badge--dim">{project.validation.completenessScore}% complete</span>
                </div>
                <div className="dossier__body project-dossier__body">
                  <h3 className="project-dossier__title text-display">{project.title}</h3>
                  <div className="project-dossier__progress">
                    <div className="progress-bar">
                      <div className="progress-bar__fill" style={{ width: `${project.validation.completenessScore}%` }} />
                    </div>
                  </div>
                  <div className="row gap wrap project-dossier__actions">
                    <button className="btn btn--ghost" onClick={() => onOpenProject(project.slug)}>Open Canon</button>
                    <button className="btn btn--ghost" onClick={() => onProjectCreated(project.slug)}>Open Workspace</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );

  async function launch(mode: StartMode) {
    if (!title.trim()) {
      setStatus("Title is required.");
      return;
    }

    setIsLaunching(mode);
    setStatus(mode === "quick-ai" ? `Creating ${title} and running a quick AI draft...` : `Creating ${title}...`);
    try {
      if (mode === "interview") {
        onStartInterview({ title: title.trim(), provider, model });
        return;
      }

      const payload = buildProjectPayload({
        title: title.trim(),
        mediaType,
        logline,
        genre,
        tone,
        audience,
        provider,
        model,
      });

      let createdSlug = "";
      await api.createProject(payload, (event) => {
        if (event.event === "started" && typeof event.data === "object" && event.data && "slug" in (event.data as Record<string, unknown>)) {
          createdSlug = String((event.data as { slug: unknown }).slug);
        }
      });

      if (!createdSlug) {
        throw new Error("Project creation did not return a slug.");
      }

      if (mode === "quick-ai") {
        await api.startIterationSession(createdSlug, {
          mode: "gated",
          maxRuns: 1,
          provider,
          model,
          planner: { strategy: "adaptive", avoidRecentWindow: 1 },
          firstDirective: {
            type: "suggest_next",
            instruction: `Propose the most valuable next canon expansion for ${title.trim()} using the seeded quick facts.`,
          },
        }, () => undefined);
      }

      onProjectCreated(createdSlug);
      setStatus(mode === "quick-ai" ? `Quick draft ready for ${createdSlug}.` : `Project ${createdSlug} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to launch project.");
    } finally {
      setIsLaunching(null);
    }
  }
}

function buildProjectPayload(input: {
  title: string;
  mediaType: string;
  logline: string;
  genre: string;
  tone: string;
  audience: string;
  provider: string;
  model: string;
}) {
  return {
    title: input.title,
    mediaType: input.mediaType,
    packageTier: "full",
    provider: input.provider,
    model: input.model,
    canonYaml: JSON.stringify({
      id: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      package_tier: "full",
      outputs: {
        website: { enabled: true },
        press_bundle: { enabled: true },
        partner_bundle: { enabled: true },
      },
      canon: {
        title: field(input.title, "locked", "user", 1, "public"),
        logline: field(input.logline || `A ${input.mediaType.replace(/_/g, " ")} project called ${input.title}.`),
        format: field(input.mediaType, "locked", "user", 1, "public"),
        genre: field(input.genre || "genre to be refined"),
        tone: field(splitCommaList(input.tone).length > 0 ? splitCommaList(input.tone) : ["aspirational", "grounded"]),
        audience: field(splitCommaList(input.audience).length > 0 ? splitCommaList(input.audience) : ["early demo users"], "draft", "editor", 0.6, "internal"),
        comps: field(["reference comp 1", "reference comp 2"]),
        duration_count: field(input.mediaType === "feature_film" ? "100 min" : "8 x 30 min"),
        themes: field(["core theme", "secondary theme"]),
        world_setting: field("Set the world and context here."),
        production_assumptions: field(["small team", "iterative draft workflow"], "draft", "editor", 0.6, "internal"),
        business_assumptions: field(["demo-ready package export"], "draft", "editor", 0.6, "internal"),
        legal_assumptions: field(["review before publication"], "draft", "editor", 0.6, "internal"),
        publication_flags: field({ site_enabled: true, partner_bundle_enabled: true, press_bundle_enabled: true }, "approved", "producer", 0.9, "internal"),
        characters: field([{ id: "lead", name: "Lead", role: "protagonist", description: "Primary character draft.", visibility: "public" }]),
        episodes: field([{ code: "E01", title: "Pilot", logline: "Opening installment draft.", status: "draft", visibility: "public" }]),
        structure: field([{ id: "act-1", title: "Opening movement", summary: "Initial structure draft.", visibility: "public" }]),
      },
    }, null, 2),
  };
}

function field(value: unknown, status = "draft", owner = "editor", confidence = 0.6, visibility = "public") {
  return {
    value,
    status,
    owner,
    updated_at: new Date().toISOString(),
    confidence,
    downstream_dependencies: [],
    visibility,
  };
}

function splitCommaList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
