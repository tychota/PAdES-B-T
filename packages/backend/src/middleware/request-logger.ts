import { logger } from "../logger";

import type { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Skip logging for health checks to reduce noise
  if (req.path === "/api/health") {
    next();
    return;
  }

  res.on("finish", () => {
    const duration = Date.now() - start;

    logger.info("HTTP Request", {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration.toString()}ms`,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      contentLength: req.get("Content-Length"),
    });
  });

  next();
}
