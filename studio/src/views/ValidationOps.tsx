import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function ValidationOps({ slug }: { slug: string }) {
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
      <button onClick={() => api.stream(`/api/projects/${slug}/hydrate`, { mode: "bulk" }, () => undefined)}>Fix All Placeholders</button>
      {validation.issues.map((issue: any, index: number) => (
        <div key={index} className={`issue ${issue.level}`}>
          <strong>{issue.code}</strong>
          <p>{issue.message}</p>
        </div>
      ))}
    </section>
  );
}
