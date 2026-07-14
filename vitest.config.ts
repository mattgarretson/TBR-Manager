import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(process.cwd(), "tests/helpers/cloudflare-workers.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
