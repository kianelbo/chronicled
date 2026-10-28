import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import groupRoutes from "./routes/groups";

export function createApp(frontendDistDir = process.env.FRONTEND_DIST_DIR ?? path.resolve(process.cwd(), "../frontend/dist")) {
  const app = express();
  const corsOrigins = process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  const frontendIndex = path.join(frontendDistDir, "index.html");

  if (corsOrigins?.length) {
    app.use(cors({ origin: corsOrigins, credentials: true }));
  }
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/events", eventRoutes);
  app.use("/api/groups", groupRoutes);

  if (existsSync(frontendIndex)) {
    app.use(express.static(frontendDistDir));
    app.get("/{*path}", (req, res, next) => {
      if (req.path === "/api" || req.path.startsWith("/api/") ||
          !req.get("accept")?.includes("text/html") || !req.accepts("html")) {
        return next();
      }
      res.sendFile(frontendIndex);
    });
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(`Frontend build not found at ${frontendDistDir}`);
  }

  return app;
}
