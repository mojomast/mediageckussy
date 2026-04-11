import path from "node:path";
import http from "node:http";
import fs from "fs-extra";
import chalk from "chalk";
import { input, select } from "@inquirer/prompts";
import { generatePackage } from "../core/generator.js";
import { listFormats } from "../core/formats.js";
import { readManifest } from "../core/manifest.js";
import { resolveProvider } from "../ai/providers/index.js";
import { hydrateDocument } from "../ai/hydrators/docHydrator.js";
import { hydrateField } from "../ai/hydrators/fieldHydrator.js";
import { hydratePackage } from "../ai/hydrators/bulkHydrator.js";
import { loadSuggestions } from "../ai/suggestions.js";
import { generateAsset } from "../ai/assetGenerator.js";
import { resolveImageProvider } from "../ai/image/index.js";
import { createIterationSession, listIterationSessions, loadIterationSession, saveIterationSession } from "../ai/iteration/session.js";
import { applyProposals, runIterationStep } from "../ai/iteration/runner.js";
import { buildProjectExport, normalizeExportInclude, normalizeExportVisibility } from "../server/projectArtifacts.js";
import { createHostedProject, listHostedProjects, projectWorkspace, readHostedProject, availableStableFormats, archiveHostedProject, unarchiveHostedProject, renameHostedProject, duplicateHostedProject } from "../server/workspace.js";
import { loadCanon, saveCanon } from "../utils/canon.js";

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || command === "help" || args.help) {
    printHelp();
    return;
  }

  if (command === "init") {
    await handleInit(args);
    return;
  }

  if (command === "list") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck list [--include-archived]");
      return;
    }
    await handleList(args);
    return;
  }

  if (command === "status") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck status <slug>");
      return;
    }
    await handleStatus(subcommand ?? args._[0]);
    return;
  }

  if (command === "canon") {
    await handleCanon(subcommand, args);
    return;
  }

  if (command === "generate") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck generate <slug> [--file] [--department]");
      return;
    }
    if (subcommand) {
      args._.unshift(subcommand);
    }
    await handleGenerate(args);
    return;
  }

  if (command === "iterate") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck iterate <slug> --instruction <text>");
      return;
    }
    if (subcommand) {
      args._.unshift(subcommand);
    }
    await handleIterate(args);
    return;
  }

  if (command === "export") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck export <slug> [--include docs,site,canon] [--visibility public|internal|all]");
      return;
    }
    if (subcommand) {
      args._.unshift(subcommand);
    }
    await handleExport(args);
    return;
  }

  if (command === "serve") {
    if (subcommand === "--help") {
      console.log("Usage: mediageck serve <slug> [--port 4173]");
      return;
    }
    if (subcommand) {
      args._.unshift(subcommand);
    }
    await handleServe(args);
    return;
  }

  if (command === "formats") {
    console.log(JSON.stringify(listFormats({ all: args.all }), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function handleInit(args: ParsedArgs) {
  const title = args.title ?? await input({ message: "Project title" });
  const mediaType = args.mediaType ?? await select({
    message: "Format",
    choices: availableStableFormats().map((format) => ({ name: format, value: format })),
  });
  const project = await createHostedProject({
    title,
    mediaType,
    packageTier: (args.packageTier as "light" | "standard" | "full" | undefined) ?? "full",
    provider: args.provider,
    model: args.model,
  });
  const outputDir = projectWorkspace(project.slug);
  const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
  await generatePackage({ canonPath, outputDir, mediaType });
  console.log(chalk.green(`Created ${project.slug}`));
}

async function handleList(args: ParsedArgs) {
  const projects = await listHostedProjects({ includeArchived: args.includeArchived });
  for (const project of projects) {
    console.log(`${project.archived ? "[archived] " : ""}${project.slug} ${chalk.dim(`(${project.mediaType})`)}`);
  }
}

async function handleStatus(slug?: string) {
  if (!slug) {
    throw new Error("Usage: mediageck status <slug>");
  }
  const outputDir = projectWorkspace(slug);
  const manifest = await readManifest(outputDir);
  const validation = await fs.readJson(path.join(outputDir, "16_ops/validation_report.json"));
  const suggestions = await loadSuggestions(outputDir);
  const sessions = await listIterationSessions(slug);
  const project = await readHostedProject(slug);
  console.log(chalk.bold(`${project.title} (${slug})`));
  console.log(`${bar(validation.completenessScore)} ${validation.completenessScore}% package complete`);
  console.log(`${bar(Math.min(100, (manifest.generatedFiles.length / Math.max(manifest.requiredFiles.length, 1)) * 100))} ${manifest.generatedFiles.length} generated files`);
  console.log(chalk.yellow(`${suggestions.filter((item) => item.status === "pending").length} pending suggestions`));
  console.log(chalk.cyan(`${sessions.length} iteration sessions`));
  if (validation.issues.length > 0) {
    console.log(chalk.red("Warnings:"));
    for (const issue of validation.issues.slice(0, 5)) {
      console.log(`- ${issue.code}: ${issue.message}`);
    }
  }
  console.log(chalk.dim(`Suggested next command: mediageck iterate ${slug} --instruction "${suggestions.length > 0 ? "Review pending suggestions and expand the canon" : "Suggest the highest-value next canon expansion"}"`));
}

async function handleCanon(subcommand: string | undefined, args: ParsedArgs) {
  const slug = args._[0];
  if (!slug) {
    throw new Error("Usage: mediageck canon <show|set|lock> <slug>");
  }
  const canonPath = path.join(projectWorkspace(slug), "00_admin/canon_lock.yaml");
  const canon = await loadCanon(canonPath);
  if (subcommand === "show") {
    console.log(JSON.stringify(canon, null, 2));
    return;
  }
  if (subcommand === "set") {
    const field = args.field ?? await input({ message: "Field path (example: canon.logline.value)" });
    const value = args.value ?? await input({ message: "New value" });
    setAtPath(canon as unknown as Record<string, unknown>, field, value);
    await saveCanon(canonPath, canon);
    console.log(chalk.green(`Updated ${field}`));
    return;
  }
  if (subcommand === "lock") {
    const field = args.field ?? await input({ message: "Field path (example: canon.logline.status)" });
    setAtPath(canon as unknown as Record<string, unknown>, field, "locked");
    await saveCanon(canonPath, canon);
    console.log(chalk.green(`Locked ${field}`));
    return;
  }
  throw new Error("Usage: mediageck canon <show|set|lock> <slug>");
}

async function handleGenerate(args: ParsedArgs) {
  const slug = args._[0];
  if (!slug) {
    throw new Error("Usage: mediageck generate <slug> [--file] [--department]");
  }
  const outputDir = projectWorkspace(slug);
  const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
  const result = await generatePackage({ canonPath, outputDir, file: args.file, department: args.department });
  console.log(JSON.stringify({ ok: result.validation.ok, completenessScore: result.validation.completenessScore }, null, 2));
}

async function handleIterate(args: ParsedArgs) {
  const slug = args._[0];
  if (!slug) {
    throw new Error("Usage: mediageck iterate <slug> --instruction <text>");
  }
  const project = await readHostedProject(slug);
  const provider = resolveProvider(args.provider ?? project.settings.llmProvider, { model: args.model ?? project.settings.llmModel });
  const canonPath = path.join(projectWorkspace(slug), "00_admin/canon_lock.yaml");
  const canon = await loadCanon(canonPath);
  const session = createIterationSession({
    projectSlug: slug,
    mode: (args.mode as "autonomous" | "gated" | "confidence" | undefined) ?? "gated",
    maxRuns: Number(args.maxRuns ?? 1),
    planner: { strategy: (args.strategy as "adaptive" | "coverage" | undefined) ?? "adaptive", avoidRecentWindow: 1 },
    provider: args.provider ?? project.settings.llmProvider,
    model: args.model ?? project.settings.llmModel,
  });
  await saveIterationSession(slug, session);
  const run = await runIterationStep(session, {
    type: (args.type as any) ?? "suggest_next",
    instruction: args.instruction ?? "Suggest the highest-value next canon expansion.",
    targetId: args.targetId,
  }, canon, provider);
  session.runs.push(run);
  session.completedRuns = 1;
  await saveIterationSession(slug, session);
  const accepted = run.proposals.map((proposal) => proposal.proposalId);
  const updatedCanon = await applyProposals(session, run, canon, accepted);
  await saveCanon(canonPath, updatedCanon);
  console.log(chalk.green(`Completed iteration run ${run.runId}`));
}

async function handleExport(args: ParsedArgs) {
  const slug = args._[0];
  if (!slug) {
    throw new Error("Usage: mediageck export <slug>");
  }
  const include = normalizeExportInclude((args.include ?? "docs,site,canon").split(","));
  const visibility = normalizeExportVisibility(args.visibility ?? "all");
  const bundle = await buildProjectExport(slug, include, visibility);
  console.log(JSON.stringify(bundle.entries.map((entry) => ({ path: entry.path, kind: entry.kind, visibility: entry.visibility })), null, 2));
}

async function handleServe(args: ParsedArgs) {
  const slug = args._[0];
  if (!slug) {
    throw new Error("Usage: mediageck serve <slug>");
  }
  const port = Number(args.port ?? 4173);
  const siteDir = path.join(projectWorkspace(slug), "site");
  const server = http.createServer(async (req, res) => {
    const requested = path.join(siteDir, req.url === "/" ? "index.html" : String(req.url ?? "/index.html"));
    if (!(await fs.pathExists(requested))) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.end(await fs.readFile(requested));
  });
  server.listen(port, () => {
    console.log(chalk.green(`Serving ${slug} at http://localhost:${port}`));
  });
}

function parseArgs(argv: string[]) {
  const args: ParsedArgs = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current.startsWith("--")) {
      const key = current.slice(2).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
      continue;
    }
    args._.push(current);
  }
  return args;
}

function bar(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 10);
  return chalk.green(`[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`);
}

function printHelp() {
  console.log(`mediageck commands

mediageck init
mediageck list [--include-archived]
mediageck status <slug>
mediageck canon show|set|lock <slug>
mediageck generate <slug> [--file] [--department]
mediageck iterate <slug> --instruction <text>
mediageck export <slug> [--include docs,site,canon] [--visibility public|internal|all]
mediageck serve <slug> [--port 4173]
mediageck formats [--all]`);
}

function setAtPath(target: Record<string, unknown>, fieldPath: string, nextValue: unknown) {
  const segments = fieldPath.split(".");
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1) ?? fieldPath] = nextValue;
}

type ParsedArgs = {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
  title?: string;
  mediaType?: string;
  packageTier?: string;
  provider?: string;
  model?: string;
  includeArchived?: boolean;
  field?: string;
  value?: string;
  file?: string;
  department?: string;
  mode?: string;
  maxRuns?: string;
  strategy?: string;
  instruction?: string;
  targetId?: string;
  include?: string;
  visibility?: string;
  port?: string;
  help?: boolean;
  all?: boolean;
};

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
