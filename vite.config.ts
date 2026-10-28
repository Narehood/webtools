import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import type { Plugin } from "vite";
import { handleApi } from "./server/api";

function apiPlugin() {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) {
      next();
      return;
    }
    void handleApi(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Internal error";
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: message }));
    });
  };

  return {
    name: "webtools-api",
    configureServer(server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) {
      server.middlewares.use(middleware);
    },
  };
}

// Ship PDF.js resources with the app, including in offline/LAN deployments.
function pdfAssetsPlugin(): Plugin {
  const files = new Map<string, string>();
  for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    const directory = path.resolve("node_modules/pdfjs-dist", folder);
    for (const name of readdirSync(directory)) {
      if (/\.(bcmap|pfb|ttf|wasm|icc|js)$/i.test(name) || name.startsWith("LICENSE")) files.set(`/pdfjs/${folder}/${name}`, path.join(directory, name));
    }
  }
  return {
    name: "local-pdf-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        const file = files.get(pathname);
        if (!file) { next(); return; }
        res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [url, file] of files) this.emitFile({ type: "asset", fileName: url.slice(1), source: readFileSync(file) });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin(), pdfAssetsPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
