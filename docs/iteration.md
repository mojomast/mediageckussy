# ◈ Canon Iteration Engine

## Overview
The iteration engine grows your media canon through structured AI
loops. Each run proposes additions to the canon — new characters,
episodes, storylines, world details, thematic depth. You control
the pace.

## Modes
| Mode | Behavior |
|------|----------|
| Gated | Pauses after every run for human review |
| Autonomous | Runs to max iterations, auto-accepts high-confidence proposals |
| Confidence | Pauses only when a run's confidence score falls below your threshold |

## Starting an Iteration Session
1. Open a project in Studio
2. Go to ITERATE in the nav
3. Choose a directive type and write your instruction
4. Set mode + max runs
5. Click BEGIN ITERATION

## Steering Mid-Loop
In any mode, you can queue a steering note that will be injected
into the next run's context without interrupting the current one.
In gated mode, you can also override the next directive entirely
during review.

## Canon Completeness
The Ops view shows a completeness score across 5 dimensions and
suggests the highest-value next iteration steps based on structural
gaps in the canon.

## Architecture Notes
- The LLM never writes directly to canon — all output is staged as
  proposals and requires explicit acceptance
- Each run stores a full canon snapshot so any change is auditable
- Context is compressed to ~2500 tokens per run to prevent drift
  across long sessions
- The loop is externally controlled — max iterations is always
  enforced as a hard cap
