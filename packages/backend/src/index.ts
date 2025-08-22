import { PAdESLogger, padesLogger } from "@pades-poc/shared";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import winston from "winston";

import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { router as apiRouter } from "./routes/api";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Configure Winston logger with PAdES-specific formatting
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      // If it's a PAdES log entry, use our custom formatter
      if (info.padesEntry) {
        return padesLogger.formatLogEntry(info.padesEntry as any);
      }
      // Otherwise use default formatting
      return `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`;
    }),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // Add file transport for audit trail in production
    ...(process.env.NODE_ENV === "production"
      ? [
          new winston.transports.File({
            filename: "logs/pades-audit.log",
            level: "info",
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
        ]
      : []),
  ],
});

// Initialize PAdES logger with Winston integration
export const padesBackendLogger = new PAdESLogger({
  level: (process.env.LOG_LEVEL as any) || "info",
  includeTimestamp: true,
  includeSource: true,
  formatJson: process.env.NODE_ENV === "production",
});

// Custom logging function that integrates with Winston
export function logPAdES(entry: any): void {
  logger.log(entry.level, entry.message, { padesEntry: entry });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use("/api", apiRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  const startupEntry = padesBackendLogger.createLogEntry(
    "success",
    "backend",
    `🚀 PAdES-B-T Backend server running on http://localhost:${PORT.toString()}`,
    { port: PORT, environment: process.env.NODE_ENV || "development" },
  );
  logPAdES(startupEntry);

  const environmentEntry = padesBackendLogger.createLogEntry(
    "info",
    "backend",
    `📋 Environment: ${process.env.NODE_ENV || "development"}`,
  );
  logPAdES(environmentEntry);
});

export default app;
