# Architecture

## v2 Shape
`media-package-generator` is still a filesystem-first TypeScript toolchain, but v2 adds two opt-in layers around the existing generator: AI hydration and a local Studio UI. The CLI remains the primary interface, and all generated state still lives in the package folder.

## Top-Level Layers
- `src/core/`: canon schema, format packs, template selection, generation, manifest writing, and validation.
- `src/cli/`: direct command surface for generation, regeneration, hydration, asset work, publishing, and onboarding.
- `src/ai/`: provider adapters, prompt loading, field/document/bulk hydration, asset generation, and mood board composition.
- `src/server/`: localhost Express wrapper around package, canon, file, validation, hydration, and asset operations.
- `studio/`: React/Vite single-page app for dashboard, canon editing, file preview, site preview, assets, and ops.

## Generation Pipeline
1. `loadCanon()` parses YAML or JSON and validates against the canon schema.
2. `getFormatPack()` resolves the stable media format implementation.
3. `TemplateRegistry` selects templates for the package tier and requested scope.
4. `generatePackage()` scaffolds directories, renders templates, and reapplies protected manual-edit regions.
5. `canon_lock.yaml`, `package_manifest.json`, and `validation_report.json` are written into the package.

## AI Layer
The hydration layer is explicit and review-first.

- `src/ai/providers/` exposes a shared `LLMProvider` contract and adapters for OpenAI, Anthropic, OpenRouter, and Ollama.
- `src/ai/hydrators/fieldHydrator.ts` drafts pending canon suggestions into `00_admin/ai_suggestions.yaml`.
- `src/ai/hydrators/docHydrator.ts` replaces placeholder markers in generated docs while preserving protected regions.
- `src/ai/hydrators/bulkHydrator.ts` runs field hydration before doc hydration and writes `00_admin/hydration_report.yaml`.
- `src/ai/prompting.ts` loads prompt templates from `src/ai/prompts/` using source-relative paths.

Hydration never silently overwrites approved or locked canon state. Accepted suggestions are merged into `00_admin/canon_lock.yaml` and mirrored into the manifest hydration log.

## Creative Assets Layer
The asset pipeline is separate from core package generation.

- `src/ai/image/` defines the image provider contract and adapters for DALL-E, Stability, Replicate, and Flux.
- `src/ai/assetGenerator.ts` builds asset prompts, writes generated images under `site/assets/generated/`, and stores `.prompt.json` sidecars.
- `src/ai/moodboard.ts` assembles multiple generated panels into a composite mood board using `sharp`.
- Generated assets are registered in `package_manifest.json` under `generatedAssets`.

## Studio Layer
The server and frontend are both local-first.

- `src/server/app.ts` creates the Express app and registers project routes.
- `src/server/api/projects.ts` exposes package discovery, canon CRUD, file CRUD, generation, hydration, validation, and asset endpoints.
- `src/server/index.ts` serves the API and, when present, the built Studio bundle from `dist-studio`.
- `studio/src/App.tsx` drives the six Studio views: Dashboard, Canon, Files, Site, Assets, and Ops.

The frontend talks to the local API only. It does not introduce any remote persistence layer or authentication stack.

## Data Contracts
- `CanonProject` remains the source-of-truth project model, now extended for AI and asset workflows.
- `PackageManifest` tracks generated files plus `generatedAssets` and `hydrationLog` entries.
- `ValidationResult` remains the package health surface consumed by both the CLI and Studio UI.

## Deployment Model
- Generated packages live in `output/<slug>/`.
- Static site exports live in `output/<slug>/site/` and are copied into `deploy/<slug>-site/` by `publish-site.ts`.
- The Studio bundle is built separately into `dist-studio/` for local serving, and the Pages workflow publishes it under `/studio/` alongside the sample demo sites.

## Current Tradeoffs
- Prompt loading depends on source-relative files in `src/ai/prompts/`, so compiled-only distributions need those prompt assets available.
- CLI argument parsing is still intentionally lightweight and manual.
- Studio route progress uses coarse SSE events (`started`, `done`, `error`) rather than a persistent job system.
