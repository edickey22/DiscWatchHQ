import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadUser } from "./lib/authMiddleware";

const app: Express = express();

// Replit (and most cloud hosts) proxy requests through a load balancer that
// sets X-Forwarded-For. Without this, express-rate-limit throws a
// ValidationError because Express doesn't trust the header by default.
// "1" means: trust exactly one hop of proxy (the Replit edge), which is correct.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: allow credentials so the session cookie is sent cross-origin in dev.
// Both the tracker and API are served under the same Replit domain, but the
// vite dev server and API run on different ports, which counts as cross-origin.
app.use(
  cors({
    origin: true,       // reflect the request origin (safe: we control all domains)
    credentials: true,  // required for cookies to be accepted by the browser
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parse cookies — required before any route that reads req.cookies.
app.use(cookieParser());

// Attach req.user from session cookie when present (non-blocking — 401
// enforcement happens inside individual routes via requireAuth).
app.use(loadUser);

app.use("/api", router);

export default app;
