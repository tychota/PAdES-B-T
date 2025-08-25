import { PAdESLogger, padesLogger } from "@pades-poc/shared";
import winston from "winston";

import type { LogEntry } from "@pades-poc/shared";

// Configure Winston logger with PAdES-specific formatting
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      // If it's a PAdES log entry, use our custom formatter
      if (info.padesEntry) {
        const entry = info.padesEntry as LogEntry;
        return padesLogger.formatLogEntry(entry);
      }
      // Otherwise use default formatting
      const timestamp =
        typeof info.timestamp === "string" ? info.timestamp : new Date().toISOString();
      const level = typeof info.level === "string" ? info.level.toUpperCase() : "INFO";
      const message = typeof info.message === "string" ? info.message : "Unknown message";
      return `${timestamp} [${level}] ${message}`;
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

const getLogLevel = (level: string | undefined): LogEntry["level"] => {
  switch (level) {
    case "debug":
    case "info":
    case "success":
    case "warning":
    case "error":
      return level;
    default:
      return "info";
  }
};

// Initialize PAdES logger with Winston integration
export const padesBackendLogger = new PAdESLogger({
  level: getLogLevel(process.env.LOG_LEVEL),
  includeTimestamp: true,
  includeSource: true,
  formatJson: process.env.NODE_ENV === "production",
});

// Custom logging function that integrates with Winston
export function logPAdES(entry: LogEntry): void {
  logger.log(entry.level, entry.message, { padesEntry: entry });
}
