/**
 * Certificate Chain Validation Service for PAdES verification
 *
 * Validates certificate chains according to X.509 standards and PAdES requirements.
 * Uses PKI.js for certificate parsing and WebCrypto for signature verification.
 */

import * as asn1js from "asn1js";
import { Certificate } from "pkijs";

import { logPAdES, padesBackendLogger } from "../logger";

import type { LogEntry } from "@pades-poc/shared";

export interface ChainValidationOptions {
  /** Check certificate validity periods against current time */
  checkValidityPeriod?: boolean;
  /** Verify certificate signatures up the chain */
  verifySignatures?: boolean;
  /** Check key usage extensions */
  checkKeyUsage?: boolean;
  /** Maximum chain length to prevent infinite loops */
  maxChainLength?: number;
  /** Trusted root certificates (if empty, accepts self-signed chains) */
  trustedRoots?: Certificate[];
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  keyUsage: string[];
  isValidNow: boolean;
  isSelfSigned: boolean;
}

export interface ChainValidationResult {
  isValid: boolean;
  chainLength: number;
  certificates: CertificateInfo[];
  trustedChain: boolean;
  reasons: string[];
  rootCertificate?: CertificateInfo;
}

const DEFAULT_OPTIONS: Required<ChainValidationOptions> = {
  checkValidityPeriod: true,
  verifySignatures: true,
  checkKeyUsage: true,
  maxChainLength: 10,
  trustedRoots: [],
};

/**
 * Service for validating X.509 certificate chains in PAdES signatures
 */
export class CertificateChainValidator {
  private options: Required<ChainValidationOptions>;

  constructor(options: ChainValidationOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Validate a certificate chain from a CMS SignedData structure
   */
  async validateChain(
    certificates: Certificate[],
    signerCert: Certificate,
    logs?: LogEntry[],
  ): Promise<ChainValidationResult> {
    const reasons: string[] = [];
    const certInfos: CertificateInfo[] = [];
    let isValid = true;
    let trustedChain = false;

    // Enhanced diagnostic logging for CPS certificate debugging
    const signerSubject = this.getSubjectCN(signerCert);
    const signerIssuer = this.getDNString(signerCert.issuer);
    const signerSerial = Buffer.from(signerCert.serialNumber.valueBlock.valueHex).toString("hex");

    logs?.push({
      timestamp: new Date().toISOString(),
      level: "debug",
      source: "backend",
      message: "Starting certificate chain validation",
      context: {
        totalCertificates: certificates.length,
        signerSubject,
        signerIssuer,
        signerSerial,
        signerValidFrom: signerCert.notBefore.value.toISOString(),
        signerValidTo: signerCert.notAfter.value.toISOString(),
        certificateDetails: certificates.map((cert, idx) => ({
          index: idx,
          subject: this.getSubjectCN(cert),
          issuer: this.getDNString(cert.issuer),
          serial: Buffer.from(cert.serialNumber.valueBlock.valueHex).toString("hex"),
          validFrom: cert.notBefore.value.toISOString(),
          validTo: cert.notAfter.value.toISOString(),
        })),
      },
    });

    // Build ordered chain starting from signer certificate
    const orderedChain = this.buildOrderedChain(certificates, signerCert);

    if (orderedChain.length === 0) {
      reasons.push("Unable to build certificate chain");
      return {
        isValid: false,
        chainLength: 0,
        certificates: [],
        trustedChain: false,
        reasons,
      };
    }

    if (orderedChain.length > this.options.maxChainLength) {
      reasons.push(
        `Certificate chain too long (${orderedChain.length} > ${this.options.maxChainLength})`,
      );
      isValid = false;
    }

    // Validate each certificate in the chain
    for (let i = 0; i < orderedChain.length; i++) {
      const cert = orderedChain[i];
      const isRoot = i === orderedChain.length - 1;
      const issuerCert = isRoot ? cert : orderedChain[i + 1]; // Self-signed if root

      const certInfo = this.extractCertificateInfo(cert);
      certInfos.push(certInfo);

      // Check validity period
      if (this.options.checkValidityPeriod && !certInfo.isValidNow) {
        reasons.push(`Certificate ${certInfo.subject} is not valid (expired or not yet valid)`);
        isValid = false;
      }

      // Check key usage for non-root certificates
      if (this.options.checkKeyUsage && i === 0) {
        // Signer certificate should have digitalSignature and/or nonRepudiation
        if (
          !certInfo.keyUsage.includes("digitalSignature") &&
          !certInfo.keyUsage.includes("nonRepudiation")
        ) {
          reasons.push(
            "Signer certificate missing required key usage (digitalSignature or nonRepudiation)",
          );
          isValid = false;
        }
      }

      // Verify signature (except for trusted roots)
      if (this.options.verifySignatures && !this.isTrustedRoot(cert)) {
        try {
          const signatureValid = await this.verifyCertificateSignature(cert, issuerCert);
          if (!signatureValid) {
            reasons.push(`Certificate ${certInfo.subject} has invalid signature`);
            isValid = false;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          reasons.push(`Failed to verify certificate signature: ${errorMsg}`);
          isValid = false;
        }
      }
    }

    // Check if chain ends with a trusted root
    const rootCert = orderedChain[orderedChain.length - 1];
    if (this.options.trustedRoots.length > 0) {
      trustedChain = this.isTrustedRoot(rootCert);
      if (!trustedChain) {
        reasons.push("Certificate chain does not end with a trusted root certificate");
        isValid = false;
      }
    } else {
      // Accept self-signed chains when no trusted roots provided
      trustedChain = this.extractCertificateInfo(rootCert).isSelfSigned;
    }

    logs?.push({
      timestamp: new Date().toISOString(),
      level: isValid ? "success" : "warning",
      source: "backend",
      message: `Certificate chain validation completed: ${isValid ? "VALID" : "INVALID"}`,
      context: {
        chainLength: orderedChain.length,
        trustedChain,
        reasonCount: reasons.length,
      },
    });

    return {
      isValid,
      chainLength: orderedChain.length,
      certificates: certInfos,
      trustedChain,
      reasons,
      rootCertificate: certInfos[certInfos.length - 1],
    };
  }

  /**
   * Build an ordered certificate chain from available certificates
   */
  private buildOrderedChain(certificates: Certificate[], signerCert: Certificate): Certificate[] {
    const chain: Certificate[] = [signerCert];
    const remaining = certificates.filter((cert) => cert !== signerCert);

    let currentCert = signerCert;

    // Build chain by following issuer relationships
    while (chain.length < this.options.maxChainLength) {
      if (this.extractCertificateInfo(currentCert).isSelfSigned) {
        break; // Reached self-signed root
      }

      // Find issuer certificate
      const issuer = remaining.find((cert) => this.isIssuerOf(cert, currentCert));
      if (!issuer) {
        break; // No issuer found, chain ends here
      }

      chain.push(issuer);
      currentCert = issuer;

      // Remove from remaining to prevent cycles
      const issuerIndex = remaining.indexOf(issuer);
      remaining.splice(issuerIndex, 1);
    }

    return chain;
  }

  /**
   * Check if cert1 is the issuer of cert2
   */
  private isIssuerOf(issuerCandidate: Certificate, subjectCert: Certificate): boolean {
    try {
      // Compare issuer DN of subject with subject DN of issuer candidate
      const subjectIssuerDN = this.getDNString(subjectCert.issuer);
      const candidateSubjectDN = this.getDNString(issuerCandidate.subject);

      return subjectIssuerDN === candidateSubjectDN;
    } catch {
      return false;
    }
  }

  /**
   * Extract certificate information for validation
   */
  private extractCertificateInfo(cert: Certificate): CertificateInfo {
    const subject = this.getDNString(cert.subject);
    const issuer = this.getDNString(cert.issuer);
    const serialNumber = Buffer.from(cert.serialNumber.valueBlock.valueHex).toString("hex");
    const validFrom = cert.notBefore.value;
    const validTo = cert.notAfter.value;
    const now = new Date();
    const isValidNow = now >= validFrom && now <= validTo;
    const isSelfSigned = subject === issuer;

    // Extract key usage from extensions
    const keyUsage: string[] = [];
    if (cert.extensions) {
      const keyUsageExt = cert.extensions.find((ext) => ext.extnID === "2.5.29.15");
      if (keyUsageExt && keyUsageExt.extnValue) {
        try {
          const parsed = asn1js.fromBER(keyUsageExt.extnValue.valueBlock.valueHex);
          const bitStr = parsed.result as asn1js.BitString;
          const bitsArr = new Uint8Array(bitStr.valueBlock.valueHex);
          const bits = bitsArr.length > 0 ? bitsArr[bitsArr.length - 1] : 0;

          logPAdES(
            padesBackendLogger.createLogEntry("debug", "backend", "Parsed keyUsage extension", {
              bits,
              subject,
              serialNumber,
            }),
          );

          if (bits & 0x80) keyUsage.push("digitalSignature");
          if (bits & 0x40) keyUsage.push("nonRepudiation");
          if (bits & 0x20) keyUsage.push("keyEncipherment");
          if (bits & 0x10) keyUsage.push("dataEncipherment");
          if (bits & 0x08) keyUsage.push("keyAgreement");
          if (bits & 0x04) keyUsage.push("keyCertSign");
          if (bits & 0x02) keyUsage.push("cRLSign");
          if (bits & 0x01) keyUsage.push("encipherOnly");
          // “decipherOnly” lives in an extra byte if keyAgreement set; skip unless needed.
        } catch (error) {
          // fall back to empty keyUsage
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          logPAdES(
            padesBackendLogger.createLogEntry(
              "warning",
              "backend",
              "Unable to parse keyUsage extension",
              {
                error: errorMsg,
                subject,
                serialNumber,
              },
            ),
          );
        }
      }
    }

    logPAdES(
      padesBackendLogger.createLogEntry("debug", "backend", "Extracted certificate info", {
        subject,
        issuer,
        serialNumber,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        keyUsage,
        isValidNow,
        isSelfSigned,
      }),
    );

    return {
      subject,
      issuer,
      serialNumber,
      validFrom,
      validTo,
      keyUsage,
      isValidNow,
      isSelfSigned,
    };
  }

  /**
   * Verify certificate signature using issuer certificate
   */
  private async verifyCertificateSignature(
    cert: Certificate,
    issuerCert: Certificate,
  ): Promise<boolean> {
    try {
      // Verify certificate signature using the issuer certificate
      return await cert.verify(issuerCert);
    } catch {
      return false;
    }
  }

  /**
   * Check if certificate is in trusted roots list
   */
  private isTrustedRoot(cert: Certificate): boolean {
    if (this.options.trustedRoots.length === 0) {
      return true; // Accept any root when no trusted roots configured
    }

    return this.options.trustedRoots.some((trustedRoot) => {
      try {
        const certFingerprint = this.getCertificateFingerprint(cert);
        const trustedFingerprint = this.getCertificateFingerprint(trustedRoot);
        return certFingerprint === trustedFingerprint;
      } catch {
        return false;
      }
    });
  }

  /**
   * Get certificate fingerprint for comparison
   */
  private getCertificateFingerprint(cert: Certificate): string {
    const certDer = cert.toSchema().toBER(false);
    return Buffer.from(certDer).toString("hex");
  }

  /**
   * Convert Distinguished Name to string representation
   */
  private getDNString(dn: Certificate["subject"]): string {
    return dn.typesAndValues
      .map((tv) => {
        const type = this.getOidName(tv.type);
        const value = tv.value.valueBlock.value;
        return `${type}=${value}`;
      })
      .join(", ");
  }

  /**
   * Get common name for OID
   */
  private getOidName(oid: string): string {
    const oidMap: Record<string, string> = {
      "2.5.4.3": "CN",
      "2.5.4.6": "C",
      "2.5.4.7": "L",
      "2.5.4.8": "ST",
      "2.5.4.10": "O",
      "2.5.4.11": "OU",
    };
    return oidMap[oid] || oid;
  }

  /**
   * Get subject CN from certificate
   */
  private getSubjectCN(cert: Certificate): string {
    try {
      const cn = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3");
      return cn?.value.valueBlock.value || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
