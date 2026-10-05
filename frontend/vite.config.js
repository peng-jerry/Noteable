import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The production build is served from https://peng-jerry.github.io/noteable/,
// so asset URLs need that prefix. Override with VITE_BASE if hosted elsewhere.
// `vite preview` serves the built files, so it needs the same base.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === "build" || isPreview ? process.env.VITE_BASE ?? "/noteable/" : "/",
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    css: false,
  },
}));
