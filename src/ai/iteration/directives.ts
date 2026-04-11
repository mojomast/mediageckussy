import type { IterationDirective } from "./types.js";

const SHARED_SYSTEM_PROMPT = `You are a creative development engine for a media project. Your job
is to propose structured additions or changes to an existing media
canon. You do NOT write final copy — you propose structured JSON
objects that will be reviewed and optionally accepted into the canon.

Rules:

Output ONLY valid JSON. No prose before or after the JSON block.

All proposals must be consistent with the existing canon fields.

Do not modify locked fields.

Each proposal includes a rationale (1 sentence) and a confidence
score (0.0–1.0).

Confidence < 0.6 means you are uncertain — flag it.

If you would contradict a locked field, output an empty proposals
array and explain in the summary.

Output format (strict):
{
"summary": "<1-2 sentence description of what you're proposing>",
"confidence": <0.0-1.0 aggregate>,
"proposals": [
{
"field": "<canon field path>",
"operation": "add" | "update" | "append",
"value": <the proposed value>,
"rationale": "<1 sentence>",
"confidence": <0.0-1.0>
}
],
"suggestedNextDirectives": [
{
"type": "<directive type>",
"instruction": "<suggested next step>",
"targetId": "<optional>"
}
] }`;

export function buildDirectivePrompt(
  directive: IterationDirective,
  context: string,
): { system: string; user: string } {
  return {
    system: SHARED_SYSTEM_PROMPT,
    user: `${directiveInstruction(directive)}\n\n${context}`,
  };
}

function directiveInstruction(directive: IterationDirective) {
  switch (directive.type) {
    case "new_character":
      return `Using the canon context below, create a new character for this project.
The character should:

Have a distinct role that doesn't duplicate existing characters

Connect meaningfully to existing themes and world

Have narrative tension potential with at least one existing character

Be consistent with the project's tone

Propose: a new entry for canon.characters with id, name, role,
description, and initial_relationships (array of {characterId, dynamic}).`;
    case "develop_character":
      return `Using the canon context below, deepen the existing character
"${directive.targetId ?? "unknown"}". Propose:

An expanded description (replace existing)

2-3 new backstory bullet points as canon.characters[{i}].backstory

Any new relationships with other existing characters

A suggested episode hook: one episode scenario that would develop
this character (propose as a new entry in canon.episodes if fewer
than 8 exist, otherwise propose as canon.characters[{i}].episode_hooks).`;
    case "new_episode":
      return `Using the canon context below, propose a new episode for this project.
The episode should:

Follow logically from the existing episode list

Advance at least one ongoing storyline or theme

Feature at least 2 existing characters

Introduce one complication or revelation

Propose: a new entry for canon.episodes with code, title, logline,
featured_characters (array of ids), and story_function (1 sentence).`;
    case "develop_episode":
      return `Using the canon context below, develop the existing episode "${directive.targetId ?? "unknown"}".
Propose:

An expanded logline (replace existing)

A scene breakdown: canon.episodes[{i}].scenes — array of
{ scene_number, location, characters (ids), beat (1 sentence) }
(4-6 scenes)

A cliffhanger or episode_end note`;
    case "new_storyline":
      return `Using the canon context below, propose a new multi-episode storyline
arc. The arc should:

Span 3-5 episodes (reference existing episodes if possible)

Connect at least 2 characters in a new dynamic

Escalate one of the existing themes

Have a clear beginning, complication, and resolution shape

Propose: a new entry for canon.storylines with:

id (slugified title)

title

logline (2 sentences)

episodes: array of episode codes from existing episodes

characters: array of character ids involved

theme_connection: which existing theme this arc expresses

arc_shape: exactly 3 strings — setup, complication, resolution

visibility: "internal"

Field path: canon.storylines (operation: "add")`;
    case "new_faction":
      return `Using the canon context below, define a new faction, organization, or
allegiance group within this project's world.

Propose: a new entry for canon.factions (operation: "add") with:

id (slugified name)

name

description (2-3 sentences)

allegiance: what they stand for or against

members: array of existing character ids who belong to this group

visibility: "internal"

The faction should create meaningful narrative tension with at least
one other faction or character allegiance.`;
    case "develop_themes":
      return `Using the canon context below, deepen the thematic layer of this
project. Propose:

For each existing theme in the project's themes list, propose:

A new entry in canon.themes_structured (operation: "add") with:

id: slugified theme label

label: the theme text

theme_expression: 2-3 sentences on how this theme manifests in
the world and character behavior

motif: a recurring physical image, sound, or object that
represents this theme across episodes

One entry in canon.motifs (operation: "add") for the strongest
unifying motif across all themes:

id, description, theme_connection

Do NOT modify canon.themes (the raw string array) — write only to
canon.themes_structured and canon.motifs.`;
    case "world_expansion":
      return `Using the canon context below, expand the world of this project.
Propose:

2-3 new canon.locations entries (operation: "add" each) with:
id, name, description (2 sentences), atmosphere, frequent_characters

1-2 new canon.world_lore entries (operation: "add" each) with:
id, fact, narrative_implication

Use exact field paths: canon.locations and canon.world_lore`;
    case "suggest_next":
      return `Using the canon context below, analyze the current state of this
project and suggest the 3 most valuable next iteration steps.

Consider:

What feels underdeveloped?

What threads are left dangling?

What would most increase the package's completeness and richness?

Propose: proposals array should be EMPTY. Instead, return 3 entries
in suggestedNextDirectives with clear, specific instructions.
Set confidence to 1.0.`;
    case "custom":
      return `Using the canon context below, follow this specific instruction:

${directive.instruction}

Constraints: ${directive.constraints?.join("; ") ?? "none"}

Propose whatever canon additions or changes best fulfill the
instruction. Use any field paths that make sense. If creating new
top-level canon arrays (e.g. canon.factions, canon.timelines),
that is acceptable — document the field path clearly.`;
    default:
      return directive.instruction;
  }
}
