import type { ByteRange } from "@pades-poc/shared";

export type RangePos = { start: number; end: number };

export interface PlaceholderPositions {
  byteRange: ByteRange;
  byteRangeArea: RangePos;
  contentsArea: RangePos; // inside <...> hex (without angle brackets)
}

/**
 * Low-level byte parser for PDFs:
 * - Locates the signature dictionary for a field by name (/T literal or hex)
 * - Extracts precise byte spans for /ByteRange [ ... ] and /Contents < ... >
 *
 * Notes:
 * - Pure byte operations (no latin1, no regex)
 * - Works with non-object-stream PDFs (as produced by pdf-lib with useObjectStreams:false)
 * - Falls back to "any dict with /ByteRange + /Contents" if /T lookup fails
 */
export class PdfByteParser {
  constructor(private readonly defaultFieldName: string = "Signature1") {}

  locateSignatureAreas(
    pdf: Buffer,
    fieldName: string = this.defaultFieldName,
  ): PlaceholderPositions {
    const ascii = (s: string) => Buffer.from(s, "ascii");

    // Tokens
    const T_LIT = ascii(`/T (${fieldName})`);
    const T_HEX_UP = ascii(`/T <${Buffer.from(fieldName, "ascii").toString("hex").toUpperCase()}>`);
    const T_HEX_LO = ascii(`/T <${Buffer.from(fieldName, "ascii").toString("hex").toLowerCase()}>`);
    const V_KEY = ascii("/V");
    const BR_KEY = ascii("/ByteRange");
    const CONTENTS_KEY = ascii("/Contents");
    const L_ANGLE = 0x3c; // '<'
    const R_ANGLE = 0x3e; // '>'
    const L_BRACK = 0x5b; // '['
    const R_BRACK = 0x5d; // ']'

    // ---- 1) Find the field by /T (...) or /T <hex> and read its /V ref ----
    const tCandidates = () => {
      const out: number[] = [];
      const pushAll = (needle: Buffer) => {
        let i = pdf.indexOf(needle, 0);
        while (i !== -1) {
          out.push(i);
          i = pdf.indexOf(needle, i + 1);
        }
      };
      pushAll(T_LIT);
      pushAll(T_HEX_UP);
      pushAll(T_HEX_LO);
      return out.sort((a, b) => a - b);
    };

    for (const tIdx of tCandidates()) {
      const dictStart = this.findPrevDictStartBytes(pdf, tIdx);
      if (dictStart === -1) continue;
      const dictEnd = this.findMatchingDictEndBytes(pdf, dictStart);
      if (dictEnd === -1) continue;

      // Find /V inside that field dictionary
      const vPos = this.findInRange(pdf, V_KEY, dictStart, dictEnd + 2);
      if (vPos === -1) continue;

      const ref = this.parseObjRef(pdf, vPos + V_KEY.length, dictEnd + 2);
      if (!ref) continue;

      const sig = this.findObjectDictBytes(pdf, ref.obj, ref.gen);
      if (!sig) continue;

      const found = this.extractAreasFromSigDict(
        pdf,
        sig.start,
        sig.end,
        BR_KEY,
        CONTENTS_KEY,
        L_BRACK,
        R_BRACK,
        L_ANGLE,
        R_ANGLE,
      );
      if (found) return found;
    }

    // ---- 2) Fallback: find *any* signature dictionary with /ByteRange and /Contents ----
    let probe = pdf.indexOf(BR_KEY, 0);
    while (probe !== -1) {
      const sigStart = this.findPrevDictStartBytes(pdf, probe);
      if (sigStart === -1) {
        probe = pdf.indexOf(BR_KEY, probe + BR_KEY.length);
        continue;
      }
      const sigEnd = this.findMatchingDictEndBytes(pdf, sigStart);
      if (sigEnd === -1) {
        probe = pdf.indexOf(BR_KEY, probe + BR_KEY.length);
        continue;
      }

      const found = this.extractAreasFromSigDict(
        pdf,
        sigStart,
        sigEnd,
        BR_KEY,
        CONTENTS_KEY,
        L_BRACK,
        R_BRACK,
        L_ANGLE,
        R_ANGLE,
      );
      if (found) return found;

      probe = pdf.indexOf(BR_KEY, sigEnd + 2);
    }

    throw new Error("Signature dictionary not found (no matching /T or (/ByteRange + /Contents)).");
  }

  // ------------------------------
  // Byte helpers
  // ------------------------------

  private findPrevDictStartBytes(pdf: Buffer, before: number): number {
    return pdf.lastIndexOf(Buffer.from("<<", "ascii"), before);
  }

  private findInRange(pdf: Buffer, needle: Buffer, start: number, end: number): number {
    const i = pdf.indexOf(needle, start);
    return i !== -1 && i < end ? i : -1;
  }

  private isWhite(b: number): boolean {
    // PDF whitespace (subset)
    return b === 0x20 || b === 0x0d || b === 0x0a || b === 0x09 || b === 0x0c || b === 0x00;
  }

  private skipWhite(pdf: Buffer, i: number, end: number): number {
    while (i < end && this.isWhite(pdf[i])) i++;
    return i;
  }

  private parseUInt(pdf: Buffer, i: number, end: number): { value: number; next: number } | null {
    let j = i,
      v = 0,
      any = false;
    while (j < end && pdf[j] >= 0x30 && pdf[j] <= 0x39) {
      v = v * 10 + (pdf[j] - 0x30);
      j++;
      any = true;
    }
    return any ? { value: v, next: j } : null;
  }

  private parseObjRef(
    pdf: Buffer,
    start: number,
    end: number,
  ): { obj: number; gen: number } | null {
    let i = this.skipWhite(pdf, start, end);
    const o = this.parseUInt(pdf, i, end);
    if (!o) return null;
    i = this.skipWhite(pdf, o.next, end);
    const g = this.parseUInt(pdf, i, end);
    if (!g) return null;
    i = this.skipWhite(pdf, g.next, end);
    if (i < end && pdf[i] === 0x52 /* 'R' */) return { obj: o.value, gen: g.value };
    return null;
  }

  private findObjectDictBytes(
    pdf: Buffer,
    obj: number,
    gen: number,
  ): { start: number; end: number } | null {
    const header = Buffer.from(`${obj} ${gen} obj`, "ascii");
    const at = pdf.indexOf(header, 0);
    if (at === -1) return null;
    const dictStart = pdf.indexOf(Buffer.from("<<", "ascii"), at);
    if (dictStart === -1) return null;
    const dictEnd = this.findMatchingDictEndBytes(pdf, dictStart);
    if (dictEnd === -1) return null;
    return { start: dictStart, end: dictEnd };
  }

  /** Match the closing '>>' for a dict that starts at `start` (which points to '<<'). */
  private findMatchingDictEndBytes(pdf: Buffer, start: number): number {
    const open = Buffer.from("<<", "ascii");
    const close = Buffer.from(">>", "ascii");
    if (pdf.indexOf(open, start) !== start) return -1;

    let depth = 1;
    let i = start + 2;
    while (i < pdf.length) {
      const iOpen = pdf.indexOf(open, i);
      const iClose = pdf.indexOf(close, i);
      if (iClose === -1) return -1;
      if (iOpen !== -1 && iOpen < iClose) {
        depth++;
        i = iOpen + 2;
      } else {
        depth--;
        if (depth === 0) return iClose;
        i = iClose + 2;
      }
    }
    return -1;
  }

  private extractAreasFromSigDict(
    pdf: Buffer,
    sigStart: number,
    sigEnd: number,
    BR_KEY: Buffer,
    CONTENTS_KEY: Buffer,
    L_BRACK: number,
    R_BRACK: number,
    L_ANGLE: number,
    R_ANGLE: number,
  ): PlaceholderPositions | null {
    const brKey = this.findInRange(pdf, BR_KEY, sigStart, sigEnd + 2);
    if (brKey === -1) return null;
    const brOpen = pdf.indexOf(L_BRACK, brKey);
    const brClose = pdf.indexOf(R_BRACK, brOpen + 1);
    if (brOpen === -1 || brClose === -1 || brClose > sigEnd) return null;

    const contKey = this.findInRange(pdf, CONTENTS_KEY, sigStart, sigEnd + 2);
    if (contKey === -1) return null;
    const lt = pdf.indexOf(L_ANGLE, contKey);
    const gt = pdf.indexOf(R_ANGLE, lt + 1);
    if (lt === -1 || gt === -1 || gt > sigEnd) return null;

    const byteRangeArea: RangePos = { start: brKey, end: brClose + 1 };
    const contentsArea: RangePos = { start: lt + 1, end: gt };

    // Compute ByteRange from known gaps
    const a = 0;
    const b = lt; // start of '<' in /Contents
    const c = gt + 1; // first byte after '>'
    const d = pdf.length - c;

    return { byteRange: [a, b, c, d], byteRangeArea, contentsArea };
  }
}
