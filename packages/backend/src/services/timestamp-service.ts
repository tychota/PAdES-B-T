/**
 * RFC 3161 Timestamp Service for PAdES-B-T (PKI.js version)
 *
 * Builds TimeStampReq with pkijs.TimeStampReq + pkijs.MessageImprint.create,
 * posts to TSA, parses pkijs.TimeStampResp, and extracts useful metadata.
 */

import { DEFAULT_CONFIG } from "@pades-poc/shared";
import * as asn1js from "asn1js"; // Retained: required for nonce (Integer), fromBER, and ASN.1js Sequence
import * as pkijs from "pkijs";

import { toHex } from "./crypto-utils";

export interface TimestampRequest {
  /** Data to timestamp (per PAdES: the CMS signature value bytes) */
  data: Buffer;
  /** Hash algorithm (either OID like '2.16.840.1.101.3.4.2.1' or name like 'SHA-256'); default SHA-256 */
  hashAlgorithmOid?: string;
  /** TSA URL (defaults to DEFAULT_CONFIG.TIMESTAMP_URL) */
  tsaUrl?: string;
  /** Ask TSA to embed its certs in the SignedData */
  requestCerts?: boolean;
  /** Optional nonce for replay protection */
  nonce?: Buffer;
}

export interface TimestampResponse {
  /** RFC 3161 TimeStampToken as ASN.1 Sequence (ContentInfo) for direct embedding in CMS unsignedAttrs */
  timestampToken: asn1js.Sequence;
  /** ISO string of genTime from TSTInfo, if present (fallback: now) */
  timestampTime: string;
  /** TSA URL used */
  tsaUrl: string;
  /** Human-readable accuracy, if present */
  accuracy?: string;
  /** Hex serial number from TSTInfo, if present */
  serialNumber?: string;
}

/** Map OIDs and names to PKI.js hash algorithm names accepted by MessageImprint.create */
const OID_OR_NAME_TO_HASH: Record<string, "SHA-256" | "SHA-384" | "SHA-512"> = {
  // OIDs
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  // Names (allow callers to pass names directly)
  "SHA-256": "SHA-256",
  "SHA-384": "SHA-384",
  "SHA-512": "SHA-512",
};

/** Normalize input to a PKI.js hash name */
function normalizeHash(hash?: string): "SHA-256" | "SHA-384" | "SHA-512" {
  if (!hash) return "SHA-256";
  const mapped = OID_OR_NAME_TO_HASH[hash];
  if (!mapped) return "SHA-256";
  return mapped;
}

/**
 * Request a timestamp from a Time Stamp Authority using PKI.js types
 *
 * Implementation notes:
 * - MessageImprint is built via pkijs.MessageImprint.create(hashName, messageBytes),
 *   which handles hashing internally. :contentReference[oaicite:1]{index=1}
 * - The response is parsed with pkijs.TimeStampResp; we then extract the
 *   CMS ContentInfo and decode TSTInfo to read genTime/serial/accuracy. :contentReference[oaicite:2]{index=2}
 */
export async function requestTimestamp(params: TimestampRequest): Promise<TimestampResponse> {
  const {
    data,
    hashAlgorithmOid,
    tsaUrl = DEFAULT_CONFIG.TIMESTAMP_URL,
    requestCerts = true,
    nonce,
  } = params;

  const hashName = normalizeHash(hashAlgorithmOid);
  const messageBytes = new Uint8Array(data); // Buffer -> Uint8Array (BufferSource-safe)

  // Build MessageImprint and TimeStampReq (PKI.js)
  const messageImprint = await pkijs.MessageImprint.create(hashName, messageBytes); // hashes internally
  const tspReq = new pkijs.TimeStampReq({
    version: 1,
    messageImprint,
    certReq: requestCerts,
    // ASN.1js Integer is required for nonce, as PKI.js expects ASN.1js object
    ...(nonce && {
      nonce: new asn1js.Integer({
        valueHex: messageBytes.buffer.slice(
          // re-slice the provided nonce Buffer into a clean ArrayBuffer
          new Uint8Array(nonce).byteOffset,
          new Uint8Array(nonce).byteOffset + new Uint8Array(nonce).byteLength,
        ),
      }),
    }),
  }); // Example aligns with PKI.js docs. :contentReference[oaicite:3]{index=3}

  const requestDer = Buffer.from(tspReq.toSchema().toBER());

  // POST to TSA
  const response = await fetch(tsaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/timestamp-query",
      Accept: "application/timestamp-reply",
      "Content-Length": String(requestDer.length),
    },
    body: requestDer,
  });

  if (!response.ok) {
    throw new Error(`TSA HTTP error: ${response.status} ${response.statusText}`);
  }

  const responseBuffer = Buffer.from(await response.arrayBuffer());

  // Parse TimeStampResp (PKI.js)
  const asn1 = asn1js.fromBER(responseBuffer);
  if (asn1.offset === -1) throw new Error("Invalid TimeStampResp ASN.1");

  const tspResp = new pkijs.TimeStampResp({ schema: asn1.result });

  // Accept "granted" (0) and "grantedWithMods" (1)
  const status = tspResp.status.status;
  if (status !== pkijs.PKIStatus.granted && status !== pkijs.PKIStatus.grantedWithMods) {
    throw new Error(`TSA request failed with status: ${String(status)}`);
  }

  if (!tspResp.timeStampToken) {
    throw new Error("TimeStampToken missing from TSA response");
  }

  // Extract TSTInfo for metadata
  let timestampTime = new Date().toISOString();
  let accuracy: string | undefined;
  let serialNumber: string | undefined;

  try {
    // ContentInfo -> SignedData -> encapContentInfo.eContent (OctetString) -> TSTInfo
    const tokenCI = tspResp.timeStampToken; // pkijs.ContentInfo
    const signedData = new pkijs.SignedData({ schema: tokenCI.content });
    const eContent = signedData.encapContentInfo.eContent;

    if (eContent) {
      const tstInfoAsn1 = asn1js.fromBER(eContent.valueBlock.valueHex);
      const tstInfo = new pkijs.TSTInfo({ schema: tstInfoAsn1.result }); // has genTime: Date, etc. :contentReference[oaicite:4]{index=4}

      if (tstInfo.genTime) timestampTime = tstInfo.genTime.toISOString();
      if (tstInfo.serialNumber) {
        serialNumber = toHex(Buffer.from(tstInfo.serialNumber.valueBlock.valueHex));
      }
      if (tstInfo.accuracy) {
        const secs = (tstInfo.accuracy.seconds ?? 0).toString();
        const ms = tstInfo.accuracy.millis ?? 0;
        const us = tstInfo.accuracy.micros ?? 0;
        // Provide a compact summary like "±1s 1ms 10µs" when non-zero
        const parts: string[] = [];
        if (secs !== "0") parts.push(`${secs}s`);
        if (ms) parts.push(`${ms}ms`);
        if (us) parts.push(`${us}µs`);
        if (parts.length) accuracy = `±${parts.join(" ")}`;
      }
    }
  } catch (err) {
    // Non-fatal: keep defaults

    console.warn("Failed to parse TSA response metadata:", err);
  }

  // Return ContentInfo as ASN.1 Sequence so CMS layer can embed it directly
  return {
    // ASN.1js Sequence is required for direct embedding in CMS unsignedAttrs
    timestampToken: tspResp.timeStampToken.toSchema(),
    timestampTime,
    tsaUrl,
    accuracy,
    serialNumber,
  };
}

/**
 * Optional: a (non-async) placeholder for future verification logic.
 * Keeping it non-async avoids eslint's require-await complaint.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function verifyTimestamp(_timestampToken: asn1js.Sequence): boolean {
  // TODO: Implement full TSA signature verification when needed.
  // You would parse ContentInfo -> SignedData and validate with pkijs.
  // For now, this is a stub.
  return false;
}
