type Props = { projects: any[]; onOpen: (slug: string) => void };

export function ProjectDashboard({ projects, onOpen }: Props) {
  return (
    <main className="dashboard-grid">
      {projects.map((project) => (
        <article key={project.slug} className="card">
          <h2>{project.title}</h2>
          <p>{project.mediaType} · {project.packageTier}</p>
          <p className={`badge ${project.validation.ok ? "ok" : "warn"}`}>{project.validation.ok ? "OK" : "WARNINGS"}</p>
          <button onClick={() => onOpen(project.slug)}>Open Editor</button>
        </article>
      ))}
    </main>
  );
}
