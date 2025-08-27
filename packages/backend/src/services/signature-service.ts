/**
 * Signature Service for PAdES-B-T signatures
 *
 * Builds CMS signed attributes with PKI.js, minimizing direct ASN.1 handling.
 * - Lets PKI.js create the [0] IMPLICIT "signed attributes" wrapper used for signing
 * - Lets the DER encoder sort the SET automatically (no manual sorting)
 * - Still uses small asn1js bits for OIDs/OctetString and SigningCertificateV2 payload
 */

import * as asn1js from "asn1js"; // Retained: required for ESSCertIDv2, attribute values, and Set
import { Attribute, Certificate, SignedAndUnsignedAttributes } from "pkijs";

import { sha256 } from "./crypto-utils";

import type { LogEntry } from "@pades-poc/shared";

export interface SignedAttributesParams {
  /** Hash of the detached content (e.g., PDF byte-range) */
  messageDigest: Buffer;
  /** Signer's certificate in PEM */
  signerCertPem: string;
}

export interface SignedAttributesResult {
  /**
   * DER of the inner SET OF Attribute (used later to set SignerInfo.signedAttrs).
   * Note: This is *not* the [0] IMPLICIT wrapper.
   */
  signedAttrsDer: Buffer;
  /**
   * Hash over the exact bytes that must be signed (DER of the [0] IMPLICIT signedAttrs).
   * This is what a remote signer should actually sign.
   */
  toBeSignedHash: Buffer;
}

/** PEM → DER */
function pemToDer(pem: string): Buffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(b64, "base64");
}

function bufToArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/**
 * Build the ESS SigningCertificateV2 value:
 *
 * SigningCertificateV2 ::= SEQUENCE {
 *   certs        SEQUENCE OF ESSCertIDv2,
 *   policies     SEQUENCE OF PolicyInformation OPTIONAL
 * }
 *
 * ESSCertIDv2 ::= SEQUENCE {
 *   hashAlgorithm   AlgorithmIdentifier DEFAULT {sha256},
 *   certHash        OCTET STRING,
 *   issuerSerial    IssuerSerial OPTIONAL
 * }
 *
 * Here we include: SHA-256 + certHash; omit issuerSerial/policies for brevity.
 */
function buildSigningCertificateV2Value(certHash: Buffer): asn1js.Sequence {
  // ASN.1js is required for custom ESSCertIDv2/SigningCertificateV2 structure (not natively supported by PKI.js)
  const hashAlgId = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: "2.16.840.1.101.3.4.2.1" }), // id-sha256
      new asn1js.Null(),
    ],
  });

  const essCertIDv2 = new asn1js.Sequence({
    value: [
      hashAlgId,
      new asn1js.OctetString({ valueHex: bufToArrayBuffer(certHash) }),
      // issuerSerial omitted
    ],
  });

  // SigningCertificateV2.certs = SEQUENCE OF ESSCertIDv2
  const certs = new asn1js.Sequence({ value: [essCertIDv2] });

  // SigningCertificateV2 ::= SEQUENCE { certs, [policies omitted] }
  return new asn1js.Sequence({ value: [certs] });
}

/**
 * Service for building PAdES-compliant signed attributes with minimal asn1js
 */
export class SignatureService {
  buildSignedAttributes(params: SignedAttributesParams, logs?: LogEntry[]): SignedAttributesResult {
    const { messageDigest, signerCertPem } = params;

    // Parse certificate
    const certDer = pemToDer(signerCertPem);
    const certAsn1 = asn1js.fromBER(certDer);
    if (certAsn1.offset === -1) {
      throw new Error("Failed to build signed attributes: Invalid certificate DER encoding");
    }
    const cert = new Certificate({ schema: certAsn1.result });

    // Hash the certificate for ESSCertIDv2
    const certHash = sha256(certDer);

    // === Build individual attributes ===
    const attrContentType = new Attribute({
      type: "1.2.840.113549.1.9.3",
      values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })],
    });

    const attrMessageDigest = new Attribute({
      type: "1.2.840.113549.1.9.4",
      values: [new asn1js.OctetString({ valueHex: bufToArrayBuffer(messageDigest) })],
    });

    const signingCertV2Value = buildSigningCertificateV2Value(certHash);
    const attrSigningCertV2 = new Attribute({
      type: "1.2.840.113549.1.9.16.2.47",
      values: [signingCertV2Value],
    });

    // Canonical DER sorting for SET OF attributes (CMS/DER requirement)
    // Sort by the DER encodings of each attribute (lexicographic).
    const attributesUnsorted: Attribute[] = [attrContentType, attrMessageDigest, attrSigningCertV2];
    const attributes = attributesUnsorted
      .map((a) => ({ a, der: Buffer.from(a.toSchema().toBER(false)) }))
      .sort((x, y) => Buffer.compare(x.der, y.der))
      .map(({ a }) => a);

    // === Let PKI.js produce [0] IMPLICIT wrapper for to-be-signed bytes if needed ===
    const signedAttrsWrapper = new SignedAndUnsignedAttributes({
      type: 0,
      attributes,
    });
    const toBeSignedDer = Buffer.from(signedAttrsWrapper.toSchema().toBER(false));
    const toBeSignedHash = sha256(toBeSignedDer);

    // === Inner SET OF Attribute (tag 0x31...) ===
    const innerSet = new asn1js.Set({ value: attributes.map((a) => a.toSchema()) });
    const signedAttrsDer = Buffer.from(innerSet.toBER(false));

    logs?.push({
      timestamp: new Date().toISOString(),
      level: "debug",
      source: "backend",
      message: "Built signed attributes (CMS/PAdES) with minimal ASN.1 handling",
      context: {
        attributeCount: attributes.length, // rename from attrCount → attributeCount
        derSetSize: signedAttrsDer.length,
        toBeSignedSize: toBeSignedDer.length,
        certSubjectCN: this.extractCN(cert),
      },
    });

    return { signedAttrsDer, toBeSignedHash };
  }

  private extractCN(cert: Certificate): string {
    try {
      const cn = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3");
      return cn?.value?.valueBlock?.value ?? "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
