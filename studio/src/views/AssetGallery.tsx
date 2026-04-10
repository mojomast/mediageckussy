import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function AssetGallery({ slug }: { slug: string }) {
  const [assets, setAssets] = useState<any[]>([]);

  useEffect(() => {
    api.getAssets(slug).then((response) => setAssets(response.data ?? []));
  }, [slug]);

  return (
    <section className="asset-grid">
      <button onClick={() => api.stream(`/api/projects/${slug}/assets/generate`, { type: "poster" }, () => undefined)}>Generate New</button>
      {assets.map((asset) => (
        <article key={asset.path} className="card">
          <img src={`/output/${slug}/${asset.path}`} alt={asset.type} />
          <strong>{asset.type}</strong>
          <p>{asset.model}</p>
          <details>
            <summary>View Prompt</summary>
            <pre>{asset.prompt}</pre>
          </details>
        </article>
      ))}
    </section>
  );
}
