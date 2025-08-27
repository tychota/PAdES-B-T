/**
 * Signature verification types
 */

import type { BaseApiResponse } from "./common";
import type { ByteRange } from "./pdf";

export interface VerificationRequest {
  pdfBase64: string;
}

export interface CertificateChainInfo {
  isValid: boolean;
  chainLength: number;
  trustedChain: boolean;
  signerCertificate?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    isValidNow: boolean;
    keyUsage: string[];
  };
  reasons: string[];
}

export interface VerificationResult {
  isCryptographicallyValid: boolean;
  isPAdESCompliant: boolean;
  isTimestamped: boolean; // PAdES-B-T specific
  signatureLevel: "B-B" | "B-T" | "UNKNOWN";
  signerCN?: string;
  signingTime?: string;
  timestampTime?: string; // For PAdES-B-T
  reasons: string[];
  chainTrusted?: boolean;
  certValidNow?: boolean;
  byteRange?: ByteRange;
  certificateChain?: CertificateChainInfo;
}

export interface VerificationResponse extends BaseApiResponse {
  result: VerificationResult;
}

export interface ComplianceCheck {
  requirement: string;
  satisfied: boolean;
  details?: string;
}

export interface DetailedVerificationResult extends VerificationResult {
  complianceChecks: ComplianceCheck[];
  certificateDetails?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    keyUsage?: string[];
  };
  timestampDetails?: {
    tsaName?: string;
    timestampTime: string;
    timestampAccuracy?: string;
    hashAlgorithm: string;
  };
}
