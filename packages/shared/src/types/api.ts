/**
 * API request and response types for the three-step signing process
 */

import type { BaseApiResponse } from "./common";
import type { ByteRange, PDFSigningConfig } from "./pdf";

// Health check
export interface HealthResponse extends BaseApiResponse {
  status: "OK" | "ERROR";
  timestamp: string;
  service: string;
  version: string;
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
  toBeSignedB64: string; // Hash to sign with private key
  signedAttrsDerB64: string; // DER-encoded signed attributes
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
