import express from "express";
import cors from "cors";
import { registerProjectRoutes } from "./api/projects.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  registerProjectRoutes(app);
  return app;
}
