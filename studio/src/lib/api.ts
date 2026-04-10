export const api = {
  listProjects: () => fetchJson("/api/projects"),
  getProject: (slug: string) => fetchJson(`/api/projects/${slug}`),
  getCanon: (slug: string) => fetchJson(`/api/projects/${slug}/canon`),
  saveCanon: (slug: string, canon: unknown) => fetchJson(`/api/projects/${slug}/canon`, { method: "PUT", body: JSON.stringify(canon) }),
  getFiles: (slug: string) => fetchJson(`/api/projects/${slug}/files`),
  getFile: (slug: string, filePath: string) => fetchJson(`/api/projects/${slug}/files/${filePath}`),
  saveFile: (slug: string, filePath: string, content: string) => fetchJson(`/api/projects/${slug}/files/${filePath}`, { method: "PUT", body: JSON.stringify({ content }) }),
  getAssets: (slug: string) => fetchJson(`/api/projects/${slug}/assets`),
  getValidation: (slug: string) => fetchJson(`/api/projects/${slug}/validation`),
  stream: async (path: string, body: unknown, onProgress: (event: string) => void) => {
    const response = await fetch(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    const text = await response.text();
    for (const chunk of text.split("\n\n")) {
      const match = chunk.match(/event: (.+)/);
      if (match) onProgress(match[1]);
    }
    return text;
  },
};

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response.json();
}
