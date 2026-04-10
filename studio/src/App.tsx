import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { AssetGallery } from "./views/AssetGallery";
import { CanonEditor } from "./views/CanonEditor";
import { PackagePreview } from "./views/PackagePreview";
import { ProjectDashboard } from "./views/ProjectDashboard";
import { ValidationOps } from "./views/ValidationOps";

type Tab = "Dashboard" | "Canon" | "Files" | "Site" | "Assets" | "Ops";

export function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    api.listProjects().then((response) => {
      setProjects(response.data ?? []);
      if (!selectedSlug && response.data?.[0]?.slug) {
        setSelectedSlug(response.data[0].slug);
      }
    });
  }, [selectedSlug]);

  return (
    <div data-theme={theme} className="app-shell">
      <header className="app-header">
        <div className="brand">Mediageckussy Studio</div>
        <nav className="tab-bar">
          {(["Dashboard", "Canon", "Files", "Site", "Assets", "Ops"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
      </header>

      {tab === "Dashboard" && <ProjectDashboard projects={projects} onOpen={(slug) => { setSelectedSlug(slug); setTab("Canon"); }} />}
      {tab === "Canon" && selectedSlug && <CanonEditor slug={selectedSlug} />}
      {tab === "Files" && selectedSlug && <PackagePreview slug={selectedSlug} />}
      {tab === "Site" && selectedSlug && <iframe className="site-frame" src={`/output/${selectedSlug}/site/index.html`} title="Site Preview" />}
      {tab === "Assets" && selectedSlug && <AssetGallery slug={selectedSlug} />}
      {tab === "Ops" && selectedSlug && <ValidationOps slug={selectedSlug} />}
    </div>
  );
}
