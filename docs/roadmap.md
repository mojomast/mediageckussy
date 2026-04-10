# Roadmap And Status

## Complete In v2.0.0
- Stable format packs for TV series, feature film, podcast, and web series.
- Canon-first package generation with manifest tracking, validation, and scoped regeneration.
- Protected manual-edit region preservation during regeneration.
- AI provider abstraction for OpenAI, Anthropic, OpenRouter, and Ollama.
- Field, document, and bulk hydration with suggestion review workflow.
- Image provider abstraction, prompt sidecars, and mood board composition.
- Local Express Studio server and React/Vite Studio UI.
- GitHub Actions validation, integration coverage, and demo deployment to GitHub Pages.

## Still Stubbed Or Deferred
- Full package implementations for `game`, `book_comic`, and `album_music_project`.
- Rich dependency-aware regeneration beyond current fingerprint and metadata checks.
- Persistent Studio job management and detailed streaming progress.
- Packaged prompt assets for compiled-only distributions.
- External auth, multi-user collaboration, or cloud sync.

## Near-Term Cleanup Targets
1. Harden CLI argument parsing so nested command groups are less brittle.
2. Expand integration coverage around Studio mutation routes and hydration accept/reject flows.
3. Improve static hosting support for Studio and generated sites under non-root base paths.
4. Add deeper validation around protected-region mismatches and hydration drift.

## Longer-Term Additions
1. Implement the remaining stubbed media format packs.
2. Add export bundles for press, partner, and redacted review packages.
3. Introduce more structured prompt testing and packaged prompt distribution.
4. Add richer asset workflows such as prompt history, regeneration presets, and canon-linked art approvals.
