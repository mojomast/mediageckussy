# mediageckussy

Canon-first media package generation for TV series, feature films, podcasts, and web series.

`mediageckussy` turns one hosted project canon into a working package workspace: canon, internal docs, outward-facing materials, generated assets, a static site, iteration history, export bundles, and public share links.

## What ships now

- Hosted Studio workflow over `output/<slug>` workspaces
- Guided onboarding with format selection, quick facts, and start mode
- Interview-based project creation
- Quick AI draft path that seeds a project and runs a short iteration pass
- Canon editor with AI suggestions, revertable history, and completeness signals
- Iteration engine with gated, autonomous, and confidence modes
- File workspace editing, ZIP export, and folder manifests
- Public read-only share links for selected bundles
- Project lifecycle operations: rename, duplicate, archive, unarchive, delete
- CLI workflow through `mediageck`

## Supported formats

- `tv_series`
- `feature_film`
- `podcast`
- `web_series`

## Install

```bash
npm install
```

## Studio

Run the Studio app locally:

```bash
npm run studio:dev
```

Main views:

- Dashboard: project list, progress bars, quick actions, settings panel
- Onboarding: media type, quick facts, interview / quick AI / blank start
- Interview: guided intake that builds a hosted project
- Canon: field editing, AI suggestions, completeness ribbon, history panel
- Iterate: controlled canon growth loops with HITL review
- Files: workspace browser, editor, export tools, share links
- Site: live hosted site preview
- Assets: generated media asset gallery
- Ops: validation and completeness summary

## CLI

The primary binary is now `mediageck`.

```bash
mediageck init
mediageck list
mediageck status <slug>
mediageck canon show <slug>
mediageck canon set <slug> --field canon.logline.value --value "New logline"
mediageck generate <slug>
mediageck iterate <slug> --instruction "Suggest the highest-value next canon expansion"
mediageck export <slug> --include docs,site,canon --visibility public
mediageck serve <slug>
```

`mpg` remains as an alias to the same binary.

## Project lifecycle

Hosted projects live in `output/<slug>`.

- Active projects: `output/<slug>`
- Archived projects: `output/_archived/<slug>`
- Canon lock: `00_admin/canon_lock.yaml`
- Canon history: `00_admin/canon-history.jsonl`
- Manifest: `00_admin/package_manifest.json`
- Validation report: `16_ops/validation_report.json`

Supported operations:

- rename
- duplicate
- archive / unarchive
- delete with explicit confirmation

## Export and sharing

Studio and the API support:

- ZIP exports
- Folder manifest exports
- Include filters: `docs`, `site`, `canon`, `assets`
- Visibility filters: `public`, `internal`, `all`
- `canon.json` export at bundle root
- Public share tokens stored in `output/share-tokens.json`

Relevant endpoints:

- `POST /api/projects/:slug/export`
- `POST /api/projects/:slug/share`
- `GET /api/share/:shareToken`
- `GET /api/share/:shareToken/files/:filename`

## Canon history

Canon changes are snapshotted to `canon-history.jsonl`.

Triggers currently recorded:

- manual canon edits
- accepted hydration suggestions
- accepted iteration proposals
- snapshot-based revert actions

Studio exposes recent snapshots in the Canon view and supports revert.

## Iteration

The iteration engine grows canon through proposal-based runs.

- Gated: pause every run for review
- Autonomous: continue until max runs
- Confidence: pause when confidence falls below threshold

See `docs/iteration.md` for the full workflow.

## Validation and editing

- Generation writes a package manifest and validation report every run
- Protected regions are reapplied during file saves and regeneration
- AI hydration is opt-in
- Locked canon fields cannot be overwritten through normal canon save routes

## Development

Recommended verification before shipping:

```bash
npm test
npm run build
npm run build:studio
mediageck status --help
```

Additional checks:

```bash
npm run check
npm run check:studio
```
