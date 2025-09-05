/**
 * PKCS#11 integration types for native hardware token support
 */

import { BaseApiResponse } from "./common";

export interface PKCS11SlotInfo {
  slotId: number;
  description: string;
  manufacturerId: string;
  flags: number;
  tokenPresent: boolean;
  tokenInfo?: {
    label: string;
    manufacturerId: string;
    model: string;
    serialNumber: string;
  };
}

export interface PKCS11CertificateInfo {
  label: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  certificatePem: string;
}

export interface PKCS11SigningRequest {
  slotId: number;
  pin: string;
  dataToSignB64: string; // DER(signedAttributes) in base64
  certificateFilter?: {
    label?: string;
    subject?: string;
  };
}

export interface PKCS11SigningResponse extends BaseApiResponse {
  signatureB64: string;
  signerCertPem: string;
  signatureAlgorithmOid: string;
  certificate: PKCS11CertificateInfo;
}

export interface PKCS11SlotsResponse extends BaseApiResponse {
  slots: PKCS11SlotInfo[];
}

export interface PKCS11CertificatesRequest {
  slotId: number;
  pin?: string;
}

export interface PKCS11CertificatesResponse extends BaseApiResponse {
  certificates: PKCS11CertificateInfo[];
}