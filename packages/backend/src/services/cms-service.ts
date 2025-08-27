/**
 * CMS (Cryptographic Message Syntax) Service for PAdES-B-T
 *
 * Builds RFC 5652 compliant CMS SignedData structures using PKI.js high-level classes.
 * Supports PAdES-B-T with RFC 3161 timestamp tokens from TSA services.
 */

import * as asn1js from "asn1js"; // Retained: needed for fromBER and OctetString
import {
  Certificate,
  SignedData,
  SignerInfo,
  IssuerAndSerialNumber,
  Attribute,
  ContentInfo,
  AlgorithmIdentifier,
  EncapsulatedContentInfo,
  SignedAndUnsignedAttributes,
} from "pkijs";

import { requestTimestamp as fetchTimestamp } from "./timestamp-service";

import type { LogEntry } from "@pades-poc/shared";

export interface CMSAssemblyParams {
  signedAttrsDer: Buffer; // DER-encoded SET OF Attribute
  signature: Buffer; // signature bytes over DER(signedAttrs)
  signerCertPem: string; // end-entity cert (PEM)
  certificateChainPem?: string[]; // optional intermediates (no root)
  signatureAlgorithmOid?: string; // default sha256WithRSAEncryption
  withTimestamp?: boolean; // default true (B-T). false => B-B
  timestampUrl?: string; // optional TSA URL override
}

export interface CMSAssemblyResult {
  cmsDer: Buffer;
  estimatedSize: number;
  isTimestamped: boolean;
  timestampInfo?: {
    tsaUrl: string;
    timestampTime: string;
    accuracy?: string;
  };
}

/** PEM → DER */
function pemToDer(pem: string): Buffer {
  const b64Body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(b64Body, "base64");
}

/** Parse DER(SET OF Attribute) → Attribute[] using PKI.js
 * ASN.1js is required for initial DER parsing, PKI.js for Attribute construction.
 */
function parseSignedAttributes(der: Buffer): Attribute[] {
  const asn = asn1js.fromBER(der);
  if (asn.offset === -1 || !(asn.result instanceof asn1js.Set)) {
    throw new Error("Invalid signed attributes DER");
  }
  const seqs = asn.result.valueBlock.value as asn1js.Sequence[];
  return seqs.map((seq) => new Attribute({ schema: seq }));
}

/** Build SignedData + SignerInfo (optionally with unsigned timestamp attr) and return DER(ContentInfo) */
function buildCMS(
  params: Omit<CMSAssemblyParams, "withTimestamp" | "timestampUrl"> & {
    unsignedAttrs?: Attribute[];
    logs?: LogEntry[];
  },
): CMSAssemblyResult {
  const {
    signedAttrsDer,
    signature,
    signerCertPem,
    certificateChainPem = [],
    signatureAlgorithmOid = "1.2.840.113549.1.1.11", // sha256WithRSAEncryption
    unsignedAttrs,
    logs,
  } = params;

  // Parse signer certificate
  const certDer = pemToDer(signerCertPem);
  const certAsn1 = asn1js.fromBER(certDer);
  if (certAsn1.offset === -1) throw new Error("Invalid signer certificate DER");
  const signerCert = new Certificate({ schema: certAsn1.result });

  // Create SignedData
  const signedData = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1", // id-data
      // eContent absent => detached
    }),
    signerInfos: [],
    certificates: [],
  });

  // digestAlgorithms (params MUST be ABSENT for SHA2 per RFC 5754)
  signedData.digestAlgorithms = [
    new AlgorithmIdentifier({
      algorithmId: "2.16.840.1.101.3.4.2.1", // SHA-256
      // algorithmParams: (absent)
    }),
  ];

  // Certificates
  signedData.certificates = [signerCert];
  for (const pem of certificateChainPem) {
    try {
      const chainDer = pemToDer(pem);
      const chainAsn1 = asn1js.fromBER(chainDer);
      if (chainAsn1.offset !== -1) {
        signedData.certificates.push(new Certificate({ schema: chainAsn1.result }));
      }
    } catch (e) {
      logs?.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        source: "backend",
        message: `Failed to parse chain certificate: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  }

  // SignerInfo
  const signerInfo = new SignerInfo({
    version: 1,
    sid: new IssuerAndSerialNumber({
      issuer: signerCert.issuer,
      serialNumber: signerCert.serialNumber,
    }),
  });

  signerInfo.digestAlgorithm = new AlgorithmIdentifier({
    algorithmId: "2.16.840.1.101.3.4.2.1", // SHA-256
    // algorithmParams: (absent)
  });

  signerInfo.signatureAlgorithm = new AlgorithmIdentifier({
    algorithmId: signatureAlgorithmOid,
    // For rsaEncryption family, NULL params are customary/accepted
    // algorithmParams: new asn1js.Null(),
  });

  // Signed attributes ([0] IMPLICIT) via PKI.js helper
  const attributes = parseSignedAttributes(signedAttrsDer);
  signerInfo.signedAttrs = new SignedAndUnsignedAttributes({
    type: 0, // signed
    attributes,
  });

  // Signature value
  const sigBytes = new Uint8Array(signature);
  // ASN.1js OctetString is required here because PKI.js expects ASN.1js object for signature
  signerInfo.signature = new asn1js.OctetString({ valueHex: sigBytes.buffer });

  // Optional unsigned attributes (e.g., signatureTimeStampToken)
  if (unsignedAttrs?.length) {
    signerInfo.unsignedAttrs = new SignedAndUnsignedAttributes({
      type: 1, // unsigned
      attributes: unsignedAttrs,
    });
  }

  // Assemble
  signedData.signerInfos = [signerInfo];
  const contentInfo = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2", // signedData
    content: signedData.toSchema(),
  });
  const cmsDer = Buffer.from(contentInfo.toSchema().toBER(false));

  logs?.push({
    timestamp: new Date().toISOString(),
    level: "debug",
    source: "backend",
    message: "Assembled CMS SignedData with PKI.js",
    context: {
      cmsSize: cmsDer.length,
      certificateCount: signedData.certificates.length,
      hasTimestamp: !!unsignedAttrs?.length,
      signatureAlgorithm: signatureAlgorithmOid,
      signatureLevel: unsignedAttrs?.length ? "B-T" : "B-B",
    },
  });

  return {
    cmsDer,
    estimatedSize: cmsDer.length,
    isTimestamped: !!unsignedAttrs?.length,
  };
}

export class CMSService {
  /**
   * Full CMS assembly (B-B or B-T depending on withTimestamp)
   */
  async assembleCMS(params: CMSAssemblyParams, logs?: LogEntry[]): Promise<CMSAssemblyResult> {
    const {
      signedAttrsDer,
      signature,
      signerCertPem,
      certificateChainPem = [],
      signatureAlgorithmOid,
      withTimestamp = true,
      timestampUrl,
    } = params;

    let unsignedAttrs: Attribute[] | undefined;
    let timestampInfo: CMSAssemblyResult["timestampInfo"];

    if (withTimestamp) {
      try {
        const ts = await fetchTimestamp({ data: signature, tsaUrl: timestampUrl });
        const tsAttr = new Attribute({
          type: "1.2.840.113549.1.9.16.2.14", // id-aa-signatureTimeStampToken
          values: [ts.timestampToken],
        });
        unsignedAttrs = [tsAttr];
        timestampInfo = {
          tsaUrl: ts.tsaUrl,
          timestampTime: ts.timestampTime,
          accuracy: ts.accuracy,
        };
        logs?.push({
          timestamp: new Date().toISOString(),
          level: "success",
          source: "backend",
          message: `Timestamp obtained from TSA: ${ts.tsaUrl}`,
          context: { timestampTime: ts.timestampTime, accuracy: ts.accuracy },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        logs?.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          source: "backend",
          message: `Timestamp request failed, continuing without (B-B): ${msg}`,
        });
      }
    }

    const base = buildCMS({
      signedAttrsDer,
      signature,
      signerCertPem,
      certificateChainPem,
      signatureAlgorithmOid,
      unsignedAttrs,
      logs,
    });

    return { ...base, timestampInfo: base.isTimestamped ? timestampInfo : undefined };
  }

  /**
   * Synchronous CMS assembly (B-B only, no TSA)
   */
  assembleCMSBasic(
    params: Omit<CMSAssemblyParams, "withTimestamp" | "timestampUrl">,
    logs?: LogEntry[],
  ): CMSAssemblyResult {
    const {
      signedAttrsDer,
      signature,
      signerCertPem,
      certificateChainPem = [],
      signatureAlgorithmOid,
    } = params;
    return buildCMS({
      signedAttrsDer,
      signature,
      signerCertPem,
      certificateChainPem,
      signatureAlgorithmOid,
      unsignedAttrs: undefined,
      logs,
    });
  }
}
