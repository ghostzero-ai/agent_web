import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(webRoot, "mobile"),
  base: "./",
  publicDir: false,
  plugins: [
    {
      name: "strip-next-client-directive",
      enforce: "pre",
      transform(code, id) {
        const sourcePath = path.normalize(id.split("?", 1)[0]);
        if (!sourcePath.startsWith(webRoot) || sourcePath.includes("node_modules")) {
          return null;
        }
        const transformed = code.replace(/^\s*["']use client["'];?\s*/, "");
        return transformed === code ? null : { code: transformed, map: null };
      },
    },
  ],
  resolve: {
    alias: {
      "@": webRoot,
    },
  },
  build: {
    outDir: path.join(webRoot, "mobile-dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
    },
  },
});
