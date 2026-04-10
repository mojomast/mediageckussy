import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function ValidationOps({ slug, setStatus }: { slug: string; setStatus: (value: string) => void }) {
  const [validation, setValidation] = useState<any>(null);

  useEffect(() => {
    api.getValidation(slug).then((response) => setValidation(response.data));
  }, [slug]);

  if (!validation) return <div className="panel">Loading validation...</div>;

  return (
    <section className="panel ops-list">
      <div className="row between">
        <strong>Completeness</strong>
        <span>{validation.completenessScore}</span>
      </div>
      <div className="progress"><div style={{ width: `${validation.completenessScore}%` }} /></div>
      <div className="row gap wrap">
        <button onClick={async () => {
          setStatus("Running bulk hydration...");
          await api.runHydrate(slug, { mode: "bulk" }, async () => {
            const response = await api.getValidation(slug);
            setValidation(response.data);
            setStatus("Bulk hydration finished.");
          });
        }}>Fix All Placeholders</button>
        <a className="button-link" href={api.archiveUrl(slug)}>Export Archive</a>
      </div>
      {validation.issues.map((issue: any, index: number) => (
        <div key={index} className={`issue ${issue.level}`}>
          <strong>{issue.code}</strong>
          <p>{issue.message}</p>
        </div>
      ))}
    </section>
  );
}
