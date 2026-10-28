import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

async function start() {
  const { createApp } = await import("./app.js");
  const PORT = process.env.PORT || 5000;

  createApp().listen(PORT, () => console.log(`Chronicled server running on port ${PORT}`));
}

start().catch((error: unknown) => {
  console.error("Failed to start Chronicled server:", error);
  process.exitCode = 1;
});
