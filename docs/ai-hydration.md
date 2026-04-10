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
<!-- TODO -->

## CLI Command Reference
<!-- TODO -->

## Suggestion Workflow
<!-- TODO -->

## Prompt Library
<!-- TODO -->

## Token Usage & Cost Awareness
<!-- TODO -->
