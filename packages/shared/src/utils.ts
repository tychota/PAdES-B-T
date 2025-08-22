/**
 * Shared utility functions
 */

import type { PAdESError, LogEntry } from "./types/common";

/**
 * Create a standardized PAdES error
 */
export function createPAdESError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): PAdESError {
  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a log entry
 */
export function createLogEntry(
  level: LogEntry["level"],
  source: LogEntry["source"],
  message: string,
  context?: Record<string, unknown>,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    context,
  };
}

/**
 * Validate base64 string
 */
export function isValidBase64(str: string): boolean {
  if (typeof str !== "string" || str.length === 0) {
    return false;
  }

  try {
    // Check if it's valid base64
    const decoded = Buffer.from(str, "base64").toString("base64");
    return decoded === str;
  } catch {
    return false;
  }
}

/**
 * Validate PEM certificate format
 */
export function isValidPEM(pem: string): boolean {
  if (typeof pem !== "string") {
    return false;
  }

  const pemRegex = /^-----BEGIN [A-Z\s]+-----[\s\S]*-----END [A-Z\s]+-----$/;
  return pemRegex.test(pem.trim());
}

/**
 * Extract CN from certificate subject string
 */
export function extractCNFromSubject(subject: string): string | null {
  const cnMatch = subject.match(/CN=([^,/]+)/);
  return cnMatch ? cnMatch[1].trim() : null;
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Sanitize filename for download
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w\-_.]/g, "_").substring(0, 255);
}

/**
 * Generate a short unique identifier
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Deep clone an object (simple implementation)
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}
