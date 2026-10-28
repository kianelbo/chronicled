import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";

describe("production app hosting", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  let frontendDir: string;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let baseUrl: string;

  beforeAll(async () => {
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGINS;
    frontendDir = await mkdtemp(path.join(tmpdir(), "chronicled-frontend-"));
    await mkdir(path.join(frontendDir, "assets"));
    await writeFile(path.join(frontendDir, "index.html"), "<main>Chronicled UI</main>");
    await writeFile(path.join(frontendDir, "assets", "app.js"), "window.chronicled = true;");
    server = createApp(frontendDir).listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(frontendDir, { recursive: true, force: true });
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalCorsOrigins;
  });

  it("serves frontend files and falls back to the app shell for client-side routes", async () => {
    const route = await fetch(`${baseUrl}/groups/42`, { headers: { Accept: "text/html" } });
    expect(route.status).toBe(200);
    expect(await route.text()).toContain("Chronicled UI");

    const asset = await fetch(`${baseUrl}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("window.chronicled");
  });

  it("does not return the frontend shell for unknown API or non-HTML requests", async () => {
    const api = await fetch(`${baseUrl}/api/not-found`, { headers: { Accept: "text/html" } });
    expect(api.status).toBe(404);
    expect(await api.text()).not.toContain("Chronicled UI");

    const missingAsset = await fetch(`${baseUrl}/missing.js`);
    expect(missingAsset.status).toBe(404);
  });

  it("fails in production when the frontend build is missing", () => {
    process.env.NODE_ENV = "production";
    expect(() => createApp(path.join(frontendDir, "missing"))).toThrow("Frontend build not found");
    delete process.env.NODE_ENV;
  });
});
