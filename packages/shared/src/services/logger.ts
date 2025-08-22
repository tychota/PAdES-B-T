/**
 * Structured logging service for PAdES-B-T operations
 * Provides audit trail and debugging capabilities
 */

import type { LogEntry, LogLevel } from "../types/common";

export interface PAdESLogContext {
  workflowId?: string;
  step?: "prepare" | "presign" | "finalize" | "verify" | "timestamp";
  pdfSize?: number;
  signatureAlgorithm?: string;
  certificateSubject?: string;
  byteRange?: [number, number, number, number];
  duration?: number;
  sessionId?: string;
  readerName?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  includeTimestamp: boolean;
  includeSource: boolean;
  formatJson?: boolean;
}

export class PAdESLogger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: "info",
      includeTimestamp: true,
      includeSource: true,
      formatJson: false,
      ...config,
    };
  }

  /**
   * Create a log entry with PAdES-specific context
   */
  createLogEntry(
    level: LogLevel,
    source: LogEntry["source"],
    message: string,
    context?: PAdESLogContext & Record<string, unknown>,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      context,
    };

    // Store log entry for potential batch processing
    this.logs.push(entry);

    return entry;
  }

  /**
   * Log with workflow context
   */
  logWorkflowStep(
    level: LogLevel,
    source: LogEntry["source"],
    step: PAdESLogContext["step"],
    message: string,
    workflowId: string,
    additionalContext?: Record<string, unknown>,
  ): LogEntry {
    return this.createLogEntry(level, source, message, {
      workflowId,
      step,
      ...additionalContext,
    });
  }

  /**
   * Log PDF operation with size context
   */
  logPDFOperation(
    level: LogLevel,
    source: LogEntry["source"],
    message: string,
    pdfSize: number,
    additionalContext?: Record<string, unknown>,
  ): LogEntry {
    return this.createLogEntry(level, source, message, {
      pdfSize,
      ...additionalContext,
    });
  }

  /**
   * Log CPS card operation
   */
  logCPSOperation(
    level: LogLevel,
    message: string,
    sessionId?: string,
    readerName?: string,
    additionalContext?: Record<string, unknown>,
  ): LogEntry {
    return this.createLogEntry(level, "cps", message, {
      sessionId,
      readerName,
      ...additionalContext,
    });
  }

  /**
   * Log performance timing
   */
  logTiming(
    level: LogLevel,
    source: LogEntry["source"],
    operation: string,
    duration: number,
    additionalContext?: Record<string, unknown>,
  ): LogEntry {
    return this.createLogEntry(level, source, `${operation} completed`, {
      duration,
      ...additionalContext,
    });
  }

  /**
   * Get all logged entries
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear log history
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get logs for a specific workflow
   */
  getWorkflowLogs(workflowId: string): LogEntry[] {
    return this.logs.filter(
      (log) => log.context && "workflowId" in log.context && log.context.workflowId === workflowId,
    );
  }

  /**
   * Format log entry for display
   */
  formatLogEntry(entry: LogEntry): string {
    const timestamp = this.config.includeTimestamp ? `${entry.timestamp} ` : "";
    const source = this.config.includeSource ? `[${entry.source.toUpperCase()}] ` : "";
    const level = `[${entry.level.toUpperCase()}] `;

    let contextStr = "";
    if (entry.context) {
      if (this.config.formatJson) {
        contextStr = ` ${JSON.stringify(entry.context)}`;
      } else {
        const contextParts: string[] = [];
        const ctx = entry.context as PAdESLogContext & Record<string, unknown>;

        if (ctx.workflowId) contextParts.push(`workflow:${ctx.workflowId}`);
        if (ctx.step) contextParts.push(`step:${ctx.step}`);
        if (ctx.pdfSize) contextParts.push(`pdf:${ctx.pdfSize.toString()}b`);
        if (ctx.duration) contextParts.push(`${ctx.duration.toString()}ms`);

        if (contextParts.length > 0) {
          contextStr = ` (${contextParts.join(", ")})`;
        }
      }
    }

    return `${timestamp}${source}${level}${entry.message}${contextStr}`;
  }

  /**
   * Check if a log level should be output based on current config
   */
  shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "success", "warning", "error"];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }
}

// Default instance for convenience
export const padesLogger = new PAdESLogger();
