import "dotenv/config";
import fs from "fs-extra";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";

const host = process.env.MEDIAGECKUSSY_STUDIO_HOST ?? "localhost";
const port = Number(process.env.MEDIAGECKUSSY_STUDIO_PORT ?? "4999");

async function main() {
  const app = createApp();
  const distStudio = path.resolve(import.meta.dirname, "../../dist-studio");

  if (process.env.NODE_ENV !== "development" && await fs.pathExists(distStudio)) {
    app.use("/", express.static(distStudio));
  }

  app.listen(port, host, () => {
    console.log(`Studio server listening at http://${host}:${port}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
