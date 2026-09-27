import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: ".env.local" });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside React Server Components; tests call server modules directly.
      "server-only": path.resolve(__dirname, "tests/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
