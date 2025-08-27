/**
 * PDF Signature Verification Service for PAdES-B-T
 *
 * Verifies CMS signatures in PDFs (PAdES) using PKI.js for parsing,
 * Node WebCrypto for signature verification, and comprehensive certificate chain validation.
 */

// ── external / node
import { webcrypto as nodeWebcrypto } from "crypto";

import * as asn1js from "asn1js";
import {
  setEngine,
  CryptoEngine,
  ContentInfo,
  SignedData,
  Certificate,
  IssuerAndSerialNumber,
} from "pkijs";

// ── internal services
import { CertificateChainValidator } from "./certificate-chain-validator";
import { PdfByteParser } from "./pdf/byte-parser";

import type { LogEntry } from "@pades-poc/shared";

// PKI.js needs a WebCrypto engine in Node
setEngine(
  "nodeEngine",
  // Cast to the DOM Crypto type for TypeScript; runtime is nodeWebcrypto
  nodeWebcrypto as unknown as Crypto,
  new CryptoEngine({
    name: "nodeEngine",
    crypto: nodeWebcrypto as unknown as Crypto,
    subtle: nodeWebcrypto.subtle as SubtleCrypto,
  }),
);

export type SignatureLevel = "B-B" | "B-T" | "Unknown";

export interface VerificationResult {
  isCryptographicallyValid: boolean;
  isPAdESCompliant: boolean;
  isTimestamped: boolean;
  signatureLevel: SignatureLevel;
  signerCN?: string;
  signingTime?: string;
  timestampTime?: string;
  reasons: string[];
  // Enhanced certificate information
  certificateChain?: {
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
  };
}

export interface VerificationParams {
  pdfBase64: string;
}

export interface VerificationServiceResult extends VerificationResult {
  logs: LogEntry[];
}

/**
 * Service for verifying PAdES-B-T signatures using PKI.js with comprehensive certificate validation
 */
export class VerificationService {
  private parser: PdfByteParser;
  private chainValidator: CertificateChainValidator;

  constructor(fieldName = "Signature1") {
    this.parser = new PdfByteParser(fieldName);
    this.chainValidator = new CertificateChainValidator({
      checkValidityPeriod: true,
      verifySignatures: true,
      checkKeyUsage: true,
      maxChainLength: 10,
    });
  }

  /**
   * Verify a signed PDF document.
   * Accepts either raw bytes (Buffer/Uint8Array/ArrayBuffer) or `{ pdfBase64 }`.
   */
  public async verify(
    input: ArrayBuffer | Uint8Array | Buffer | { pdfBase64: string },
  ): Promise<VerificationServiceResult> {
    const logs: LogEntry[] = [];
    const pdfBytes =
      input instanceof Uint8Array
        ? input
        : input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : Buffer.isBuffer(input)
            ? new Uint8Array(input)
            : new Uint8Array(Buffer.from(input.pdfBase64, "base64"));

    const reasons: string[] = [];

    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      source: "backend",
      message: "Starting PDF signature verification",
      context: { pdfSize: pdfBytes.length },
    });

    const { signedBytes, cms } = this.extractPdfSignature(pdfBytes);
    if (!cms) {
      return {
        isCryptographicallyValid: false,
        isPAdESCompliant: false,
        isTimestamped: false,
        signatureLevel: "Unknown",
        reasons: ["No CMS signature found"],
        logs,
      };
    }

    // Parse CMS
    const cmsBuf = cms.buffer.slice(cms.byteOffset, cms.byteOffset + cms.byteLength);
    const asn1 = asn1js.fromBER(cmsBuf as ArrayBuffer);
    if (asn1.offset === -1) {
      return {
        isCryptographicallyValid: false,
        isPAdESCompliant: false,
        isTimestamped: false,
        signatureLevel: "Unknown",
        reasons: ["CMS parsing failed"],
        logs,
      };
    }

    const contentInfo = new ContentInfo({ schema: asn1.result });
    const signedData = new SignedData({ schema: contentInfo.content });
    const signerInfo = signedData.signerInfos[0];

    // Find signer certificate
    const signerCert = this.findSignerCertificate(signedData, signerInfo);
    if (!signerCert) {
      return {
        isCryptographicallyValid: false,
        isPAdESCompliant: false,
        isTimestamped: false,
        signatureLevel: "Unknown",
        reasons: ["Signer certificate not found in CMS"],
        logs,
      };
    }

    // 1) Certificate Chain Validation (NEW)
    let certificateChain: VerificationResult["certificateChain"];
    const certificates = Array.isArray(signedData.certificates)
      ? signedData.certificates.filter((cert): cert is Certificate => cert instanceof Certificate)
      : [];

    if (certificates.length > 0) {
      const chainResult = await this.chainValidator.validateChain(certificates, signerCert, logs);
      const signerCertInfo = chainResult.certificates[0]; // First cert is always the signer

      certificateChain = {
        isValid: chainResult.isValid,
        chainLength: chainResult.chainLength,
        trustedChain: chainResult.trustedChain,
        signerCertificate: signerCertInfo
          ? {
              subject: signerCertInfo.subject,
              issuer: signerCertInfo.issuer,
              validFrom: signerCertInfo.validFrom.toISOString(),
              validTo: signerCertInfo.validTo.toISOString(),
              isValidNow: signerCertInfo.isValidNow,
              keyUsage: signerCertInfo.keyUsage,
            }
          : undefined,
        reasons: chainResult.reasons,
      };

      // Add chain validation failures to main reasons
      if (!chainResult.isValid) {
        reasons.push(...chainResult.reasons);
      }
    }

    // 2) ByteRange digest vs messageDigest (detect content modification)
    const digestOid = signerInfo.digestAlgorithm.algorithmId;
    const digestName = oidToDigestName(digestOid) ?? "SHA-256";

    const mdAttr = signerInfo.signedAttrs?.attributes.find(
      (a) => a.type === "1.2.840.113549.1.9.4", // messageDigest
    );

    let digestMatches = true;
    if (mdAttr && mdAttr.values[0] instanceof asn1js.OctetString) {
      const expected = new Uint8Array(mdAttr.values[0].valueBlock.valueHexView);
      const dataAB = signedBytes.buffer.slice(
        signedBytes.byteOffset,
        signedBytes.byteOffset + signedBytes.byteLength,
      );
      const computedAB = await nodeWebcrypto.subtle.digest(digestName, dataAB as ArrayBuffer);
      const computed = new Uint8Array(computedAB);
      if (!bytesEq(expected, computed)) {
        reasons.push("PDF content has been modified");
        digestMatches = false;
      }
    }

    // 3) Signature verification (manual, deterministic)
    let signatureVerified = false;
    try {
      if (!signerInfo.signedAttrs) throw new Error("Missing signed attributes");
      // Rebuild DER(SET OF Attribute)
      const attrsDer = new asn1js.Set({
        value: signerInfo.signedAttrs.attributes.map((a) => a.toSchema()),
      }).toBER(false);
      const attrsAB = attrsDer ?? new ArrayBuffer(0);
      // Extract raw signature bytes
      const sigBytes = new Uint8Array(signerInfo.signature.valueBlock.valueHexView);
      // Get WebCrypto public key
      const publicKey = await signerCert.getPublicKey({
        algorithm: {
          algorithm: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
          usages: ["verify"],
        },
      });
      signatureVerified = await nodeWebcrypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        publicKey,
        sigBytes,
        attrsAB,
      );
    } catch (e) {
      reasons.push(`Signature verification error`);
      logs.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        source: "backend",
        message: `Manual signature verification failed`,
        context: { error: e instanceof Error ? e.message : String(e) },
      });
    }

    // 4) Timestamp presence (B-T detection). Full RFC3161 validation later.
    const tsAttr = signerInfo.unsignedAttrs?.attributes.find(
      (a) => a.type === "1.2.840.113549.1.9.16.2.14", // id-aa-signatureTimeStampToken
    );
    const isTimestamped = Boolean(tsAttr);

    // 5) Minimal PAdES-B-B compliance: detached CMS with contentType + messageDigest
    const hasContentType = Boolean(
      signerInfo.signedAttrs?.attributes.find(
        (a) => a.type === "1.2.840.113549.1.9.3", // contentType
      ),
    );
    const isPAdESCompliant =
      signatureVerified && hasContentType && digestMatches && (certificateChain?.isValid ?? false);

    const signatureLevel: SignatureLevel = signatureVerified
      ? isTimestamped
        ? "B-T"
        : "B-B"
      : "Unknown";

    const signerCN = this.getSubjectCN(signerCert);

    logs.push({
      timestamp: new Date().toISOString(),
      level: isPAdESCompliant ? "success" : "warning",
      source: "backend",
      message: `PDF signature verification completed: ${isPAdESCompliant ? "VALID" : "INVALID"}`,
      context: {
        signatureLevel,
        signatureVerified,
        digestMatches,
        chainValid: certificateChain?.isValid ?? false,
        signerCN,
      },
    });

    return {
      isCryptographicallyValid: signatureVerified && digestMatches,
      isPAdESCompliant,
      isTimestamped,
      signatureLevel,
      signerCN,
      reasons,
      certificateChain,
      logs,
    };
  }

  /**
   * Extract ByteRange + CMS and rebuild the "signed bytes" (outside /Contents).
   */
  private extractPdfSignature(pdf: Uint8Array): {
    signedBytes: Uint8Array;
    cms: Uint8Array | null;
  } {
    const text = Buffer.from(pdf).toString("latin1");
    const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text);
    if (!brMatch) return { signedBytes: new Uint8Array(), cms: null };
    const [a, b, c, d] = brMatch.slice(1, 5).map((n) => parseInt(n, 10));

    const part1 = pdf.subarray(a, a + b);
    const part2 = pdf.subarray(c, c + d);
    const signedBytes = new Uint8Array(part1.length + part2.length);
    signedBytes.set(part1, 0);
    signedBytes.set(part2, part1.length);

    // /Contents <...> (hex). (Covers the typical test fixtures.)
    const contentsAfter = text.slice(brMatch.index);
    const cmsMatch = /\/Contents\s*<([0-9A-Fa-f\s]+)>/.exec(contentsAfter);
    if (!cmsMatch) return { signedBytes, cms: null };
    const hex = cmsMatch[1].replace(/\s+/g, "");
    const cms = Uint8Array.from(hex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
    return { signedBytes, cms };
  }

  /**
   * Try to find the signer certificate matching SignerIdentifier.
   * Fallback to first certificate if no exact match.
   */
  private findSignerCertificate(
    sd: SignedData,
    si: (typeof SignedData.prototype.signerInfos)[number],
  ): Certificate | undefined {
    if (!Array.isArray(sd.certificates) || sd.certificates.length === 0) return undefined;
    if (si.sid instanceof IssuerAndSerialNumber) {
      const serialHex = Buffer.from(si.sid.serialNumber.valueBlock.valueHex).toString("hex");
      for (const c of sd.certificates) {
        if (!(c instanceof Certificate)) continue;
        const certSerialHex = Buffer.from(c.serialNumber.valueBlock.valueHex).toString("hex");
        if (serialHex === certSerialHex) return c;
      }
    }
    // fallback
    const first = sd.certificates[0];
    return first instanceof Certificate ? first : undefined;
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

function oidToDigestName(oid: string): "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512" | undefined {
  switch (oid) {
    case "1.3.14.3.2.26":
      return "SHA-1";
    case "2.16.840.1.101.3.4.2.1":
      return "SHA-256";
    case "2.16.840.1.101.3.4.2.2":
      return "SHA-384";
    case "2.16.840.1.101.3.4.2.3":
      return "SHA-512";
    default:
      return undefined;
  }
}

function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
