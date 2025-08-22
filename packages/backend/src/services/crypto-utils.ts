/**
 * Basic cryptographic utilities for PDF signing
 */
import { createHash } from "crypto";

/**
 * Calculate SHA-256 hash of data
 */
export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Convert buffer to base64 string
 */
export function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Convert base64 string to buffer
 */
export function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

/**
 * Convert buffer to hex string
 */
export function toHex(buffer: Buffer): string {
  return buffer.toString("hex");
}

/**
 * Calculate hash of PDF byte ranges
 */
export function calculatePDFHash(
  pdfBytes: Buffer,
  byteRange: [number, number, number, number],
): Buffer {
  const [start1, length1, start2, length2] = byteRange;

  // Extract the two byte ranges that are covered by the signature
  const part1 = pdfBytes.subarray(start1, start1 + length1);
  const part2 = pdfBytes.subarray(start2, start2 + length2);

  // Concatenate and hash
  const combined = Buffer.concat([part1, part2]);
  return sha256(combined);
}
