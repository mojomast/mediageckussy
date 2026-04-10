<!-- GECK TECHNICAL MANUAL // mediageckussy v2 -->

# ◈ G.E.C.K. TECHNICAL MANUAL
### MEDIA PACKAGE GENERATOR // v2.0.0 // FUTURE-TEC DIVISION

> This document constitutes the complete technical reference for the
> Garden of Eden Creation Kit - Media Package Generator. Keep it
> accessible. The wasteland doesn't debug itself.

## Studio UI

## Overview
Studio is now usable as a hosted demo shell over the generator, hydration tools, validation output, and creative asset pipeline. The current implementation is still filesystem-backed, but the browser now works through server-owned project workspaces instead of asking the client for direct output paths.

## Install & Start

```bash
npm run studio:dev
```

Hosted demo recommendation:
- default to OpenRouter with `google/gemini-2.5-flash-lite`
- optionally enable Z.AI with `glm-4.5-flash`
- keep all provider keys on the server only

## Hosted Demo Workflow
1. Create a new project from the Dashboard.
2. Choose media format, package tier, inference provider, and default model.
3. Let Studio generate the initial package inside a server-managed workspace.
4. Iterate in Canon and Files views using prompt-guided hydration.
5. Accept or reject pending field suggestions in the Canon view.
6. Preview the generated site and assets through hosted routes.
7. Export the full package as a `.tar.gz` archive from Files or Ops.

## View Reference

### Dashboard
Project cards, hosted project creation form, provider/model selection, and quick open actions.

### Canon
Field editor with locked-field protection, per-project inference settings, prompt-guided hydration, and accept/reject review for pending suggestions.

### Files
File tree, markdown preview, raw editing, AI fill trigger, and package archive download.

### Site
Embedded static site preview served through the backend instead of direct `/output/...` links.

### Assets
Generated image gallery with prompt metadata and hosted asset preview URLs.

### Ops
Validation issue list, completeness score, placeholder-fix shortcut, and archive export entry point.

## API Reference

| Method | Path |
|---|---|
| GET | `/api/studio/options` |
| GET | `/api/projects` |
| GET | `/api/projects/:slug` |
| POST | `/api/projects` |
| PUT | `/api/projects/:slug/settings` |
| GET | `/api/projects/:slug/canon` |
| PUT | `/api/projects/:slug/canon` |
| GET | `/api/projects/:slug/suggestions` |
| POST | `/api/projects/:slug/suggestions/accept` |
| POST | `/api/projects/:slug/suggestions/reject` |
| POST | `/api/projects/:slug/generate` |
| POST | `/api/projects/:slug/hydrate` |
| GET | `/api/projects/:slug/files` |
| GET | `/api/projects/:slug/files/*` |
| PUT | `/api/projects/:slug/files/*` |
| GET | `/api/projects/:slug/validation` |
| GET | `/api/projects/:slug/assets` |
| POST | `/api/projects/:slug/assets/generate` |
| GET | `/api/projects/:slug/site/*` |
| GET | `/api/projects/:slug/assets-file/*` |
| GET | `/api/projects/:slug/archive` |

## Security Notes
- Studio binds to `localhost` by default.
- Hosted demo mode now uses server-managed workspaces instead of client-supplied filesystem roots.
- File reads and writes should stay within a single project workspace.
- This is still a demo-grade hosted architecture; add auth, tenant scoping, rate limiting, and background job isolation before presenting it as a production SaaS.
