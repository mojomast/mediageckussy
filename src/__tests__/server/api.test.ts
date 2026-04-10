import fs from "fs-extra";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../../server/app.js";
import { archiveRoot, workspaceRoot } from "../../server/workspace.js";

describe("server API", () => {
  const app = createApp();

  beforeEach(async () => {
    await fs.remove(path.join(workspaceRoot, "hosted-api-demo"));
    await fs.remove(path.join(archiveRoot, "hosted-api-demo.tar.gz"));
  });

  test("GET /api/studio/options returns available formats and providers", async () => {
    const response = await request(app).get("/api/studio/options");
    expect(response.body.ok).toBe(true);
    expect(response.body.data.formats).toContain("tv_series");
    expect(Array.isArray(response.body.data.providers)).toBe(true);
  });

  test("POST /api/projects creates hosted project and emits done event", async () => {
    const response = await request(app)
      .post("/api/projects")
      .send({
        title: "Hosted API Demo",
        mediaType: "tv_series",
        packageTier: "full",
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
      })
      .buffer(true)
      .parse((res, callback) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => callback(null, body));
      });

    expect(String(response.body)).toContain("event: done");
    expect(await fs.pathExists(path.join(workspaceRoot, "hosted-api-demo", ".studio-project.json"))).toBe(true);

    const projects = await request(app).get("/api/projects");
    expect(projects.body.data.some((project: { slug: string }) => project.slug === "hosted-api-demo")).toBe(true);
  });

  test("GET /api/projects/:slug/files rejects traversal attempts", async () => {
    await request(app)
      .post("/api/projects")
      .send({ title: "Hosted API Demo", mediaType: "tv_series", packageTier: "full" });

    const response = await request(app).get("/api/projects/hosted-api-demo/files/../../package.json");
    expect(response.body.ok).toBe(false);
  });

  test("GET /api/projects/:slug/archive returns tarball download", async () => {
    const createResponse = await request(app)
      .post("/api/projects")
      .send({ title: "Hosted API Demo", mediaType: "tv_series", packageTier: "full" })
      .buffer(true)
      .parse((res, callback) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => callback(null, body));
      });

    expect(String(createResponse.body)).toContain("event: done");

    const response = await request(app).get("/api/projects/hosted-api-demo/archive");
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("hosted-api-demo.tar.gz");
  });
});
