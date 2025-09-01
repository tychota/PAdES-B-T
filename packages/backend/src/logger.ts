// logger.ts
import { PAdESLogger, padesLogger } from "@pades-poc/shared";
import { config } from "dotenv";
import winston from "winston";

import type { LogEntry } from "@pades-poc/shared";

config();

/** Custom levels so "success" & "warning" are first-class */
const customLevels = {
  error: 0,
  warning: 1,
  success: 2,
  info: 3,
  debug: 4,
} as const;

type LevelKey = keyof typeof customLevels;

winston.addColors({
  error: "red",
  warning: "yellow",
  success: "green",
  info: "blue",
  debug: "gray",
});

/** Resolve env LOG_LEVEL with a tiny guard */
const envLevel = ((): LevelKey => {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return (raw in customLevels ? raw : "info") as LevelKey;
})();

const isProd = process.env.NODE_ENV === "production";

/** Single formatter (PAdES first, otherwise ts [LVL] msg) */
const baseFormat = winston.format.printf((info) => {
  // If a PAdES entry was passed, delegate to the shared formatter
  if (info.padesEntry) {
    return padesLogger.formatLogEntry(info.padesEntry as LogEntry);
  }

  const ts = typeof info.timestamp === "string" ? info.timestamp : new Date().toISOString();
  // `info.level` is colorized by the Console transport (level-only)
  const lvl = (info.level || "info").toUpperCase();
  const msg = typeof info.message === "string" ? info.message : String(info.message);
  return `${ts} [${lvl}] ${msg}`;
});

/** One logger, one format */
export const logger = winston.createLogger({
  levels: customLevels,
  level: envLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({
      level: envLevel,
      handleExceptions: true,
      format: winston.format.combine(baseFormat, winston.format.colorize({ all: true })),
    }),
    ...(isProd
      ? [
          new winston.transports.File({
            filename: "logs/pades-audit.log",
            level: envLevel,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.json(),
            ),
          }),
        ]
      : []),
  ],
  exitOnError: false,
});

/** Minimal env→PAdES level guard */
const toPadesLevel = (lvl: string | undefined): LogEntry["level"] => {
  const l = (lvl || "info").toLowerCase();
  return (l in customLevels ? l : "info") as LogEntry["level"];
};

/** PAdES logger (kept simple) */
export const padesBackendLogger = new PAdESLogger({
  level: toPadesLevel(process.env.LOG_LEVEL),
  includeTimestamp: true,
  includeSource: true,
  formatJson: isProd,
});

/** Bridge: route PAdES entries through Winston with colorized level */
export function logPAdES(entry: LogEntry): void {
  const lvl: LevelKey = (entry.level in customLevels ? entry.level : "info") as LevelKey;
  logger.log(lvl, entry.message, { padesEntry: { ...entry, level: lvl } });
}
