import path from "path"
import { defineConfig } from "vitest/config"

// Deliberately separate from vite.config.ts (used for the dev server), which
// requires the PORT env var set by the Replit workflow — unit tests should
// run standalone without that.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
})
