import { logger } from "../index";

import type { BaseApiResponse } from "@pades-poc/shared";
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  const response: BaseApiResponse = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production" ? "An internal server error occurred" : err.message,
      timestamp: new Date().toISOString(),
    },
  };

  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json(response);
}
