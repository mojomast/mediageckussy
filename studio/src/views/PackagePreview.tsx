import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

export function PackagePreview({ slug }: { slug: string }) {
  const [files, setFiles] = useState<Array<{ path: string; type: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getFiles(slug).then((response) => {
      setFiles(response.data ?? []);
      const firstFile = (response.data ?? []).find((entry: any) => entry.type === "file");
      if (firstFile) setSelected(firstFile.path);
    });
  }, [slug]);

  useEffect(() => {
    if (!selected) return;
    api.getFile(slug, selected).then((response) => setContent(response.data.content));
  }, [selected, slug]);

  return (
    <div className="two-column">
      <aside className="panel sidebar">
        {files.filter((entry) => entry.type === "file").map((entry) => (
          <button key={entry.path} className="file-button" onClick={() => setSelected(entry.path)}>{entry.path}</button>
        ))}
      </aside>
      <section className="panel">
        <div className="row gap">
          <button onClick={() => setEditing(!editing)}>{editing ? "Preview" : "Edit"}</button>
          {selected && <button onClick={() => api.stream(`/api/projects/${slug}/hydrate`, { file: selected }, () => undefined)}>AI Fill</button>}
          {editing && selected && <button onClick={() => api.saveFile(slug, selected, content)}>Save</button>}
        </div>
        {editing ? <Editor height="70vh" defaultLanguage="markdown" value={content} onChange={(value) => setContent(value ?? "")} /> : <ReactMarkdown>{content}</ReactMarkdown>}
      </section>
    </div>
  );
}
