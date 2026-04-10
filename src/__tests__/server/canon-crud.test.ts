import fs from "fs-extra";
import path from "node:path";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../../server/app.js";
import { generatePackage } from "../../core/generator.js";
import { fixturePath } from "../helpers.js";
import { loadCanon } from "../../utils/canon.js";

describe("canon CRUD", () => {
  const app = createApp();

  test("Read-modify-write round-trip: PUT then GET returns same values", async () => {
    const outputDir = path.resolve("output/api-roundtrip");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    canon.canon.logline.value = "Roundtrip value";

    const putResponse = await request(app).put("/api/projects/api-roundtrip/canon").send(canon);
    expect(putResponse.body.ok).toBe(true);

    const getResponse = await request(app).get("/api/projects/api-roundtrip/canon");
    expect(getResponse.body.data.canon.logline.value).toBe("Roundtrip value");
  });

  test("Writing a field with status locked returns 400 with message", async () => {
    const outputDir = path.resolve("output/api-locked-write");
    await fs.remove(outputDir);
    await generatePackage({ canonPath: fixturePath("examples/sample-tv/canon.yaml"), outputDir });

    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    canon.canon.format.value = "feature_film";

    const response = await request(app).put("/api/projects/api-locked-write/canon").send(canon);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Locked fields cannot be modified/);
  });
});
