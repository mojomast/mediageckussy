import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { createApp } from "../../server/app.js";
import { archiveRoot, workspaceRoot } from "../../server/workspace.js";

describe("completeness API", () => {
  const app = createApp();

  beforeEach(async () => {
    await fs.remove(path.join(workspaceRoot, "completeness-demo"));
    await fs.remove(path.join(archiveRoot, "completeness-demo.tar.gz"));

    await request(app)
      .post("/api/projects")
      .send({ title: "Completeness Demo", mediaType: "tv_series", packageTier: "full" })
      .buffer(true)
      .parse((res, callback) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => callback(null, body));
      });
  });

  test("GET /api/projects/:slug/completeness returns dimension scores and suggestions", async () => {
    const response = await request(app).get("/api/projects/completeness-demo/completeness");

    expect(response.body.ok).toBe(true);
    expect(typeof response.body.data.score).toBe("number");
    expect(response.body.data.dimensions.characters).toBeDefined();
    expect(Array.isArray(response.body.data.suggestedDirectives)).toBe(true);
  });
});
