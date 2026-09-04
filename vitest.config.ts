import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately not extending vite.config.ts: that one is rooted at client/
// and loads the Replit editor plugins, neither of which suits running
// server-side logic under Node. Only the path aliases are shared, and they
// are repeated here rather than imported for that reason.
export default defineConfig({
  test: {
    environment: "node",
    include: ["{server,shared,client}/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
