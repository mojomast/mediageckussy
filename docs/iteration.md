# Canon Iteration

## Overview

The iteration engine expands a hosted project canon through proposal-based AI runs. The model never mutates canon directly. Each run creates proposals, and accepted changes are written back to canon and recorded in history.

## Modes

| Mode | Behavior |
| --- | --- |
| `gated` | Pause after every run for review |
| `autonomous` | Continue until the configured max runs |
| `confidence` | Continue until a run falls below the confidence threshold |

## Starting from Studio

1. Open a project
2. Go to `Iterate`
3. Choose a directive type
4. Write the instruction
5. Set run mode, max runs, and planner strategy
6. Start the session

You can also enter iteration from:

- onboarding quick AI draft
- dashboard suggested iteration shortcuts
- canon section shortcuts
- ops suggested directives

## Planner strategies

- `coverage`: push work across canon sections to fill structural gaps
- `adaptive`: follow the strongest next opportunity with lighter structural pressure

Coverage mode uses section targets and recent-run avoidance to prevent narrow looping.

## Review flow

In gated or paused confidence sessions you can:

- accept or reject proposals
- add a steering note
- override the next directive
- continue the session
- stop the session

## History and auditability

Accepted iteration changes create canon snapshots in `00_admin/canon-history.jsonl`.

Each snapshot includes:

- `snapshotId`
- `projectSlug`
- `createdAt`
- `trigger`
- `runId` when applicable
- field-level before/after changes
- `authorKind`

The Canon view exposes recent history and allows revert.

## CLI

Run a short iteration from the command line:

```bash
mediageck iterate <slug> --instruction "Suggest the highest-value next canon expansion"
```

Useful companion commands:

```bash
mediageck status <slug>
mediageck canon show <slug>
mediageck generate <slug>
```

## Related outputs

- Canon lock: `00_admin/canon_lock.yaml`
- Sessions: `iterations/<sessionId>/`
- Validation report: `16_ops/validation_report.json`
- History log: `00_admin/canon-history.jsonl`
