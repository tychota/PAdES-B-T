import { PADES_CONSTANTS } from "@pades-poc/shared";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { PDFDocument } from "pdf-lib";
import { describe, it, expect } from "vitest";

import { DEFAULT_SIGNATURE_FIELD_NAME, DEFAULT_SIGNATURE_RECT } from "../pdf-service";

import { PdfByteParser } from "./byte-parser";

describe("PdfByteParser", () => {
  it("locates ByteRange and Contents areas for the default signature field", async () => {
    // Build a minimal 1-page PDF with a placeholder field
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);

    pdflibAddPlaceholder({
      pdfDoc,
      reason: "Unit Test",
      contactInfo: "",
      name: DEFAULT_SIGNATURE_FIELD_NAME,
      location: "Test",
      signatureLength: PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE,
      subFilter: PADES_CONSTANTS.SUBFILTER,
      widgetRect: DEFAULT_SIGNATURE_RECT,
      appName: "UnitTest",
    });

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const buffer = Buffer.from(bytes);

    const parser = new PdfByteParser(DEFAULT_SIGNATURE_FIELD_NAME);
    const pos = parser.locateSignatureAreas(buffer, DEFAULT_SIGNATURE_FIELD_NAME);

    // 1) /Contents <...> exists with the exact placeholder size (hex chars)
    const contentsLen = pos.contentsArea.end - pos.contentsArea.start;
    expect(contentsLen).toBe(PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE);

    // 2) ByteRange area starts with "/ByteRange" in ASCII
    const brPrefix = buffer
      .subarray(pos.byteRangeArea.start, pos.byteRangeArea.start + "/ByteRange".length)
      .toString("ascii");
    expect(brPrefix).toBe("/ByteRange");

    // 3) Sanity on computed ByteRange co-ordinates
    const [a, b, c, d] = pos.byteRange;
    expect(a).toBe(0); // always
    expect(b).toBeGreaterThan(0); // should reach '<' of /Contents
    expect(c).toBeGreaterThan(b); // starts right after '>'
    expect(d).toBe(buffer.length - c); // should point to the tail size

    // 4) Ensure angle brackets around the contents segment are present
    expect(buffer[b]).toBe(0x3c); // '<'
    expect(buffer[c - 1]).toBe(0x3e); // '>'
  });

  it("falls back to scanning for /ByteRange when field name doesn't match", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);

    pdflibAddPlaceholder({
      pdfDoc,
      reason: "Unit Test",
      contactInfo: "",
      name: DEFAULT_SIGNATURE_FIELD_NAME,
      location: "Test",
      signatureLength: PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE,
      subFilter: PADES_CONSTANTS.SUBFILTER,
      widgetRect: DEFAULT_SIGNATURE_RECT,
      appName: "UnitTest",
    });

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const buffer = Buffer.from(bytes);

    const parser = new PdfByteParser("WrongName");
    const pos = parser.locateSignatureAreas(buffer, "DefinitelyNotTheRightName");

    // Should still find a signature dictionary by /ByteRange + /Contents
    expect(pos.byteRange[0]).toBe(0);
    const end = pos.contentsArea.end;
    const start = pos.contentsArea.start;
    expect(end - start).toBe(PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE);
  });
});
