# Studio UI

## Overview
Studio is a local-first interface over the generator, hydration tools, validation output, and creative asset pipeline. It is intended for localhost-only use.

## Install & Start

```bash
npm run studio:dev
```

## View Reference

### Dashboard
Project cards with validation status and quick open actions.

### Canon
Field editor with locked-field protection and an AI suggestion panel.

### Files
File tree, markdown preview, raw editing, and AI fill trigger.

### Site
Embedded static site preview.

### Assets
Generated image gallery with prompt metadata.

### Ops
Validation issue list, completeness score, and placeholder-fix shortcut.

## API Reference

| Method | Path |
|---|---|
| GET | `/api/projects` |
| GET | `/api/projects/:slug` |
| POST | `/api/projects` |
| GET | `/api/projects/:slug/canon` |
| PUT | `/api/projects/:slug/canon` |
| POST | `/api/projects/:slug/generate` |
| POST | `/api/projects/:slug/hydrate` |
| GET | `/api/projects/:slug/files` |
| GET | `/api/projects/:slug/files/*` |
| PUT | `/api/projects/:slug/files/*` |
| GET | `/api/projects/:slug/validation` |
| GET | `/api/projects/:slug/assets` |
| POST | `/api/projects/:slug/assets/generate` |

## Security Notes
- Studio binds to `localhost` by default.
- Do not expose it to a shared network.
- Routes operate on local canon lockfiles and generated outputs directly.
