import path from "node:path";
import fs from "fs-extra";
import Handlebars from "handlebars";
import type { CanonProject, TemplateDefinition } from "./types.js";

let helpersRegistered = false;

function registerHelpers() {
  if (helpersRegistered) {
    return;
  }

  Handlebars.registerHelper("join", (value: unknown, separator = ", ") => {
    return Array.isArray(value) ? value.join(separator) : "";
  });

  Handlebars.registerHelper("upper", (value: unknown) => {
    return typeof value === "string" ? value.toUpperCase() : "";
  });

  Handlebars.registerHelper("lower", (value: unknown) => {
    return typeof value === "string" ? value.toLowerCase() : "";
  });

  Handlebars.registerHelper("slug", (value: unknown) => {
    if (typeof value !== "string") {
      return "";
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  Handlebars.registerHelper("date", (value: unknown) => {
    if (typeof value !== "string" && !(value instanceof Date)) {
      return "";
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  });

  Handlebars.registerHelper("eq", (left: unknown, right: unknown) => left === right);

  Handlebars.registerHelper("includes", (collection: unknown, value: unknown) => {
    if (Array.isArray(collection)) {
      return collection.includes(value);
    }

    if (typeof collection === "string") {
      return collection.includes(String(value));
    }

    return false;
  });

  Handlebars.registerHelper("index_plus_1", (index: unknown) => {
    return typeof index === "number" ? index + 1 : "";
  });

  helpersRegistered = true;
}

function normalizeTemplateSource(source: string) {
  return source.replace(/\{\{\s*@index_plus_1\s*\}\}/g, "{{index_plus_1 @index}}");
}

export class TemplateRegistry {
  constructor(private readonly templates: TemplateDefinition[]) {
    registerHelpers();
  }

  list(mediaType: string, tier: CanonProject["package_tier"]) {
    return this.templates.filter((template) => template.mediaType === mediaType && template.packageTier.includes(tier));
  }

  selectForDepartment(mediaType: string, tier: CanonProject["package_tier"], department?: string, file?: string) {
    return this.list(mediaType, tier).filter((template) => {
      if (file) {
        return template.path === file;
      }

      if (department) {
        return template.department === department;
      }

      return true;
    });
  }

  async render(template: TemplateDefinition, data: Record<string, unknown>, repoRoot: string) {
    const source = await fs.readFile(path.join(repoRoot, template.templatePath), "utf8");
    const normalized = normalizeTemplateSource(source);
    return Handlebars.compile(normalized, { noEscape: true })(data);
  }
}
