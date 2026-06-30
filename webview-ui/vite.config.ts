import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "",
  plugins: [
    react(),
    // VS Code webviews cannot load <script type="module" crossorigin> — they run
    // inside a vscode-webview:// iframe where CORS / Service Workers are unsupported.
    // This plugin removes those attributes from the final index.html.
    {
      name: "vscode-webview-compat",
      enforce: "post",
      transformIndexHtml(html) {
        return html.replace(
          /<script type="module" crossorigin src=/g,
          '<script src=',
        );
      },
    },
  ],
  build: {
    outDir: "../resources/webview",
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
