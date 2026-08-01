import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // The Web Playback SDK needs a secure context, and Spotify redirect URIs must be
    // registered exactly — so the host always runs here. See docs/03-architecture.md.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    // The engine is pure; jsdom arrives when there are UI tests to run.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
