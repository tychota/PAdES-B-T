/**
 * PDF-related types and interfaces
 */

export interface PDFSigningConfig {
  signerName?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  signatureLevel?: "B-B" | "B-T";
  timestampUrl?: string;
}

export type ByteRange = [number, number, number, number];

export interface PDFMetadata {
  size: number;
  pageCount?: number;
  hasExistingSignatures?: boolean;
  existingSignatureCount?: number;
}

export interface SignaturePlaceholder {
  byteRange: ByteRange;
  contentsStart: number;
  contentsEnd: number;
  maxSignatureLength: number;
}
