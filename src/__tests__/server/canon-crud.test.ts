import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../../server/app.js";
import { archiveRoot, workspaceRoot } from "../../server/workspace.js";
import fs from "fs-extra";
import path from "node:path";

describe("canon CRUD", () => {
  const app = createApp();

  beforeEach(async () => {
    await fs.remove(path.join(workspaceRoot, "hosted-canon-demo"));
    await fs.remove(path.join(archiveRoot, "hosted-canon-demo.tar.gz"));
    await request(app)
      .post("/api/projects")
      .send({ title: "Hosted Canon Demo", mediaType: "tv_series", packageTier: "full" });
  });

  test("Read-modify-write round-trip: PUT then GET returns same values", async () => {
    const getResponse = await request(app).get("/api/projects/hosted-canon-demo/canon");
    const canon = getResponse.body.data;
    canon.canon.logline.value = "Roundtrip value";

    const putResponse = await request(app).put("/api/projects/hosted-canon-demo/canon").send(canon);
    expect(putResponse.body.ok).toBe(true);

    const afterResponse = await request(app).get("/api/projects/hosted-canon-demo/canon");
    expect(afterResponse.body.data.canon.logline.value).toBe("Roundtrip value");
  });

  test("Writing a locked field returns 400 with message", async () => {
    const getResponse = await request(app).get("/api/projects/hosted-canon-demo/canon");
    const canon = getResponse.body.data;
    canon.canon.format.value = "feature_film";

    const response = await request(app).put("/api/projects/hosted-canon-demo/canon").send(canon);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Locked fields cannot be modified/);
  });

  test("Settings can be updated for hosted inference configuration", async () => {
    const response = await request(app)
      .put("/api/projects/hosted-canon-demo/settings")
      .send({ llmProvider: "zai", llmModel: "glm-4.5-flash" });

    expect(response.body.ok).toBe(true);
    expect(response.body.data.settings.llmProvider).toBe("zai");
  });
});
