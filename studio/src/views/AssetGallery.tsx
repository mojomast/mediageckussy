import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function AssetGallery({ slug, setStatus }: { slug: string; setStatus: (value: string) => void }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [artifactRequest, setArtifactRequest] = useState("Generate a moody hero image that sells the project at a glance.");
  const [assetProgress, setAssetProgress] = useState<{ step: string; progress: number } | null>(null);

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
            setAssetProgress({ step: "Generating poster...", progress: 35 });
            await api.runAsset(slug, { type: "poster" }, async (event) => {
              handleAssetEvent(event);
              if (event.event === "done") {
                await loadAssets();
                setStatus("Poster generated.");
              }
            });
            setTimeout(() => setAssetProgress(null), 800);
          }}>Poster</button>
          <button onClick={async () => {
            setStatus("Generating key art...");
            setAssetProgress({ step: "Generating key art...", progress: 35 });
            await api.runAsset(slug, { type: "key-art" }, async (event) => {
              handleAssetEvent(event);
              if (event.event === "done") {
                await loadAssets();
                setStatus("Key art generated.");
              }
            });
            setTimeout(() => setAssetProgress(null), 800);
          }}>Key Art</button>
        </div>
      </div>
      <article className="dossier asset-request-card">
        <div className="dossier__header">
          <span>GECK Artifact Request</span>
          <span>User-directed autonomous generation</span>
        </div>
        <div className="dossier__body asset-request-card__body">
          <label>
            <span>Request brief</span>
            <textarea className="hint-area compact" value={artifactRequest} onChange={(event) => setArtifactRequest(event.target.value)} />
          </label>
          <div className="row gap wrap">
            <button className="btn btn--primary" onClick={async () => {
              setStatus("Planning requested artifact...");
              setAssetProgress({ step: "Planning artifact from canon...", progress: 20 });
              await api.runAsset(slug, { request: artifactRequest }, async (event) => {
                handleAssetEvent(event);
                if (event.event === "done") {
                  await loadAssets();
                  setStatus("Requested artifact generated.");
                }
              });
              setTimeout(() => setAssetProgress(null), 1000);
            }}>Generate Requested Artifact</button>
          </div>
          {assetProgress && (
            <div className="hydration-inline-status">
              <div className="row between wrap">
                <span className="section-label">Artifact Pipeline</span>
                <span>{assetProgress.progress}%</span>
              </div>
              <div className="progress-bar" aria-label="Artifact generation progress">
                <div className="progress-bar__fill" style={{ width: `${assetProgress.progress}%` }} />
              </div>
              <p className="muted">{assetProgress.step}</p>
            </div>
          )}
        </div>
      </article>
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

  function handleAssetEvent(event: { event: string; data: unknown }) {
    if (event.event === "started") {
      setAssetProgress({ step: "Initializing asset pipeline...", progress: 15 });
      return;
    }

    if (event.event === "progress" && typeof event.data === "object" && event.data) {
      const data = event.data as { message?: string; progress?: number };
      setAssetProgress({ step: String(data.message ?? "Generating asset..."), progress: Number(data.progress ?? 60) });
      return;
    }

    if (event.event === "done") {
      setAssetProgress({ step: "Artifact complete.", progress: 100 });
    }
  }
}
