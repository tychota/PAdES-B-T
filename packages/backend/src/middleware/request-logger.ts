import type { Request, Response, NextFunction } from "express";
import { logger } from "../index";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Skip logging for health checks to reduce noise
  if (req.path === "/api/health") {
    return next();
  }

  res.on("finish", () => {
    const duration = Date.now() - start;

    logger.info("HTTP Request", {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      contentLength: req.get("Content-Length"),
    });
  });

  next();
}
