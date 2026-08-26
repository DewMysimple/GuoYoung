import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
  base: mode === "extension" ? "./" : "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: mode === "extension" ? "dist-extension" : "dist",
    emptyOutDir: true,
    rollupOptions: {
      input:
        mode === "extension"
          ? {
              main: resolve(__dirname, "index.html"),
              popup: resolve(__dirname, "popup.html"),
              background: resolve(__dirname, "src/background.ts"),
            }
          : resolve(__dirname, "index.html"),
      ...(mode === "extension"
        ? {
            output: {
              entryFileNames: "[name].js",
            },
          }
        : {}),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
