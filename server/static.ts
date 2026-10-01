import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { getPageMeta, injectMetaTags } from "./seo";
import { injectRuntimeConfig } from "./runtime-config";

/**
 * The HTML answer for a page address: the app shell with that page's
 * metadata, and the status and robots header the metadata calls for. An
 * address that names nothing gets a real 404 with noindex (seo.ts); the shell
 * still loads and shows its own not-found page.
 */
export function pageResponse(indexHtml: string, originalUrl: string): { status: number; robots: string; html: string } {
  const pathname = originalUrl.split("?")[0] || "/";
  const meta = getPageMeta(pathname);
  const html = injectRuntimeConfig(injectMetaTags(indexHtml, meta));
  return { status: meta.status ?? 200, robots: meta.robots ?? "index, follow", html };
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    index: false,
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  app.use("/{*path}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const page = pageResponse(fs.readFileSync(indexPath, "utf-8"), req.originalUrl);
    res.status(page.status).set("Content-Type", "text/html").set("X-Robots-Tag", page.robots).send(page.html);
  });
}
