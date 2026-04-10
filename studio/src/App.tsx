import { useEffect, useState } from "react";
import { api, type ProjectSummary, type StudioOptions } from "./lib/api";
import { AssetGallery } from "./views/AssetGallery";
import { CanonEditor } from "./views/CanonEditor";
import { InterviewView } from "./views/InterviewView";
import { PackagePreview } from "./views/PackagePreview";
import { ProjectDashboard } from "./views/ProjectDashboard";
import { ValidationOps } from "./views/ValidationOps";

type Tab = "Dashboard" | "Canon" | "Files" | "Site" | "Assets" | "Ops";
type View = { kind: "workspace"; tab: Tab } | { kind: "interview" };

export function App() {
  const [view, setView] = useState<View>(resolveViewFromPath());
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(resolveSlugFromPath());
  const [theme, setTheme] = useState("light");
  const [options, setOptions] = useState<StudioOptions | null>(null);
  const [status, setStatus] = useState("Ready to create or continue a hosted demo project.");
  const [projectSettings, setProjectSettings] = useState<{ llmProvider: string; llmModel: string } | null>(null);

  const tab = view.kind === "workspace" ? view.tab : "Dashboard";
  const inInterview = view.kind === "interview";

  async function refreshProjects() {
    const [projectResponse, optionsResponse] = await Promise.all([
      api.listProjects(),
      api.getStudioOptions(),
    ]);
    const nextProjects = projectResponse.data ?? [];
    setProjects(nextProjects);
    setOptions(optionsResponse.data ?? null);
    if (!selectedSlug && nextProjects[0]?.slug) {
      setSelectedSlug(nextProjects[0].slug);
      setProjectSettings(nextProjects[0].settings ?? null);
    }
  }

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setView(resolveViewFromPath());
      setSelectedSlug(resolveSlugFromPath());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    const selected = projects.find((project) => project.slug === selectedSlug);
    setProjectSettings(selected?.settings ?? null);
  }, [projects, selectedSlug]);

  useEffect(() => {
    const nextPath = resolvePath(view, selectedSlug);
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, "", nextPath);
    }
  }, [selectedSlug, view]);

  return (
    <div data-theme={theme} className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand">Mediageckussy Studio</div>
          <div className="muted">Hosted demo workspace for end-to-end media package generation.</div>
        </div>
        <nav className="tab-bar">
          {(["Dashboard", "Canon", "Files", "Site", "Assets", "Ops"] as Tab[]).map((item) => (
            <button key={item} className={!inInterview && tab === item ? "active" : ""} onClick={() => setView({ kind: "workspace", tab: item })}>{item}</button>
          ))}
          <button className={inInterview ? "active" : ""} onClick={() => {
            setView({ kind: "interview" });
            setStatus("Interview mode.");
          }}>Interview</button>
        </nav>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
      </header>

      {!inInterview && tab === "Dashboard" && <ProjectDashboard
        projects={projects}
        options={options}
        status={status}
        onStartInterview={() => {
          setView({ kind: "interview" });
          setStatus("Interview mode.");
        }}
        onOpen={(slug) => {
          setSelectedSlug(slug);
          setView({ kind: "workspace", tab: "Canon" });
          setStatus(`Opened ${slug}.`);
        }}
        onCreate={async (input) => {
          setStatus("Creating project and generating initial package...");
          const result = await api.createProject(input, (event) => {
            if (event.event === "started") {
              setStatus("Project scaffold created. Generating package...");
            }
          });
          const doneEvent = result.events.find((event) => event.event === "done");
          const slug = typeof doneEvent?.data === "object" && doneEvent?.data && "slug" in doneEvent.data ? String((doneEvent.data as { slug: string }).slug) : null;
          await refreshProjects();
          if (slug) {
            setSelectedSlug(slug);
            setView({ kind: "workspace", tab: "Canon" });
            setStatus(`Project ${slug} is ready.`);
          }
        }}
      />}

      {inInterview && <InterviewView options={options} onOpenProject={(slug) => {
        setSelectedSlug(slug);
        setView({ kind: "workspace", tab: "Canon" });
        void refreshProjects();
      }} />}

      {!inInterview && tab === "Canon" && selectedSlug && <CanonEditor slug={selectedSlug} projectSettings={projectSettings} onProjectSettingsChange={setProjectSettings} status={status} setStatus={setStatus} />}
      {!inInterview && tab === "Files" && selectedSlug && <PackagePreview slug={selectedSlug} status={status} setStatus={setStatus} />}
      {!inInterview && tab === "Site" && selectedSlug && <iframe className="site-frame" src={api.siteUrl(selectedSlug)} title="Site Preview" />}
      {!inInterview && tab === "Assets" && selectedSlug && <AssetGallery slug={selectedSlug} setStatus={setStatus} />}
      {!inInterview && tab === "Ops" && selectedSlug && <ValidationOps slug={selectedSlug} setStatus={setStatus} />}
    </div>
  );
}

function resolveViewFromPath(): View {
  if (window.location.pathname === "/interview") {
    return { kind: "interview" };
  }
  return { kind: "workspace", tab: resolveTabFromPath() };
}

function resolveTabFromPath(): Tab {
  if (window.location.pathname.includes("/files")) return "Files";
  if (window.location.pathname.includes("/site")) return "Site";
  if (window.location.pathname.includes("/assets")) return "Assets";
  if (window.location.pathname.includes("/ops")) return "Ops";
  if (window.location.pathname.includes("/canon")) return "Canon";
  return "Dashboard";
}

function resolveSlugFromPath() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function resolvePath(view: View, slug: string | null) {
  if (view.kind === "interview") {
    return "/interview";
  }

  if (!slug || view.tab === "Dashboard") {
    return "/";
  }

  if (view.tab === "Canon") return `/projects/${slug}/canon`;
  if (view.tab === "Files") return `/projects/${slug}/files`;
  if (view.tab === "Site") return `/projects/${slug}/site`;
  if (view.tab === "Assets") return `/projects/${slug}/assets`;
  if (view.tab === "Ops") return `/projects/${slug}/ops`;
  return "/";
}
