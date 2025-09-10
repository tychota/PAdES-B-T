/**
 * API request and response types for the three-step signing process
 */

import type { BaseApiResponse, LogEntry } from "./common";
import type { ByteRange, PDFSigningConfig } from "./pdf";

// Health check
export interface HealthResponse extends BaseApiResponse {
  status: "OK" | "ERROR";
  timestamp: string;
  service: string;
  version: string;
  logs?: LogEntry[];
}

// Step 1: Prepare PDF for signing
export interface PrepareRequest {
  pdfBase64: string;
  config: PDFSigningConfig;
}

export interface PrepareResponse extends BaseApiResponse {
  preparedPdfBase64: string;
  byteRange: ByteRange;
  messageDigestB64: string;
}

// Step 2: Pre-sign (build signed attributes)
export interface PresignRequest {
  messageDigestB64: string;
  signerCertPem?: string;
  signingTime?: Date;
}

export interface PresignResponse extends BaseApiResponse {
  signedAttrsDerB64: string; // DER-encoded signed attributes (what needs to be signed)
  expectedDigestB64: string; // SHA-256 hash of signedAttrsDer for CPS validation
}

// Step 3: Finalize (assemble CMS and embed in PDF)
export interface FinalizeRequest {
  preparedPdfBase64: string;
  byteRange: ByteRange;
  signedAttrsDerB64: string;
  signatureB64: string; // Raw signature from external signer
  signerCertPem: string;
  certificateChainPem?: string[]; // Optional intermediate certificates
  signatureAlgorithmOid?: string; // Default: SHA256withRSA
  /** Whether to request and embed RFC 3161 signature-time-stamp token (B-T). Default true. */
  withTimestamp?: boolean;
}

export interface FinalizeResponse extends BaseApiResponse {
  signedPdfBase64: string;
}

// PDF generation (for demo/testing)
export interface GenerateDemoPDFRequest {
  config?: PDFSigningConfig;
}

export interface GenerateDemoPDFResponse extends BaseApiResponse {
  pdfBase64: string;
}

// Mock HSM responses
export interface MockSignResponse extends BaseApiResponse {
  signatureB64: string;
  signerCertPem: string;
  certificateChainPem?: string[];
  signatureAlgorithmOid: string;
}

// DC Parameter endpoints
export interface GetDcParameterResponse extends BaseApiResponse {
  dcParameter: string;
}

// Debug endpoints
export interface DebugPdfObjectsRequest {
  pdfBase64: string;
  /** Only return objects that look like signature dictionaries (/Type /Sig) */
  onlySignatureObjects?: boolean;
  /** Replace large stream bodies with a placeholder comment */
  collapseStreams?: boolean;
}
export interface DebugPdfObjectsResponse extends BaseApiResponse {
  /** Preformatted text of objects (e.g. "9 0 obj << ... >> endobj") */
  objectsText: string;
  /** Object numbers that contain /Type /Sig */
  signatureObjectNumbers?: number[];
}

export interface DebugCmsRequest {
  /** Pass a whole PDF; the server will extract /Contents <...> */
  pdfBase64?: string;
  /** Or pass CMS DER directly as base64 */
  cmsDerBase64?: string;
}
export interface DebugCmsResponse extends BaseApiResponse {
  summary: {
    signedDataVersion: number;
    digestAlgorithms: string[];
    eContentType: string;
    certificateCount: number;
    signerSubject?: string;
    hasTimestamp: boolean;
    signedAttributeOids: string[];
  };
  /** Parsed ASN.1 tree (safe-to-serialize subset) */
  asn1?: unknown;
}
