# media-package-generator

![CI](https://img.shields.io/github/actions/workflow/status/mojomast/mediageckussy/validate.yml?branch=main)
![Version](https://img.shields.io/badge/version-2.0.0-01696f)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Canon-first media package generation for TV series first, with an extensible path toward film, podcasts, games, books/comics, albums, and web series.

`media-package-generator` turns a structured canon file into a repo-native creative package: internal docs, ops controls, audience-facing materials, and a static website that all stay aligned to the same source of truth.

## What It Is For
- Packaging media projects as coherent, navigable repositories instead of scattered documents
- Keeping creative, business, legal, press, and public-facing materials aligned to one canon model
- Generating repeatable package structures for different media formats
- Producing human-editable outputs that teams can review, extend, and ship

## Core Capabilities
- Canon-first generation from YAML or JSON
- Field-level provenance and lock metadata
- Manifest-driven package inventory
- Department- and audience-oriented deliverables
- Static website export from approved public fields
- Validation for required files, placeholders, manifest drift, and stale markdown outputs
- Partial regeneration by file, department, or whole package
- Filesystem-first deployment for any static host

## One-Line Setup And Onboarding
TV example:

```bash
npm install && npm run generate:example && npm run publish:tv && python3 -m http.server 4173 --directory deploy/neon-aftercare-site
```

Film example:

```bash
npm install && npm run generate:film && npm run publish:film && python3 -m http.server 4173 --directory deploy/glass-harbor-site
```

Podcast example:

```bash
npm install && npm run generate:podcast && npm run publish:podcast && python3 -m http.server 4173 --directory deploy/signal-and-bone-site
```

Web series example:

```bash
npm install && npm run generate:web && npm run publish:web && python3 -m http.server 4173 --directory deploy/soft-launch-site
```

Then open `http://localhost:4173`.

## Repo Name
This implementation uses `media-package-generator` as the sibling tool repo.

## What It Does
- Reads a machine-readable canon file with field-level lock metadata
- Selects a format pack and template set
- Scaffolds a repo-like package structure
- Generates markdown ops/docs deliverables and a static website export
- Emits a manifest, canon lock file, handoff doc, and validation report
- Supports whole-package, department, or file-level regeneration

## Supported Use Cases
- TV series pitch and production packages
- Feature film development and partner packages
- Podcast launch and sponsor packages
- Web series audience, sponsor, and platform packages

Current supported outputs are intentionally scaffold-first: they give you a consistent baseline package with lock metadata, ops controls, and public export, while leaving room for human writing and review.

## Supported Formats
- Stable: `tv_series`, `feature_film`, `podcast`, `web_series`
- Stubbed: `game`, `book_comic`, `album_music_project`

Use `formats` to view stable formats and `formats --all` to include stubs.

## Install
```bash
npm install
```

## Quick Start
1. Install dependencies with `npm install`.
2. Generate the sample TV package with `npm run generate:example`.
3. Preview the sample site with `npm run publish:tv` and `python3 -m http.server 4173 --directory deploy/neon-aftercare-site`.
4. Try hydration with `npx tsx src/cli/index.ts hydrate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --field canon.logline`.
5. Launch Studio with `npm run studio:dev`.

## Run
Generate the sample TV package:

```bash
npx tsx src/cli/index.ts generate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare
```

Generate the sample feature film package:

```bash
npx tsx src/cli/index.ts generate --canon examples/sample-film/canon.yaml --out output/glass-harbor
```

Generate the sample podcast package:

```bash
npx tsx src/cli/index.ts generate --canon examples/sample-podcast/canon.yaml --out output/signal-and-bone
```

Generate the sample web series package:

```bash
npx tsx src/cli/index.ts generate --canon examples/sample-web-series/canon.yaml --out output/soft-launch
```

Regenerate only website files:

```bash
npx tsx src/cli/index.ts regenerate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --department website
```

Regenerate one file:

```bash
npx tsx src/cli/index.ts regenerate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --file site/press.html
```

List format packs:

```bash
npx tsx src/cli/index.ts formats
```

Show stable and stubbed formats:

```bash
npx tsx src/cli/index.ts formats --all
```

Print onboarding steps for a sample package:

```bash
npm run onboard:tv
npm run onboard:film
npm run onboard:podcast
npm run onboard:web
```

Publish a generated static site into a deployable folder:

```bash
npm run publish:tv
npm run publish:film
npm run publish:podcast
npm run publish:web
```

## Using Your Own Project
Create a canon file modeled after the examples in `examples/`, then run:

```bash
npx tsx src/cli/index.ts generate --canon path/to/your-canon.yaml --out output/your-project-slug
```

To publish the generated site into a deploy folder:

```bash
npx tsx src/cli/publish-site.ts output/your-project-slug deploy/your-project-site
```

To preview locally:

```bash
python3 -m http.server 4173 --directory deploy/your-project-site
```

## Regeneration Rules
- `generate` and `regenerate` both render files from canon in the MVP; `regenerate` is the same engine used in a narrower scope.
- Valid current `--department` values are `root`, `ops`, `development`, `story`, `press`, and `website`.
- Additional current department values include `scripts`, `story_design`, `episode_design`, `host_talent`, `distribution`, `business_dev`, `finance`, `legal`, and `release_prep` depending on format.
- `--file` must match a generated output path exactly, such as `site/press.html` or `06_press_kit/press_kit.md`.
- Scoped regeneration still refreshes `00_admin/canon_lock.yaml`, `00_admin/package_manifest.json`, and `16_ops/validation_report.json`.

## Manual Edits
Generated files can preserve human-authored content inside protected regions.

For Markdown, HTML, and plain text templates use:

```html
<!-- MANUAL_EDIT_START: region-id -->
Your human-maintained content here.
<!-- MANUAL_EDIT_END: region-id -->
```

For YAML-style comment files use:

```yaml
# MANUAL_EDIT_START: region-id
# MANUAL_EDIT_END: region-id
```

During regeneration the generator will:
1. read the existing file
2. extract region content by `region-id`
3. regenerate the file
4. reapply the saved content into matching regions

Use stable region IDs in custom templates. Nested markers are not supported, and mismatched start/end markers will produce a warning in `16_ops/validation_report.json`.

## Validation
- Validation runs automatically after every generate or regenerate command.
- Report path: `16_ops/validation_report.json`
- Report fields:
  - `ok`: whether blocking errors were found
  - `issues`: warnings and errors
  - `completenessScore`: simple score derived from issue severity
- Current checks:
  - required files exist
  - manifest references existing generated files
  - missing required canon fields
  - unresolved placeholder markers such as `TODO`, `TBD`, and raw handlebars tags
  - stale-output warnings using canon fingerprint matching
- Deferred checks:
  - deep conflict detection between locked fields
  - tone drift analysis
  - protected human-edit block preservation
  - bundle redaction validation

## AI Hydration
- AI hydration is opt-in and never runs silently during generation.
- Providers are configured via environment variables in `.env.example`.
- Field hydration stores pending suggestions in `00_admin/ai_suggestions.yaml`.
- Document hydration fills placeholders in generated docs while respecting protected manual-edit regions.
- Bulk hydration writes a summary to `00_admin/hydration_report.yaml`.

Examples:

```bash
npx tsx src/cli/index.ts hydrate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --field canon.logline
npx tsx src/cli/index.ts hydrate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --file 06_press_kit/press_kit.md
npx tsx src/cli/index.ts hydrate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --mode bulk
npx tsx src/cli/index.ts hydrate status --out output/neon-aftercare
```

## Creative Asset Tools
- Creative assets are opt-in image generations tied to canon context.
- Generated files land under `site/assets/generated/` so they publish with the static site.
- Each image also writes a `.prompt.json` sidecar with prompt and model metadata.

Examples:

```bash
npx tsx src/cli/index.ts assets generate --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --type poster
npx tsx src/cli/index.ts assets moodboard --canon examples/sample-tv/canon.yaml --out output/neon-aftercare --panels 6
npx tsx src/cli/index.ts assets list --out output/neon-aftercare
```

## Studio UI

```bash
npm run studio:dev
```

Studio now supports a hosted-demo workflow in addition to local use:
- create a project from the browser with a starter canon
- choose built-in inference via OpenRouter or Z.AI
- iterate on canon fields and generated docs with prompt-guided hydration
- review and accept field suggestions in the UI
- preview hosted site/assets through server routes
- export the full project workspace as a downloadable archive

Studio still provides six workspace views:
- Dashboard for project list and quick actions
- Canon editor for field editing and AI suggestions
- Files view for generated package browsing and editing
- Site preview for the generated static site
- Assets gallery for images and prompt metadata
- Ops view for validation and placeholder-fix workflows

Recommended hosted demo inference defaults:
- OpenRouter with `google/gemini-2.5-flash-lite` for low-latency, low-cost iteration
- Z.AI with `glm-4.5-flash` as an alternate built-in backend

## Environment Variables
- Use `.env.example` as the single reference for LLM, image, hydration, and Studio config.
- Only set the providers you plan to use.
- AI and image features are opt-in and never run silently.
- For hosted demos, keep all inference keys server-side and expose only your app API to the browser.

## Contributing
- Run `npm run check`, `npm test`, and `npm run test:integration` before committing cross-cutting changes.
- Run `npm run check:studio` and `npm run build:studio` when changing the frontend.
- Do not commit secrets or API keys.
- Preserve locked canon fields and protected manual-edit regions when extending the tool.

## Canon Model
- Input format: YAML or JSON
- Required canon sections include title, logline, format, genre, tone, audience, comps, duration/count, themes, world/setting, assumptions, publication flags, characters, and episodes.
- Every canon field carries provenance metadata:
  - `status`: `draft`, `approved`, `locked`, or `deprecated`
  - `owner`: who owns the field state
  - `updated_at`: ISO timestamp
  - `confidence`: 0-1 confidence value
  - `downstream_dependencies`: files likely affected by changes
  - `visibility`: public/internal/private gate for publication
- Website export uses only approved public-facing slices of canon data.

## Package Tiers
- `light`: root docs plus website pages
- `standard`: light plus development, story, press, and website scaffolds
- `full`: current sample package level; TV, feature-film, podcast, and web-series packs all use this tier in the included examples

## Deploying Generated Sites
- Generate a package into `output/<project-slug>`.
- Publish the static site into `deploy/<project-slug>-site` with the `publish:*` scripts.
- Serve that folder locally with `python3 -m http.server` or copy it to any static host.
- The deploy step is a filesystem copy, so it works with nginx, GitHub Pages, Netlify static uploads, S3-style buckets, or any plain web root.

## Hosted Demo Notes
- The current hosted-demo implementation is server-owned workspace hosting, not full multi-tenant SaaS auth.
- Browser users create projects inside managed workspaces under the server's `output/` root.
- File access, site preview, asset preview, and archive download all go through server routes rather than raw filesystem paths.
- Built-in inference is configured server-side and selected per project in Studio settings.
- For production SaaS hardening, add authentication, tenant scoping, rate limiting, background jobs, and object storage-backed exports.

## Deploy to GitHub Pages
This repo includes a GitHub Actions workflow that generates and publishes all four sample demo sites to GitHub Pages on every push to `main` and on manual dispatch. It builds each sample package, copies the published static sites into a single Pages artifact, and serves them under separate subdirectories.

To enable it:
1. Open the repository Settings on GitHub.
2. Go to Pages.
3. Set the source to GitHub Actions.

The included workflow is a demo deployment for the sample canon files. For your own real projects, fork the workflow and replace the sample generate/publish commands with your own canon paths and publish targets.

## Deploy to Netlify
You can deploy a generated static site to Netlify with a simple build config such as:

```toml
[build]
  command = "npm ci && npm run generate:example && npm run publish:tv"
  publish = "deploy/neon-aftercare-site"
```

Replace the command and publish path with the format and project you actually want to deploy.

## Output Structure
- `00_admin/`: canon lock + manifest
- `01_development/`: TV bibles or film overview/treatment
- `02_scripts/`: screenplay or episodic script scaffolds
- `02_episode_design/`: podcast episode format and guide
- `03_story_room/` or `03_story_design/`: episode guide or film story/visual materials
- `02_episode_guides/`: web-series episode guide
- `03_series_structure/`: web-series arc and continuity material
- `06_press_kit/`: press kit
- `08_host_talent/`: podcast host/talent materials
- `08_creators_and_talent/`: web-series creator/talent materials
- `13_release_prep/`: podcast release prep such as trailer scripts
- `14_distribution/`: platform or festival strategy
- `14_platform_distribution/`: web-series release plan
- `15_business_dev/`: sponsor/ad inventory or broader business development
- `15_sponsors_and_partnerships/`: web-series sponsor materials
- `07_website/`: website content scaffold
- `16_ops/`: missing items, QA, approval workflow, validation report
- `site/`: static HTML export

## Repository-Native Design
Generated packages are meant to behave like working project repos:
- `README.md` acts as the package index
- `HANDOFF.md` explains how to pick up the project operationally
- `00_admin/canon_lock.yaml` is the source-of-truth canon snapshot
- `00_admin/package_manifest.json` tracks generated inventory
- `16_ops/` contains QA, approval, missing-items, and validation outputs
- `site/` contains the public-facing static export

## Docs
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/ai-hydration.md`
- `docs/creative-assets.md`
- `docs/studio-ui.md`

## Example
Sample canons live at:
- `examples/sample-tv/canon.yaml`
- `examples/sample-film/canon.yaml`
- `examples/sample-podcast/canon.yaml`
- `examples/sample-web-series/canon.yaml`

## Notes
- Outputs stay human-editable as Markdown, YAML, JSON, and HTML.
- Validation remains intentionally lightweight and file-oriented.
- Game, book/comic, and album/music formats are still stubbed.
- Stubbed formats are registry placeholders only; they are listed by the CLI but will fail generation until their packs are implemented.
