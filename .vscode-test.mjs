import { defineConfig } from "@vscode/test-cli";

/**
 * @type {import('@vscode/test-cli').TestConfiguration}
 */
export default defineConfig({
  // Glob pattern to find test files (compiled to JS)
  files: "out/test/vscode/**/*.test.js",

  // The development path - path to the extension
  extensionDevelopmentPath: ".",

  // Use custom launch config to enable proposed APIs
  launchArgs: ["--enable-proposed-api=deepwn.addi"],

  // Optional: additional mocha options
  mocha: {
    ui: "bdd",
    timeout: 60000,
  },

  // Optional: version of VS Code to use
  // version: "stable",
});
