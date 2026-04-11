import { useEffect, useState } from "react";
import { AppShell, type WorkspaceTab } from "./components/AppShell";
import { api, type ProjectSummary, type StudioOptions } from "./lib/api";
import { AssetGallery } from "./views/AssetGallery";
import { CanonEditor } from "./views/CanonEditor";
import { InterviewView } from "./views/InterviewView";
import { IterationView } from "./views/IterationView";
import { PackagePreview } from "./views/PackagePreview";
import { ProjectDashboard } from "./views/ProjectDashboard";
import { ValidationOps } from "./views/ValidationOps";

type Tab = Exclude<WorkspaceTab, "Interview">;
type View = { kind: "workspace"; tab: Tab } | { kind: "interview" };

export function App() {
  const [view, setView] = useState<View>(resolveViewFromPath());
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(resolveSlugFromPath());
  const [options, setOptions] = useState<StudioOptions | null>(null);
  const [status, setStatus] = useState("Ready to create or continue a hosted demo project.");
  const [projectSettings, setProjectSettings] = useState<{ llmProvider: string; llmModel: string } | null>(null);

  const tab = view.kind === "workspace" ? view.tab : "Dashboard";
  const inInterview = view.kind === "interview";
  const selectedProject = selectedSlug ? projects.find((project) => project.slug === selectedSlug) : null;
  const shellProjectTitle = selectedProject?.title ?? (inInterview ? "NEW PROJECT INITIALIZATION" : "NO PROJECT LOADED");

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

  useEffect(() => {
    if (view.kind === "interview") {
      document.title = "Interview | Mediageckussy Studio";
      return;
    }

    const suffix = selectedSlug ? ` - ${selectedSlug}` : "";
    const title = view.tab === "Dashboard"
      ? "Dashboard"
        : view.tab === "Canon"
          ? "Canon"
          : view.tab === "Iterate"
            ? "Iterate"
          : view.tab === "Files"
            ? "Files"
          : view.tab === "Site"
            ? "Site"
            : view.tab === "Assets"
              ? "Assets"
              : "Ops";
    document.title = `${title}${suffix} | Mediageckussy Studio`;
  }, [selectedSlug, view]);

  return (
    <AppShell
      activeTab={inInterview ? "Interview" : tab}
      projectTitle={shellProjectTitle}
      onSelectTab={(nextTab) => {
        if (nextTab === "Interview") {
          setView({ kind: "interview" });
          setStatus("Interview mode.");
          return;
        }

        setView({ kind: "workspace", tab: nextTab });
      }}
    >
      {!inInterview && tab === "Dashboard" && <ProjectDashboard
        projects={projects}
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
      />}

      {inInterview && <InterviewView options={options} onProjectReady={(slug) => {
        setSelectedSlug(slug);
        setStatus(`Project ${slug} generated.`);
        void refreshProjects();
      }} onOpenProject={(slug) => {
        setSelectedSlug(slug);
        setView({ kind: "workspace", tab: "Canon" });
        void refreshProjects();
      }} />}

      {!inInterview && tab === "Canon" && selectedSlug && <CanonEditor slug={selectedSlug} projectSettings={projectSettings} onProjectSettingsChange={setProjectSettings} status={status} setStatus={setStatus} />}
      {!inInterview && tab === "Iterate" && selectedSlug && <IterationView slug={selectedSlug} projectSettings={projectSettings} setStatus={setStatus} />}
      {!inInterview && tab === "Files" && selectedSlug && <PackagePreview slug={selectedSlug} status={status} setStatus={setStatus} />}
      {!inInterview && tab === "Site" && selectedSlug && <iframe className="site-frame" src={api.siteUrl(selectedSlug)} title="Site Preview" />}
      {!inInterview && tab === "Assets" && selectedSlug && <AssetGallery slug={selectedSlug} setStatus={setStatus} />}
      {!inInterview && tab === "Ops" && selectedSlug && <ValidationOps slug={selectedSlug} setStatus={setStatus} />}
    </AppShell>
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
  if (window.location.pathname.includes("/iterate")) return "Iterate";
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
  if (view.tab === "Iterate") return `/projects/${slug}/iterate`;
  if (view.tab === "Files") return `/projects/${slug}/files`;
  if (view.tab === "Site") return `/projects/${slug}/site`;
  if (view.tab === "Assets") return `/projects/${slug}/assets`;
  if (view.tab === "Ops") return `/projects/${slug}/ops`;
  return "/";
}
