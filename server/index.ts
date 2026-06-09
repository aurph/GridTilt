import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === "production";

// Replit terminates TLS at a single reverse proxy in front of our process.
// Trust one hop so req.ip reflects the real client IP for rate limiting.
app.set("trust proxy", 1);

// Strip the Express advertisement banner so probes can't fingerprint the stack.
app.disable("x-powered-by");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Security headers via helmet ─────────────────────────────────────────
//
// CSP rationale:
//   script-src       'self'                           (no external scripts;
//                                                      the old Twitter widget
//                                                      was removed when X
//                                                      retired timeline
//                                                      embeds). Dev mode adds
//                                                      'unsafe-eval' +
//                                                      'unsafe-inline' for
//                                                      Vite HMR; production
//                                                      stays tight.
//   style-src        'self' + 'unsafe-inline'         (React inline-style
//                                                      props render as
//                                                      style="..." attrs)
//                                  + fonts.googleapis.com
//   font-src         'self' + fonts.gstatic.com + data:
//   img-src          'self' + data: + https:          (allow third-party
//                                                      images we cite)
//   connect-src      'self' (+ ws/wss in dev for HMR)
//   frame-src        'self'                           (no third-party frames)
//   frame-ancestors  'none'                           (GridTilt is never
//                                                      embedded; prevents
//                                                      clickjacking)
//   object-src       'none'                           (no plugins ever)
//   base-uri         'self'                           (lock <base> to us)
//
// HSTS: enabled in production only, 1-year max-age, includeSubDomains,
// preload-eligible. Dev mode disables HSTS so a localhost dev server
// can't accidentally cache HSTS for the dev hostname.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProduction
          ? ["'self'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: isProduction
          ? ["'self'"]
          : ["'self'", "ws:", "wss:"],
        frameSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // Don't apply COEP — would break loading external images without
    // per-resource Cross-Origin-Resource-Policy headers from those
    // origins, which we don't control.
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    xFrameOptions: { action: "sameorigin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// ─── Global API rate limit ───────────────────────────────────────────────
// 120 req/min/IP across all /api/* endpoints. A logged-in dashboard user
// loading the overview pulls ~5 endpoints once + auto-refetches every
// 5-15 min, so the headroom is generous. Mass scrapers / probe storms
// will hit the limit fast.
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again in a minute." },
});
app.use("/api/", globalApiLimiter);

app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const sensitiveRoutes = ["/api/admin/subscribers", "/api/subscribe", "/api/unsubscribe"];
      const isSensitive = sensitiveRoutes.some((r) => path.startsWith(r));
      if (capturedJsonResponse && !isSensitive) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort is a no-op on single-instance Replit and throws ENOTSUP on
      // macOS, which breaks local `npm run dev`. Only enable it off-darwin.
      reusePort: process.platform !== "darwin",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
