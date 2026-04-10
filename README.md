# media-package-generator

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
- `tv_series`: implemented in MVP
- `feature_film`: implemented in MVP
- `podcast`: implemented in MVP
- `web_series`: implemented in MVP

Stub formats (`game`, `book_comic`, `album_music_project`) are in the registry but not yet implemented. Use `formats --all` to see them.

## Install
```bash
npm install
```

## Quick Start
1. Pick a sample canon or create your own canon YAML/JSON file.
2. Run a generate command for the target format.
3. Inspect the generated package under `output/<project-slug>`.
4. Publish the generated `site/` folder into `deploy/<project-slug>-site`.
5. Serve that deploy folder locally or upload it to your static host.

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
- Protected manual-edit regions are not implemented yet, so regenerated files should be treated as generator-owned.

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

## Example
Sample canons live at:
- `examples/sample-tv/canon.yaml`
- `examples/sample-film/canon.yaml`
- `examples/sample-podcast/canon.yaml`
- `examples/sample-web-series/canon.yaml`

## Notes
- Outputs stay human-editable as Markdown, YAML, JSON, and HTML.
- Validation is intentionally basic in V1.
- Game, book/comic, and album/music formats are still stubbed.
- Stubbed formats are registry placeholders only; they are listed by the CLI but will fail generation until their packs are implemented.
