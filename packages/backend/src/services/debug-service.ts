import * as asn1js from "asn1js";
import { ContentInfo, SignedData, Certificate } from "pkijs";

/** Dump all "n 0 obj ... endobj" blocks. Works for PDFs saved with useObjectStreams:false */
export function dumpPdfObjects(params: {
  pdfBase64: string;
  onlySignatureObjects?: boolean;
  collapseStreams?: boolean;
}): { objectsText: string; sigObjNos: number[] } {
  const pdf = Buffer.from(params.pdfBase64, "base64");
  const text = pdf.toString("latin1");

  const objRegex = /(\d+)\s+(\d+)\s+obj/g;
  const endRegex = /endobj/g;

  let match: RegExpExecArray | null;
  const chunks: string[] = [];
  const sigNos: number[] = [];

  while ((match = objRegex.exec(text)) !== null) {
    const objNo = Number(match[1]);
    const start = match.index;
    endRegex.lastIndex = start;
    const endMatch = endRegex.exec(text);
    if (!endMatch) break;
    const end = endMatch.index + "endobj".length;

    let chunk = text.slice(start, end);

    // detect /Type /Sig
    const isSig = /\/Type\s*\/Sig/.test(chunk);
    if (params.onlySignatureObjects && !isSig) continue;
    if (isSig) sigNos.push(objNo);

    if (params.collapseStreams) {
      chunk = chunk.replace(
        /stream[\s\S]*?endstream/g,
        "stream\n%% [stream content omitted]\nendstream",
      );
    }

    chunks.push(chunk.trim());
    objRegex.lastIndex = end;
  }

  const objectsText = chunks.join("\n\n");
  return { objectsText, sigObjNos: sigNos };
}

/** Extract CMS from /Contents <...> from a PDF, or accept direct cmsDerBase64 */
export function extractCmsDer(pdfBase64?: string, cmsDerBase64?: string): Buffer {
  if (cmsDerBase64) return Buffer.from(cmsDerBase64, "base64");
  if (!pdfBase64) throw new Error("Either pdfBase64 or cmsDerBase64 is required");

  const pdf = Buffer.from(pdfBase64, "base64");
  const s = pdf.toString("latin1");
  const m = /\/Contents\s*<([0-9A-Fa-f\s]+)>/.exec(s);
  if (!m) throw new Error("No /Contents hex string found in PDF");
  const hex = m[1].replace(/\s+/g, "");
  return Buffer.from(hex, "hex");
}

/** Basic CMS parser summary using PKI.js */
export function parseCmsSummary(cmsDer: Buffer) {
  const asn1 = asn1js.fromBER(cmsDer);
  if (asn1.offset === -1) throw new Error("Invalid CMS DER");
  const ci = new ContentInfo({ schema: asn1.result });
  const sd = new SignedData({ schema: ci.content });

  const digestAlgorithms = sd.digestAlgorithms.map((a) => a.algorithmId);
  const eContentType = sd.encapContentInfo.eContentType;
  const certificateCount = Array.isArray(sd.certificates) ? sd.certificates.length : 0;

  // signer subject if available
  let signerSubject: string | undefined;
  let signedAttributeOids: string[] = [];
  let hasTimestamp = false;

  if (sd.signerInfos.length > 0) {
    const si = sd.signerInfos[0];
    if (Array.isArray(sd.certificates)) {
      const maybeCert = sd.certificates.find((c): c is Certificate => c instanceof Certificate);
      if (maybeCert) {
        const cn = maybeCert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3");
        const cnValue = cn?.value.valueBlock.value;
        signerSubject = typeof cnValue === "string" ? cnValue : undefined;
      }
    }
    if (si.signedAttrs) {
      signedAttributeOids = si.signedAttrs.attributes.map((a) => a.type);
    }
    if (si.unsignedAttrs) {
      hasTimestamp = !!si.unsignedAttrs.attributes.find(
        (a) => a.type === "1.2.840.113549.1.9.16.2.14",
      );
    }
  }

  return {
    summary: {
      signedDataVersion: sd.version,
      digestAlgorithms,
      eContentType,
      certificateCount,
      signerSubject,
      hasTimestamp,
      signedAttributeOids,
    },
  };
}
