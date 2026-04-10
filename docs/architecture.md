# Architecture

## MVP Shape
`media-package-generator` is a filesystem-first TypeScript CLI for generating repo-native media packages from a structured canon model.

## Core Modules
- `src/core/schema.ts`: Zod schema for the canonical project model.
- `src/core/formats.ts`: format-pack lookup and supported/stubbed media types.
- `src/core/template-registry.ts`: Handlebars template loader and selector.
- `src/core/generator.ts`: phased generation flow.
- `src/core/manifest.ts`: generated-file inventory.
- `src/core/validators.ts`: structural, placeholder, and stale-output checks.

## Generation Phases
1. Load and validate canon input.
2. Resolve format pack and required directory map.
3. Scaffold repo directories.
4. Render selected templates.
5. Emit `canon_lock.yaml` and `package_manifest.json`.
6. Run validation and write `16_ops/validation_report.json`.

## Extensibility
- Additional media types plug in as `FormatPack` definitions.
- Template dimensions already include media type, department, audience, package tier, and output format.
- TV, feature-film, podcast, and web-series packs are implemented; other formats remain stubbed.

## Format Pack Contract
A format pack supplies:
- `mediaType`
- `supported`
- `directories`
- `requiredFiles`
- `templates`

Each template definition supplies:
- stable `id`
- target `department`
- target `path`
- `packageTier` coverage
- `audience`
- `sources`
- `regenPolicy`
- `kind`
- `templatePath`

To add a new format:
1. Create a new pack under `src/formats/<format>/pack.ts`.
2. Add handlebars templates under `src/templates/<format>/`.
3. Register the pack in `src/core/formats.ts`.
4. Define required files and directory mapping for that media type.
5. Add a sample canon file and verify generation through the CLI.

## Deployment Model
- Generated packages live in `output/<project-slug>`.
- Static site assets live in `output/<project-slug>/site`.
- `src/cli/publish-site.ts` copies those assets into a target deploy directory.
- This keeps generation and publication separate while staying filesystem-first.

## Canon Semantics
- `locked` fields are source-of-truth facts and should only change with explicit human approval.
- `approved` fields are safe for downstream use, including public export when visibility is public.
- `draft` fields may appear in internal scaffolds but should be treated as provisional.
- `downstream_dependencies` is currently advisory metadata used to communicate impact and prepare for deeper dependency-aware regeneration.
- `visibility` gates publication, especially the static site export.

## Tradeoffs
- The MVP uses plain files instead of a metadata database.
- Protected manual-edit blocks are not implemented yet; regeneration is deterministic and file-level.
- Stale-output detection uses canon fingerprints rather than a deeper dependency graph.
