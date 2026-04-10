import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function AssetGallery({ slug, setStatus }: { slug: string; setStatus: (value: string) => void }) {
  const [assets, setAssets] = useState<any[]>([]);

  async function loadAssets() {
    const response = await api.getAssets(slug);
    setAssets(response.data ?? []);
  }

  useEffect(() => {
    void loadAssets();
  }, [slug]);

  return (
    <section className="asset-grid">
      <div className="panel asset-toolbar">
        <div>
          <div className="section-label">Creative Assets</div>
          <h2>Generate demo-ready visuals</h2>
        </div>
        <div className="row gap wrap">
          <button onClick={async () => {
            setStatus("Generating poster...");
            await api.runAsset(slug, { type: "poster" }, async () => {
              await loadAssets();
              setStatus("Poster generated.");
            });
          }}>Poster</button>
          <button onClick={async () => {
            setStatus("Generating key art...");
            await api.runAsset(slug, { type: "key-art" }, async () => {
              await loadAssets();
              setStatus("Key art generated.");
            });
          }}>Key Art</button>
        </div>
      </div>
      {assets.map((asset) => (
        <article key={asset.path} className="card">
          <img src={api.assetUrl(slug, asset.path)} alt={asset.type} />
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
