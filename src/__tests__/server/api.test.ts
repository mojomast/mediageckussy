import fs from "fs-extra";
import path from "node:path";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../../server/app.js";
import { generatePackage } from "../../core/generator.js";
import { fixturePath } from "../helpers.js";
import { loadCanon } from "../../utils/canon.js";

describe("server API", () => {
  const app = createApp();

  test("GET /api/projects returns array when output has valid packages", async () => {
    const outputDir = path.resolve("output/api-tv");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const response = await request(app).get("/api/projects");
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test("GET /api/projects/:slug returns manifest and validation", async () => {
    const outputDir = path.resolve("output/api-project");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const response = await request(app).get("/api/projects/api-project");
    expect(response.body.ok).toBe(true);
    expect(response.body.data.manifest).toBeDefined();
    expect(response.body.data.validation).toBeDefined();
  });

  test("PUT /api/projects/:slug/canon rejects body that modifies a locked field", async () => {
    const outputDir = path.resolve("output/api-locked");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });
    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    canon.canon.title.value = "Changed";

    const response = await request(app).put("/api/projects/api-locked/canon").send(canon);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Locked fields cannot be modified/);
  });

  test("POST /api/projects/:slug/generate returns SSE stream with done event", async () => {
    const outputDir = path.resolve("output/api-generate");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const response = await request(app)
      .post("/api/projects/api-generate/generate")
      .buffer(true)
      .parse((res, callback) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => callback(null, body));
      });

    expect(String(response.body)).toContain("event: done");
  });

  test("GET /api/projects/:slug/files/00_admin/canon_lock.yaml returns file content", async () => {
    const outputDir = path.resolve("output/api-file-read");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const response = await request(app).get("/api/projects/api-file-read/files/00_admin/canon_lock.yaml");
    expect(response.body.ok).toBe(true);
    expect(response.body.data.content).toContain("Neon Aftercare");
  });
});
