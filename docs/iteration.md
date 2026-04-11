# ◈ Canon Iteration Engine

## Overview
The iteration engine grows your media canon through structured AI
loops. Each run proposes additions to the canon — new characters,
episodes, storylines, factions, world details, and thematic depth.
You control the pace.

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
5. Choose a planner strategy
6. In coverage mode, set section targets for characters, episodes, storylines, themes, and world
5. Click BEGIN ITERATION

## Planner Strategies
- Coverage: pushes the loop across canon sections until the configured coverage targets are met
- Adaptive: follows canon gaps and recent run history with lighter structural pressure

Coverage mode uses controller-side planning to avoid repeating the same canon section for too many runs in a row. It can move from character work into episodes, then into storylines, themes, world expansion, or factions so the canon grows as a connected package.

## Steering Mid-Loop
In any mode, you can queue a steering note that will be injected
into the next run's context without interrupting the current one.
In gated mode, you can also override the next directive entirely
during review.

## Canon Completeness
The Ops view shows a completeness score across 5 dimensions and
suggests the highest-value next iteration steps based on structural
gaps in the canon.

The completeness engine reads both raw `canon.themes` and structured
`canon.themes_structured`, and can suggest follow-up work for:
- shallow or missing storyline arcs
- unstructured themes and missing motifs
- missing locations and world lore
- missing factions or allegiances when character networks are present

## Architecture Notes
- The LLM never writes directly to canon — all output is staged as
  proposals and requires explicit acceptance
- Proposal application normalizes accepted entities to the canon schema before saving
- Each run stores a full canon snapshot so any change is auditable
- Context is compressed to ~2500 tokens per run to prevent drift
  across long sessions
- The loop is externally controlled — max iterations is always
  enforced as a hard cap
