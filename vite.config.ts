import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
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

export default defineConfig({
  plugins: [react(), apiPlugin()],
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
