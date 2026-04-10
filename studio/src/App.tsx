import { useEffect, useState } from "react";
import { api, type ProjectSummary, type StudioOptions } from "./lib/api";
import { AssetGallery } from "./views/AssetGallery";
import { CanonEditor } from "./views/CanonEditor";
import { PackagePreview } from "./views/PackagePreview";
import { ProjectDashboard } from "./views/ProjectDashboard";
import { ValidationOps } from "./views/ValidationOps";

type Tab = "Dashboard" | "Canon" | "Files" | "Site" | "Assets" | "Ops";

export function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [theme, setTheme] = useState("light");
  const [options, setOptions] = useState<StudioOptions | null>(null);
  const [status, setStatus] = useState("Ready to create or continue a hosted demo project.");
  const [projectSettings, setProjectSettings] = useState<{ llmProvider: string; llmModel: string } | null>(null);

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
    if (!selectedSlug) return;
    const selected = projects.find((project) => project.slug === selectedSlug);
    setProjectSettings(selected?.settings ?? null);
  }, [projects, selectedSlug]);

  return (
    <div data-theme={theme} className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand">Mediageckussy Studio</div>
          <div className="muted">Hosted demo workspace for end-to-end media package generation.</div>
        </div>
        <nav className="tab-bar">
          {(["Dashboard", "Canon", "Files", "Site", "Assets", "Ops"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
      </header>

      {tab === "Dashboard" && <ProjectDashboard
        projects={projects}
        options={options}
        status={status}
        onOpen={(slug) => {
          setSelectedSlug(slug);
          setTab("Canon");
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
            setTab("Canon");
            setStatus(`Project ${slug} is ready.`);
          }
        }}
      />}

      {tab === "Canon" && selectedSlug && <CanonEditor slug={selectedSlug} projectSettings={projectSettings} onProjectSettingsChange={setProjectSettings} status={status} setStatus={setStatus} />}
      {tab === "Files" && selectedSlug && <PackagePreview slug={selectedSlug} status={status} setStatus={setStatus} />}
      {tab === "Site" && selectedSlug && <iframe className="site-frame" src={api.siteUrl(selectedSlug)} title="Site Preview" />}
      {tab === "Assets" && selectedSlug && <AssetGallery slug={selectedSlug} setStatus={setStatus} />}
      {tab === "Ops" && selectedSlug && <ValidationOps slug={selectedSlug} setStatus={setStatus} />}
    </div>
  );
}
