# Changelog

## v2.0.0

Released: 2026-04-10

### AI Hydration
- Added a provider abstraction layer for OpenAI, Anthropic, OpenRouter, and Ollama.
- Added field, document, and bulk hydration with suggestion sidecar review flow.

### Creative Asset Tools
- Added image provider abstraction, prompt-based asset generation, and mood board composition.
- Added manifest registration and prompt sidecars for generated assets.

### Studio UI
- Added a local Express API and a React/Vite Studio UI with six core views.
- Added local package browsing, canon editing, validation display, and site preview workflows.

### CI And Release
- Added broader CI validation, integration coverage, Studio build support, and release docs.
- Added GitHub Pages publishing for the sample demo sites plus the built Studio UI.

### Breaking Changes
- None. This release is additive.

### Migration Notes
- Copy `.env.example` into your local environment setup and fill in only the providers you intend to use.
