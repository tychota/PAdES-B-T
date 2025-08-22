/**
 * Common types used throughout the PAdES-B-T application
 */

export type LogLevel = "debug" | "info" | "success" | "warning" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: "backend" | "frontend" | "external" | "cps" | "mock-hsm";
  message: string;
  context?: Record<string, unknown>;
}

export interface PAdESError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface BaseApiResponse {
  success: boolean;
  error?: PAdESError;
  logs?: LogEntry[];
}
