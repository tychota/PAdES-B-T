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
  TSTInfo,
  type SignedDataVerifyResult,
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

export type SignatureLevel = "B-B" | "B-T" | "UNKNOWN";

export interface TimestampValidationResult {
  isValid: boolean;
  timestampTime?: string;
  tsaName?: string;
  accuracy?: string;
  serialNumber?: string;
  messageImprintMatches: boolean;
  tsaSignatureValid: boolean;
  reasons: string[];
}

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
  // Enhanced timestamp information
  timestampValidation?: TimestampValidationResult;
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
        signatureLevel: "UNKNOWN",
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
        signatureLevel: "UNKNOWN",
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
        signatureLevel: "UNKNOWN",
        reasons: ["Signer certificate not found in CMS"],
        logs,
      };
    }

    // 1) Certificate Chain Validation
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
        context: {
          error: e && typeof e === "object" && "message" in e ? (e as Error).message : String(e),
        },
      });
    }

    // 4) Timestamp verification (RFC 3161)
    const tsAttr = signerInfo.unsignedAttrs?.attributes.find(
      (a) => a.type === "1.2.840.113549.1.9.16.2.14", // id-aa-signatureTimeStampToken
    );

    let isTimestamped = false;
    let timestampValidation: TimestampValidationResult | undefined;
    let timestampTime: string | undefined;

    if (tsAttr && tsAttr.values[0]) {
      isTimestamped = true;
      const signatureBytes = new Uint8Array(signerInfo.signature.valueBlock.valueHexView);
      const tsValue = tsAttr.values[0] as unknown;
      let tokenSchema: asn1js.BaseBlock | undefined;

      if (tsValue instanceof asn1js.OctetString) {
        // Parse the DER-encoded content inside the OctetString
        const parsed = asn1js.fromBER(tsValue.valueBlock.valueHex);
        if (parsed.offset !== -1) {
          tokenSchema = parsed.result;
        }
      } else if (tsValue instanceof asn1js.Sequence) {
        tokenSchema = tsValue;
      } else if (tsValue instanceof ArrayBuffer || ArrayBuffer.isView(tsValue)) {
        // If it's a buffer, parse it
        const parsed = asn1js.fromBER(tsValue as ArrayBuffer);
        if (parsed.offset !== -1) {
          tokenSchema = parsed.result;
        }
      }

      if (tokenSchema) {
        timestampValidation = await this.verifyTimestampToken(tokenSchema, signatureBytes, logs);
        if (!timestampValidation.isValid) {
          reasons.push(...timestampValidation.reasons);
        }
        timestampTime = timestampValidation.timestampTime;
      } else {
        reasons.push("Timestamp attribute value is not a valid ASN.1 structure");
        timestampValidation = {
          isValid: false,
          timestampTime: undefined,
          tsaName: undefined,
          accuracy: undefined,
          serialNumber: undefined,
          messageImprintMatches: false,
          tsaSignatureValid: false,
          reasons: ["Timestamp attribute value is not a valid ASN.1 structure"],
        };
      }
    }

    // 5) Minimal PAdES-B-B compliance: detached CMS with contentType + messageDigest
    const hasContentType = Boolean(
      signerInfo.signedAttrs?.attributes.find(
        (a) => a.type === "1.2.840.113549.1.9.3", // contentType
      ),
    );

    const timestampValid = !isTimestamped || (timestampValidation?.isValid ?? false);
    const isPAdESCompliant =
      signatureVerified &&
      hasContentType &&
      digestMatches &&
      (certificateChain?.isValid ?? false) &&
      timestampValid;

    const signatureLevel: SignatureLevel = signatureVerified
      ? isTimestamped
        ? "B-T"
        : "B-B"
      : "UNKNOWN";

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
        timestampValid,
        signerCN,
      },
    });

    return {
      isCryptographicallyValid: signatureVerified && digestMatches,
      isPAdESCompliant,
      isTimestamped,
      signatureLevel,
      signerCN,
      timestampTime,
      reasons,
      certificateChain,
      timestampValidation,
      logs,
    };
  }

  /**
   * Verify RFC 3161 timestamp token
   */
  private async verifyTimestampToken(
    tokenValue: asn1js.BaseBlock,
    signatureBytes: Uint8Array,
    logs: LogEntry[],
  ): Promise<TimestampValidationResult> {
    const reasons: string[] = [];
    let isValid = true;
    let timestampTime: string | undefined;
    let tsaName: string | undefined;
    let accuracy: string | undefined;
    let serialNumber: string | undefined;
    let messageImprintMatches = false;
    let tsaSignatureValid = false;

    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      source: "backend",
      message: "Starting timestamp token verification",
    });

    try {
      // Parse TimeStampToken (ContentInfo containing SignedData)
      let tokenSchema: asn1js.BaseBlock;
      if (tokenValue instanceof asn1js.Sequence) {
        tokenSchema = tokenValue;
      } else if (
        typeof tokenValue === "object" &&
        tokenValue !== null &&
        "toSchema" in tokenValue &&
        typeof (tokenValue as { toSchema?: unknown }).toSchema === "function"
      ) {
        tokenSchema = (tokenValue as { toSchema: () => asn1js.BaseBlock }).toSchema();
      } else {
        throw new Error("Timestamp token value is not a valid ASN.1 structure");
      }
      const timestampToken = new ContentInfo({ schema: tokenSchema });
      const timestampSignedData = new SignedData({ schema: timestampToken.content });

      // Extract TSTInfo from encapsulated content
      const encapContent = timestampSignedData.encapContentInfo.eContent;
      if (!encapContent) {
        reasons.push("Timestamp token missing TSTInfo");
        return { isValid: false, messageImprintMatches: false, tsaSignatureValid: false, reasons };
      }

      const tstInfoAsn1 = asn1js.fromBER(encapContent.valueBlock.valueHex);
      if (tstInfoAsn1.offset === -1) {
        reasons.push("Invalid TSTInfo structure");
        return { isValid: false, messageImprintMatches: false, tsaSignatureValid: false, reasons };
      }

      const tstInfo = new TSTInfo({ schema: tstInfoAsn1.result });

      // Extract timestamp information
      if (tstInfo.genTime) {
        timestampTime = tstInfo.genTime.toISOString();
      }

      if (tstInfo.serialNumber) {
        serialNumber = Buffer.from(tstInfo.serialNumber.valueBlock.valueHex).toString("hex");
      }

      if (tstInfo.accuracy) {
        const secs = (tstInfo.accuracy.seconds ?? 0).toString();
        const ms = tstInfo.accuracy.millis ?? 0;
        const us = tstInfo.accuracy.micros ?? 0;
        const parts: string[] = [];
        if (secs !== "0") parts.push(`${secs}s`);
        if (ms) parts.push(`${ms}ms`);
        if (us) parts.push(`${us}µs`);
        if (parts.length) accuracy = `±${parts.join(" ")}`;
      }

      // Verify messageImprint matches the signature
      if (tstInfo.messageImprint) {
        const messageImprint = tstInfo.messageImprint;
        const hashAlgOid = messageImprint.hashAlgorithm.algorithmId;
        const expectedHash = new Uint8Array(messageImprint.hashedMessage.valueBlock.valueHexView);

        // Hash the signature bytes with the algorithm specified in messageImprint
        const hashAlgorithm = oidToDigestName(hashAlgOid) ?? "SHA-256";
        const computedHashAB = await nodeWebcrypto.subtle.digest(hashAlgorithm, signatureBytes);
        const computedHash = new Uint8Array(computedHashAB);

        messageImprintMatches = bytesEq(expectedHash, computedHash);

        if (!messageImprintMatches) {
          reasons.push("Timestamp messageImprint does not match signature");
          isValid = false;
        }
      } else {
        reasons.push("Timestamp token missing messageImprint");
        isValid = false;
      }

      // Verify TSA signature on the timestamp using PKI.js high-level API
      // NOTE: `SignedData.verify` is overloaded and can return boolean or a detailed result object.
      // We handle both in a type-safe way.
      try {
        const verifyResult = (await timestampSignedData.verify({
          signer: 0,
          checkChain: false,
        })) as boolean | SignedDataVerifyResult;

        if (typeof verifyResult === "boolean") {
          tsaSignatureValid = verifyResult;
        } else {
          tsaSignatureValid = !!verifyResult.signatureVerified;
          // Prefer TSA cert from verify result (if present) to extract CN
          if (
            verifyResult.signerCertificate &&
            verifyResult.signerCertificate instanceof Certificate
          ) {
            tsaName = this.getSubjectCN(verifyResult.signerCertificate);
          }
        }

        if (!tsaSignatureValid) {
          reasons.push("TSA signature verification failed");
          isValid = false;
        } else {
          // If we didn't get a cert from the result (e.g., boolean path), try to infer it like before
          if (!tsaName) {
            const tsaSignerInfo = timestampSignedData.signerInfos[0];
            const tsaSignerCert = this.findSignerCertificate(timestampSignedData, tsaSignerInfo);
            if (tsaSignerCert) tsaName = this.getSubjectCN(tsaSignerCert);
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Unknown error";
        reasons.push(`TSA signature verification error: ${errorMsg}`);
        isValid = false;
      }

      logs.push({
        timestamp: new Date().toISOString(),
        level: isValid ? "success" : "warning",
        source: "backend",
        message: `Timestamp verification completed: ${isValid ? "VALID" : "INVALID"}`,
        context: {
          timestampTime,
          tsaName,
          messageImprintMatches,
          tsaSignatureValid,
          serialNumber,
        },
      });
    } catch (e) {
      const errorMsg =
        e && typeof e === "object" && "message" in e ? (e as Error).message : String(e);
      reasons.push(`Timestamp token parsing failed: ${errorMsg}`);
      isValid = false;

      logs.push({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "backend",
        message: `Timestamp verification error: ${errorMsg}`,
      });
    }

    return {
      isValid,
      timestampTime,
      tsaName,
      accuracy,
      serialNumber,
      messageImprintMatches,
      tsaSignatureValid,
      reasons,
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
