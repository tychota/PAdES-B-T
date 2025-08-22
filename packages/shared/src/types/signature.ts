/**
 * Digital signature related types
 */

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  keyUsage?: string[];
  extKeyUsage?: string[];
}

export interface SignedAttributes {
  contentType: string;
  messageDigest: string;
  signingCertificateV2?: string;
  signingTime?: string; // Note: forbidden in PAdES baseline, allowed in B-T with timestamp
}

export interface CMSSignedData {
  version: number;
  digestAlgorithms: string[];
  certificates: string[]; // PEM format
  signerInfos: SignerInfo[];
}

export interface SignerInfo {
  version: number;
  signerIdentifier: string;
  digestAlgorithm: string;
  signedAttributes: SignedAttributes;
  signatureAlgorithm: string;
  signature: string; // base64
  unsignedAttributes?: Record<string, unknown>;
  timestampToken?: string; // base64 DER for PAdES-B-T
}
