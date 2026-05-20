import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { getPageMeta, injectMetaTags } from "./seo";

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
    let html = fs.readFileSync(indexPath, "utf-8");
    const pathname = req.originalUrl.split("?")[0] || "/";
    const meta = getPageMeta(pathname);
    html = injectMetaTags(html, meta);
    res
      .set("Content-Type", "text/html")
      .set("X-Robots-Tag", "index, follow")
      .send(html);
  });
}
