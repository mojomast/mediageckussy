import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../lib/api";

export function CanonEditor({ slug }: { slug: string }) {
  const [canon, setCanon] = useState<any>(null);
  const [selectedField, setSelectedField] = useState<string>("title");

  useEffect(() => {
    api.getCanon(slug).then((response) => setCanon(response.data));
  }, [slug]);

  if (!canon) return <div className="panel">Loading canon...</div>;

  const field = canon.canon[selectedField];

  return (
    <div className="three-column">
      <aside className="panel sidebar">
        {Object.entries(canon.canon).map(([key, value]: [string, any]) => (
          <button key={key} className="field-button" onClick={() => setSelectedField(key)}>
            <span className={`status-dot ${value.status}`}></span>
            {key}
          </button>
        ))}
      </aside>
      <section className="panel">
        <h2>{selectedField}</h2>
        {typeof field.value === "string" ? (
          <textarea value={field.value} disabled={field.status === "locked"} onChange={(event) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: event.target.value } } })} />
        ) : (
          <Editor height="60vh" defaultLanguage="json" value={JSON.stringify(field.value, null, 2)} onChange={(value) => setCanon({ ...canon, canon: { ...canon.canon, [selectedField]: { ...field, value: JSON.parse(value ?? "null") } } })} options={{ readOnly: field.status === "locked" }} />
        )}
        <button onClick={() => api.saveCanon(slug, canon)}>Save Canon</button>
      </section>
      <aside className="panel ai-panel">
        <h3>AI</h3>
        <button onClick={() => api.stream(`/api/projects/${slug}/hydrate`, { field: `canon.${selectedField}` }, () => undefined)}>Suggest</button>
        <p>Pending suggestions stay explicit until accepted or rejected.</p>
      </aside>
    </div>
  );
}
