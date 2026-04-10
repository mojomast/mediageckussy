# AI Hydration

## Overview
AI is a collaborator, not an automator. The hydration layer is meant to draft suggestions and fill placeholders while keeping humans in control of approval, locking, and final package tone.

## Provider Setup

| Variable | Purpose | Default / Notes |
|---|---|---|
| `MEDIAGECKUSSY_LLM_PROVIDER` | Active text provider | `openai` |
| `MEDIAGECKUSSY_OPENAI_API_KEY` | OpenAI auth | required for `openai` |
| `MEDIAGECKUSSY_OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `MEDIAGECKUSSY_ANTHROPIC_API_KEY` | Anthropic auth | required for `anthropic` |
| `MEDIAGECKUSSY_ANTHROPIC_MODEL` | Anthropic model | `claude-haiku-3-5` |
| `MEDIAGECKUSSY_OPENROUTER_API_KEY` | OpenRouter auth | required for `openrouter` |
| `MEDIAGECKUSSY_OPENROUTER_MODEL` | OpenRouter model | set explicitly |
| `MEDIAGECKUSSY_OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `MEDIAGECKUSSY_OLLAMA_MODEL` | Ollama local model | `llama3.2` |

Suggested defaults:
- OpenAI: use `gpt-4o-mini` for fast drafting and iterative prompt tuning.
- Anthropic: use `claude-haiku-3-5` for low-cost structured drafting.
- OpenRouter: use it when you want vendor flexibility behind one env surface.
- Ollama: use it for local-only experiments or offline-ish workflows.

## Hydration Modes
- Field mode hydrates one canon field and stores the result as a pending suggestion in `00_admin/ai_suggestions.yaml`.
- Document mode fills `TODO`, `TBD`, and `{{placeholder}}` markers in generated docs while leaving protected manual-edit blocks untouched.
- Bulk mode runs field hydration first, then document hydration, and writes `00_admin/hydration_report.yaml`.

## CLI Command Reference
- `hydrate --canon <path> --out <path> --field canon.logline`
- `hydrate --canon <path> --out <path> --file 06_press_kit/press_kit.md`
- `hydrate --canon <path> --out <path> --mode bulk`
- `hydrate accept --out <path> --field canon.logline`
- `hydrate accept --out <path> --all --min-confidence 0.8`
- `hydrate reject --out <path> --field canon.logline`
- `hydrate status --out <path>`

## Suggestion Workflow
Suggestions are written to `00_admin/ai_suggestions.yaml` with provider, model, token usage, and confidence metadata. They stay pending until a user explicitly accepts or rejects them.

Accepting a suggestion updates the canon field to `status: draft`, `owner: agent`, and carries over the model confidence. Rejecting removes the sidecar entry and marks the manifest hydration log accordingly.

## Prompt Library
Prompt templates live under `src/ai/prompts/`.

- `base-system.md` contains the shared instruction frame.
- Each stable media type has its own `system.md`.
- Field prompts live in `src/ai/prompts/<media-type>/fields/`.

Templates use Handlebars-style interpolation against canon values so teams can customize prompts without changing code.

## Token Usage & Cost Awareness
Each suggestion records prompt and completion token counts. Bulk hydration also writes token totals to `00_admin/hydration_report.yaml` so teams can keep AI use explicit, reviewable, and budget-aware.
