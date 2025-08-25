import { PAdESLogger, padesLogger } from "@pades-poc/shared";
import winston from "winston";

import type { LogEntry } from "@pades-poc/shared";

// Custom levels so "success" & "warning" are first-class (and ordered)
const customLevels = {
  levels: {
    error: 0,
    warning: 1,
    success: 2,
    info: 3,
    debug: 4,
  },
  colors: {
    error: "red",
    warning: "yellow",
    success: "green",
    info: "blue",
    debug: "gray",
  },
};

winston.addColors(customLevels.colors);

const envLevel = (process.env.LOG_LEVEL || "info") as keyof typeof customLevels.levels;
const isProd = process.env.NODE_ENV === "production";

export const logger = winston.createLogger({
  levels: customLevels.levels,
  level: envLevel, // base level (used if a transport doesn't override)
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      // Prefer our PAdES formatting when present
      if (info.padesEntry) {
        const entry = info.padesEntry as LogEntry;
        return padesLogger.formatLogEntry(entry);
      }
      const ts = typeof info.timestamp === "string" ? info.timestamp : new Date().toISOString();
      const lvl = typeof info.level === "string" ? info.level.toUpperCase() : "INFO";
      const msg = typeof info.message === "string" ? info.message : "Unknown message";
      return `${ts} [${lvl}] ${msg}`;
    }),
  ),
  transports: [
    // Make the console transport respect LOG_LEVEL (this was the noisy one)
    new winston.transports.Console({
      level: envLevel,
      handleExceptions: true,
    }),
    ...(isProd
      ? [
          new winston.transports.File({
            filename: "logs/pades-audit.log",
            level: envLevel,
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5,
          }),
        ]
      : []),
  ],
  exitOnError: false,
});

const getLogLevel = (level: string | undefined): LogEntry["level"] => {
  switch (level) {
    case "debug":
    case "info":
    case "success": // now a real level
    case "warning": // now a real level
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

// Bridge that routes PAdES log entries through Winston with our custom levels
export function logPAdES(entry: LogEntry): void {
  // Ensure level exists on the logger
  const lvl = entry.level as keyof typeof customLevels.levels;
  logger.log(lvl, entry.message, { padesEntry: entry });
}
