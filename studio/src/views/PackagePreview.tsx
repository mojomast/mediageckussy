import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

export function PackagePreview({ slug, status, setStatus }: { slug: string; status: string; setStatus: (value: string) => void }) {
  const [files, setFiles] = useState<Array<{ path: string; type: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [promptHint, setPromptHint] = useState("Replace placeholders with polished draft copy that matches the canon tone.");

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
            await api.runHydrate(slug, { file: selected, promptHint }, () => undefined);
            const refreshed = await api.getFile(slug, selected);
            setContent(refreshed.data.content);
            setStatus(`Updated ${selected}.`);
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
        <p className="status-inline">{status}</p>
        {editing ? <Editor height="70vh" defaultLanguage="markdown" value={content} onChange={(value) => setContent(value ?? "")} /> : <ReactMarkdown>{content}</ReactMarkdown>}
      </section>
    </div>
  );
}
