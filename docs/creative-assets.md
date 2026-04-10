# Creative Assets

## Overview
Creative asset tools generate optional visual materials from canon data and save both the rendered image and its prompt metadata inside the package.

## Provider Setup

| Variable | Purpose | Notes |
|---|---|---|
| `MEDIAGECKUSSY_IMAGE_PROVIDER` | Active image provider | `dalle`, `stability`, `replicate`, `flux` |
| `MEDIAGECKUSSY_OPENAI_API_KEY` | DALL-E auth | reused from LLM setup |
| `MEDIAGECKUSSY_STABILITY_API_KEY` | Stability auth | required for `stability` |
| `MEDIAGECKUSSY_REPLICATE_API_KEY` | Replicate auth | required for `replicate` |
| `MEDIAGECKUSSY_OPENROUTER_API_KEY` | Flux via OpenRouter auth | required for `flux` |
| `MEDIAGECKUSSY_OPENROUTER_MODEL` | Flux model id | required for `flux` |

## Asset Types

| Type | Dimensions | Canon Fields Used |
|---|---|---|
| `poster` | 1024x1536 | title, logline, genre, tone, world setting |
| `key-art` | 1792x1024 | title, logline, genre, comps |
| `character-portrait` | 1024x1024 | title, genre, character description |
| `episode-card` | 1280x720 | title, logline, tone |
| `mood-board-panel` | 1024x1024 | title, tone, world setting |
| `social-banner` | 1200x630 | title, logline, genre |
| `podcast-cover` | 3000x3000 | title, logline, genre, tone |

## CLI Reference
- `assets generate --canon <path> --out <path> --type poster`
- `assets generate --canon <path> --out <path> --all`
- `assets moodboard --canon <path> --out <path> --panels 6`
- `assets list --out <path>`

## Prompt Customization
Asset prompts live in `src/ai/prompts/assets/`. Use `--prompt-override` when you want to bypass the template for a one-off render.

## Mood Board
Mood boards generate 4, 6, or 9 panels and combine them into a single composite image saved under `site/assets/generated/mood-board/`.

## .prompt.json Sidecar
Every generated image writes a neighboring `.prompt.json` file containing the prompt, provider, model, canon fingerprint, and timestamp so the render can be audited or regenerated later.
