import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Deliberately not extending vite.config.ts: that one is rooted at client/
// and loads the Replit editor plugins, neither of which suits running
// server-side logic under Node. Only the path aliases are shared, and they
// are repeated here rather than imported for that reason.
export default defineConfig({
  // Only for the JSX transform in .test.tsx files; server tests are plain TS
  // and the plugin doesn't touch them.
  plugins: [react()],
  test: {
    // Server tests are the bulk of the suite, so Node is the default and the
    // handful of component tests opt into jsdom per-file via a docblock.
    environment: "node",
    include: ["{server,shared,client}/**/*.test.{ts,tsx}"],
    setupFiles: ["./client/src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
