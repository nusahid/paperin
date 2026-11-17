import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          "signature-worker": "src/main/signature-worker.ts",
          "conversion-worker": "src/main/conversion-worker.ts",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: "cjs" } } },
  },
  renderer: {
    plugins: [react()],
    build: { rollupOptions: { input: "src/renderer/index.html" } },
  },
});
