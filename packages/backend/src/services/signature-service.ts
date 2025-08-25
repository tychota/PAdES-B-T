/**
 * Signature Service for PAdES-B-T signatures
 *
 * Uses high-level PKI.js classes for building CMS signed attributes according to
 * ETSI EN 319 142-1 (PAdES) requirements with proper type safety.
 */

import * as asn1js from "asn1js";
import { Attribute, Certificate } from "pkijs";

import { sha256 } from "./crypto-utils";

import type { LogEntry } from "@pades-poc/shared";

export interface SignedAttributesParams {
  messageDigest: Buffer;
  signerCertPem: string;
}

export interface SignedAttributesResult {
  signedAttrsDer: Buffer;
  toBeSignedHash: Buffer;
}

/**
 * Converts PEM certificate to DER format
 */
function pemToDer(pem: string): Buffer {
  const b64Body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(b64Body, "base64");
}

/**
 * Service for building PAdES-compliant signed attributes
 */
export class SignatureService {
  /**
   * Build signed attributes according to PAdES requirements using PKI.js
   *
   * @param params - Parameters for building signed attributes
   * @param logs - Optional log array for debugging
   * @returns Signed attributes DER and hash to be signed
   */
  buildSignedAttributes(params: SignedAttributesParams, logs?: LogEntry[]): SignedAttributesResult {
    const { messageDigest, signerCertPem } = params;

    try {
      // Parse certificate using PKI.js
      const certDer = pemToDer(signerCertPem);
      const certAsn1 = asn1js.fromBER(certDer);
      if (certAsn1.offset === -1) {
        throw new Error("Invalid certificate DER encoding");
      }

      const cert = new Certificate({ schema: certAsn1.result });
      const certHash = sha256(certDer);

      // Build attributes using PKI.js Attribute class
      const attributes: Attribute[] = [];

      // 1. contentType (mandatory) - id-data
      attributes.push(
        new Attribute({
          type: "1.2.840.113549.1.9.3", // contentType OID
          values: [
            new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" }), // id-data
          ],
        }),
      );

      // 2. messageDigest (mandatory)
      attributes.push(
        new Attribute({
          type: "1.2.840.113549.1.9.4", // messageDigest OID
          values: [
            new asn1js.OctetString({
              valueHex: messageDigest.buffer.slice(
                messageDigest.byteOffset,
                messageDigest.byteOffset + messageDigest.byteLength,
              ) as ArrayBuffer,
            }),
          ],
        }),
      );

      // 3. signingCertificateV2 (recommended for PAdES)
      const hashAlgId = new asn1js.Sequence({
        value: [
          new asn1js.ObjectIdentifier({ value: "2.16.840.1.101.3.4.2.1" }), // SHA-256
          new asn1js.Null(),
        ],
      });

      const essCertIDv2 = new asn1js.Sequence({
        value: [
          hashAlgId,
          new asn1js.OctetString({
            valueHex: certHash.buffer.slice(
              certHash.byteOffset,
              certHash.byteOffset + certHash.byteLength,
            ) as ArrayBuffer,
          }),
          // IssuerSerial omitted for simplicity
        ],
      });

      const signingCertV2 = new asn1js.Sequence({
        value: [
          new asn1js.Sequence({ value: [essCertIDv2] }), // SEQUENCE OF ESSCertIDv2
        ],
      });

      attributes.push(
        new Attribute({
          type: "1.2.840.113549.1.9.16.2.47", // signingCertificateV2 OID
          values: [signingCertV2],
        }),
      );

      // Sort attributes by DER encoding (required by CMS)
      const sortedAttributes = attributes
        .map((attr) => ({ attr, der: Buffer.from(attr.toSchema().toBER(false)) }))
        .sort((a, b) => Buffer.compare(a.der, b.der))
        .map((item) => item.attr);

      // Create SET OF Attribute for hashing
      const attributesSet = new asn1js.Set({
        value: sortedAttributes.map((attr) => attr.toSchema()),
      });
      const signedAttrsDer = Buffer.from(attributesSet.toBER(false));

      // Calculate hash of DER-encoded signed attributes (this is what gets signed)
      const toBeSignedHash = sha256(signedAttrsDer);

      if (logs) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: "debug",
          source: "backend",
          message: "Built signed attributes for PAdES signature",
          context: {
            attributeCount: sortedAttributes.length,
            derSize: signedAttrsDer.length,
            certSubject: this.extractCN(cert),
          },
        });
      }

      return {
        signedAttrsDer,
        toBeSignedHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to build signed attributes: ${errorMessage}`);
    }
  }

  private extractCN(cert: Certificate): string {
    try {
      const cnAttr = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3");
      if (cnAttr?.value?.valueBlock?.value) {
        return cnAttr.value.valueBlock.value;
      }
      return "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
