import path from "node:path";
import fs from "fs-extra";
import Handlebars from "handlebars";
import type { CanonProject, TemplateDefinition } from "./types.js";

export class TemplateRegistry {
  constructor(private readonly templates: TemplateDefinition[]) {}

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
    return Handlebars.compile(source, { noEscape: true })(data);
  }
}
