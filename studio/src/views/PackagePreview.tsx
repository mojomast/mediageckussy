import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { api, type ProjectExportInclude, type ProjectExportVisibility } from "../lib/api";

export function PackagePreview({ slug, status, setStatus }: { slug: string; status: string; setStatus: (value: string) => void }) {
  const [files, setFiles] = useState<Array<{ path: string; type: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [promptHint, setPromptHint] = useState("Replace placeholders with polished draft copy that matches the canon tone.");
  const [iterationCount, setIterationCount] = useState(2);
  const [refinementGoals, setRefinementGoals] = useState("clarity, canon consistency, audience fit");
  const [hydrationProgress, setHydrationProgress] = useState<{ step: string; progress: number } | null>(null);
  const [exportInclude, setExportInclude] = useState<ProjectExportInclude[]>(["docs", "site", "canon"]);
  const [exportVisibility, setExportVisibility] = useState<ProjectExportVisibility>("all");
  const [isExporting, setIsExporting] = useState(false);

  async function refreshFiles() {
    const response = await api.getFiles(slug);
    setFiles(response.data ?? []);
    const firstFile = (response.data ?? []).find((entry: any) => entry.type === "file");
    if (!selected && firstFile) setSelected(firstFile.path);
  }

  useEffect(() => {
    void refreshFiles();
  }, [slug]);

  useEffect(() => {
    if (!selected) return;
    api.getFile(slug, selected).then((response) => setContent(response.data.content));
  }, [selected, slug]);

  return (
    <div className="two-column hosted-grid">
      <aside className="panel sidebar">
        <div className="section-label">Generated Files</div>
        {files.filter((entry) => entry.type === "file").map((entry) => (
          <button key={entry.path} className={`file-button ${selected === entry.path ? "selected" : ""}`} onClick={() => setSelected(entry.path)}>{entry.path}</button>
        ))}
        <div className="export-panel">
          <div className="section-label">Export</div>
          <div className="export-panel__group">
            <span className="muted">Include</span>
            {EXPORT_INCLUDE_OPTIONS.map((option) => (
              <label key={option.value} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={exportInclude.includes(option.value)}
                  onChange={() => setExportInclude((current) => current.includes(option.value)
                    ? current.filter((entry) => entry !== option.value)
                    : [...current, option.value])}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <div className="export-panel__group">
            <span className="muted">Visibility</span>
            {EXPORT_VISIBILITY_OPTIONS.map((option) => (
              <label key={option.value} className="checkbox-row">
                <input
                  type="radio"
                  name="export-visibility"
                  checked={exportVisibility === option.value}
                  onChange={() => setExportVisibility(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <div className="export-panel__actions">
            <button className="btn btn--primary" disabled={isExporting || exportInclude.length === 0} onClick={() => void downloadZip()}>
              Download ZIP
            </button>
            <button className="btn btn--ghost" disabled={isExporting || exportInclude.length === 0} onClick={() => void copyManifest()}>
              Copy Manifest
            </button>
          </div>
        </div>
      </aside>
      <section className="panel">
        <div className="row between wrap">
          <div>
            <div className="section-label">Package Workspace</div>
            <h2>{selected ?? "Select a file"}</h2>
          </div>
          <a className="button-link" href={api.archiveUrl(slug)}>Download Archive</a>
        </div>
        <div className="row gap wrap">
          <button onClick={() => setEditing(!editing)}>{editing ? "Preview" : "Edit"}</button>
          {selected && <button onClick={async () => {
            setStatus(`Hydrating ${selected}...`);
            setHydrationProgress({ step: `Preparing ${selected}...`, progress: 15 });
            await api.runHydrate(slug, {
              file: selected,
              promptHint,
              iterations: iterationCount,
              refinementGoals: splitGoals(refinementGoals),
            }, (event) => {
              if (event.event === "progress" && typeof event.data === "object" && event.data) {
                const data = event.data as { message?: string; progress?: number };
                setHydrationProgress({ step: String(data.message ?? "Hydrating file..."), progress: Number(data.progress ?? 50) });
              }
              if (event.event === "started") {
                setHydrationProgress({ step: `Submitting ${selected} for AI fill...`, progress: 35 });
              }
              if (event.event === "done") {
                setHydrationProgress({ step: `${selected} updated.`, progress: 100 });
              }
            });
            const refreshed = await api.getFile(slug, selected);
            setContent(refreshed.data.content);
            setStatus(`Updated ${selected}.`);
            setTimeout(() => setHydrationProgress(null), 800);
          }}>AI Fill</button>}
          {editing && selected && <button onClick={async () => {
            await api.saveFile(slug, selected, content);
            setStatus(`Saved ${selected}.`);
          }}>Save</button>}
        </div>
        <label>
          <span>Prompt hint</span>
          <textarea className="hint-area compact" value={promptHint} onChange={(event) => setPromptHint(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            <span>Iterations</span>
            <input type="number" min={1} max={5} value={iterationCount} onChange={(event) => setIterationCount(Number(event.target.value) || 1)} />
          </label>
          <label>
            <span>Refine these areas</span>
            <input value={refinementGoals} onChange={(event) => setRefinementGoals(event.target.value)} placeholder="clarity, canon consistency, audience fit" />
          </label>
        </div>
        {hydrationProgress && (
          <div className="hydration-inline-status">
            <div className="row between wrap">
              <span className="section-label">Document Hydration</span>
              <span>{hydrationProgress.progress}%</span>
            </div>
            <div className="progress-bar" aria-label="Document hydration progress">
              <div className="progress-bar__fill" style={{ width: `${hydrationProgress.progress}%` }} />
            </div>
            <p className="muted">{hydrationProgress.step}</p>
          </div>
        )}
        <p className="status-inline">{status}</p>
        {editing ? <Editor height="70vh" defaultLanguage="markdown" value={content} onChange={(value) => setContent(value ?? "")} /> : <ReactMarkdown>{content}</ReactMarkdown>}
      </section>
    </div>
  );

  async function downloadZip() {
    setIsExporting(true);
    setStatus(`Building ${slug} export...`);
    try {
      const result = await api.downloadProjectExport(slug, {
        format: "zip",
        include: exportInclude,
        visibility: exportVisibility,
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${result.filename}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  async function copyManifest() {
    setIsExporting(true);
    setStatus(`Building ${slug} manifest...`);
    try {
      const manifest = await api.exportProjectManifest(slug, {
        format: "folder-manifest",
        include: exportInclude,
        visibility: exportVisibility,
      });
      await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
      setStatus(`Copied export manifest for ${slug}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Manifest export failed.");
    } finally {
      setIsExporting(false);
    }
  }
}

function splitGoals(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

const EXPORT_INCLUDE_OPTIONS: Array<{ value: ProjectExportInclude; label: string }> = [
  { value: "docs", label: "Docs" },
  { value: "site", label: "Site" },
  { value: "canon", label: "Canon" },
  { value: "assets", label: "Assets" },
];

const EXPORT_VISIBILITY_OPTIONS: Array<{ value: ProjectExportVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "all", label: "All" },
];
