import { PADES_CONSTANTS, DEFAULT_CONFIG } from "@pades-poc/shared";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
  PDFObject,
  PDFRef,
  PDFContext,
  PDFDict,
  PDFArray,
} from "pdf-lib";

import { toBase64, fromBase64, sha256 } from "./crypto-utils";
import { PdfByteParser } from "./pdf/byte-parser";

import type { PDFSigningConfig, ByteRange, PDFMetadata } from "@pades-poc/shared";

/** A4 portrait in points */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export const DEFAULT_SIGNATURE_FIELD_NAME = "Signature1";
export const DEFAULT_SIGNATURE_RECT: [number, number, number, number] = [300, 50, 545, 150];

export interface PDFProcessingResult {
  pdfBase64: string;
  metadata: PDFMetadata;
}

export interface PrepareResult {
  preparedPdfBase64: string;
  byteRange: ByteRange;
  messageDigestB64: string;
}

export class PDFService {
  private parser: PdfByteParser;

  constructor(private readonly fieldName: string = DEFAULT_SIGNATURE_FIELD_NAME) {
    this.parser = new PdfByteParser(fieldName);
  }

  /** Generate a demo PDF (unsigned) with pdf-lib + some ASCII-visible metadata. */
  async generateDemoPDF(config: PDFSigningConfig = {}): Promise<PDFProcessingResult> {
    const pdfDoc = await PDFDocument.create();

    const signerName = config.signerName || "MARTIN Pierre";
    const location = config.location || "Cabinet Médical, Paris";

    // High-level Info (may serialize as UTF-16 hex when accents exist)
    pdfDoc.setTitle("ePrescription Médicale");
    pdfDoc.setAuthor(`Dr. ${signerName}`);
    pdfDoc.setCreator("PAdES-POC");
    pdfDoc.setSubject(`Prescription électronique PAdES-B-T — Lieu: ${location}`);

    // ASCII-visible metadata on Catalog (plain literal strings → unit tests can see)
    const ctx = pdfDoc.context;
    const utMeta = ctx.obj({
      UTAuthor: PDFString.of(`Dr. ${signerName}`),
      UTLocation: PDFString.of(location),
    });
    pdfDoc.catalog.set(PDFName.of("UTMeta"), ctx.register(utMeta));

    // Page + fonts
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("ePrescription Médicale", {
      x: 50,
      y: 750,
      size: 20,
      font: helvBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText("Document de démonstration PAdES-B-T", {
      x: 50,
      y: 720,
      size: 12,
      font: helv,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Patient
    page.drawText("INFORMATIONS PATIENT", {
      x: 50,
      y: 670,
      size: 14,
      font: helvBold,
      color: rgb(0, 0, 0),
    });
    const patientInfo = [
      "Nom: DUPONT Jean",
      "Date de naissance: 01/01/1980",
      "Numéro de sécurité sociale: 1 80 01 75 116 001 23",
      "Adresse: 123 Rue de la République, 75001 Paris",
    ];
    patientInfo.forEach((t, i) =>
      page.drawText(t, { x: 70, y: 640 - i * 20, size: 10, font: helv }),
    );

    // Prescription
    page.drawText("PRESCRIPTION", { x: 50, y: 540, size: 14, font: helvBold, color: rgb(0, 0, 0) });
    page.drawRectangle({
      x: 50,
      y: 400,
      width: 495,
      height: 120,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });
    page.drawText("Médicament: Paracétamol 500mg", { x: 60, y: 480, size: 12, font: helv });
    page.drawText("Posologie: 1 comprimé 3 fois par jour", { x: 60, y: 460, size: 10, font: helv });
    page.drawText("Durée: 7 jours", { x: 60, y: 440, size: 10, font: helv });

    // Prescriber
    page.drawText("PRESCRIPTEUR", { x: 50, y: 350, size: 14, font: helvBold });
    page.drawText(`Dr. ${signerName}`, { x: 70, y: 320, size: 12, font: helv });
    page.drawText(`Lieu: ${location}`, { x: 70, y: 300, size: 10, font: helv });

    // Visual signature area
    const [x1, y1, x2, y2] = DEFAULT_SIGNATURE_RECT;
    page.drawRectangle({
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1,
      color: rgb(0.95, 0.95, 0.95),
    });
    page.drawText("Zone de signature électronique", {
      x: x1 + 10,
      y: y1 + (y2 - y1) - 80,
      size: 10,
      font: helvBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText("Signature PAdES-B-T", {
      x: x1 + 10,
      y: y1 + (y2 - y1) - 60,
      size: 8,
      font: helv,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(`Date: ${new Date().toLocaleDateString("fr-FR")}`, {
      x: x1 + 10,
      y: y1 + (y2 - y1) - 40,
      size: 8,
      font: helv,
      color: rgb(0.5, 0.5, 0.5),
    });

    const bytes = await pdfDoc.save({ useObjectStreams: false }); // stable layout
    const buf = Buffer.from(bytes);

    return {
      pdfBase64: toBase64(buf),
      metadata: {
        size: buf.length,
        pageCount: 1,
        hasExistingSignatures: false,
        existingSignatureCount: 0,
      },
    };
  }

  /**
   * Prepare a PDF: add signature field + placeholder, compute ByteRange & digest (SHA-256).
   */
  async preparePDF(pdfBase64: string, config: PDFSigningConfig = {}): Promise<PrepareResult> {
    const src = fromBase64(pdfBase64);
    const pdfDoc = await PDFDocument.load(src);

    pdflibAddPlaceholder({
      pdfDoc,
      reason: config.reason || DEFAULT_CONFIG.SIGNATURE_REASON,
      contactInfo: config.contactInfo || "",
      name: this.fieldName,
      location: config.location || DEFAULT_CONFIG.SIGNATURE_LOCATION,
      signatureLength: PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE, // hex chars
      subFilter: PADES_CONSTANTS.SUBFILTER, // 'ETSI.CAdES.detached'
      widgetRect: DEFAULT_SIGNATURE_RECT,
      appName: "PAdES-POC",
    });

    const preparedBytes = await pdfDoc.save({ useObjectStreams: false });
    const preparedBuffer = Buffer.from(preparedBytes);

    // Locate placeholder areas using byte-level search
    const pos = this.parser.locateSignatureAreas(preparedBuffer, this.fieldName);

    // write final ByteRange into the PDF *before* hashing
    this.writeByteRange(preparedBuffer, pos.byteRangeArea, pos.byteRange);

    // Compute SHA-256 over the ByteRange
    const digest = this.computeDigest(preparedBuffer, pos.byteRange);

    return {
      preparedPdfBase64: toBase64(preparedBuffer),
      byteRange: pos.byteRange,
      messageDigestB64: toBase64(Buffer.from(digest)),
    };
  }

  /**
   * Embed CMS (DER) into the prepared PDF (in-place update of /Contents and /ByteRange).
   */
  embedCmsIntoPdf(
    pdfBytes: Uint8Array,
    cmsDer: Uint8Array,
    expectedMessageDigestB64?: string,
  ): Uint8Array {
    const buf = Buffer.from(pdfBytes);
    const { byteRange, contentsArea } = this.parser.locateSignatureAreas(buf, this.fieldName);

    const cmsHex = Buffer.from(cmsDer).toString("hex").toUpperCase();
    const maxHex = contentsArea.end - contentsArea.start;

    if (cmsHex.length > maxHex) {
      throw new Error(
        `CMS too large for placeholder: need ${cmsHex.length} hex chars, have ${maxHex}. Increase signatureLength.`,
      );
    }

    // Fill /Contents <...> with CMS hex (pad with '0')
    buf.fill(0x30 /* '0' */, contentsArea.start, contentsArea.end);
    buf.write(cmsHex, contentsArea.start, "ascii");

    // Optional guard: the signed bytes must not have changed
    if (expectedMessageDigestB64) {
      const rt = this.computeDigest(buf, byteRange);
      if (!Buffer.from(rt).equals(Buffer.from(expectedMessageDigestB64, "base64"))) {
        throw new Error("Prepared content changed between prepare and embed (digest mismatch).");
      }
    }

    return new Uint8Array(buf);
  }

  /**
   * Accurate, async, tree-walking metadata:
   * - pageCount from pdf-lib
   * - signature fields by AcroForm traversal (with inherited /FT)
   * - "existing" signatures when /V points to a /Type /Sig dictionary
   */
  async getPDFMetadata(pdfBase64: string): Promise<PDFMetadata> {
    const bytes = fromBase64(pdfBase64);
    const pdfDoc = await PDFDocument.load(bytes);

    const context = pdfDoc.context;
    const acroFormRef = pdfDoc.catalog.get(PDFName.of("AcroForm"));

    let existingSignatureCount = 0;

    if (acroFormRef) {
      const acroForm = lookupDict(context, acroFormRef);
      const fieldsArr = acroForm && lookupArray(context, acroForm.get(PDFName.of("Fields")));
      if (fieldsArr) {
        for (let i = 0; i < fieldsArr.size(); i++) {
          const fieldObj = fieldsArr.get(i);
          walkField(fieldObj);
        }
      }
    }

    return {
      size: bytes.length,
      pageCount: pdfDoc.getPageCount(),
      hasExistingSignatures: existingSignatureCount > 0,
      existingSignatureCount,
    };

    // ---- helpers (scoped, pdf-lib only) ----

    function walkField(obj: PDFObject | PDFRef | undefined): void {
      const dict = lookupDict(context, obj);
      if (!dict) return;

      // Resolve inherited /FT via Parent chain
      const ft = getInheritedName(context, dict, PDFName.of("FT"));
      const isSigField = ft === "/Sig";
      if (isSigField) {
        // Consider it "existing" if /V is present and resolves to a signature dictionary
        const v = dict.get(PDFName.of("V"));
        const vDict = v ? lookupDict(context, v) : undefined;
        if (vDict) {
          const typ = vDict.get(PDFName.of("Type"));
          const isSigDict = typ instanceof PDFName ? String(typ) === "/Sig" : false;
          // Some placeholders may omit /Type; still treat any /V as "existing"
          existingSignatureCount += isSigDict || !typ ? 1 : 0;
        }
      }

      // Recurse into Kids, if any (fields can be hierarchical)
      const kids = lookupArray(context, dict.get(PDFName.of("Kids")));
      if (kids) {
        for (let i = 0; i < kids.size(); i++) {
          walkField(kids.get(i));
        }
      }
    }

    /** Resolve an inheritable Name up the Parent chain as string like "/Sig" */
    function getInheritedName(
      context: PDFContext,
      start: PDFDict,
      key: PDFName,
    ): string | undefined {
      let cur: PDFDict | undefined = start;
      while (cur) {
        const v = cur.get(key);
        if (v instanceof PDFName) return String(v);
        const parent = lookupDict(context, cur.get(PDFName.of("Parent")));
        cur = parent;
      }
      return undefined;
    }

    // Safe lookups
    function lookupDict(
      context: PDFContext,
      obj: PDFObject | PDFRef | undefined,
    ): PDFDict | undefined {
      if (!obj) return undefined;
      if (obj instanceof PDFDict) return obj;
      if (obj instanceof PDFRef) return context.lookup(obj, PDFDict);
      return undefined;
    }
    function lookupArray(
      context: PDFContext,
      obj: PDFObject | PDFRef | undefined,
    ): PDFArray | undefined {
      if (!obj) return undefined;
      if (obj instanceof PDFArray) return obj;
      if (obj instanceof PDFRef) return context.lookup(obj, PDFArray);
      return undefined;
    }
  }

  // ------------------------------
  // Small high-level helper
  // ------------------------------
  private computeDigest(pdf: Buffer, byteRange: ByteRange): Uint8Array {
    const [a, b, c, d] = byteRange;
    const part1 = pdf.subarray(a, a + b);
    const part2 = pdf.subarray(c, c + d);
    return sha256(Buffer.concat([part1, part2]));
  }

  private writeByteRange(
    buf: Uint8Array,
    area: { start: number; end: number },
    br: [number, number, number, number],
  ) {
    const brText = `/ByteRange [${br[0]} ${br[1]} ${br[2]} ${br[3]}]`;
    // ASCII only → TextEncoder is fine
    const brBytes = new TextEncoder().encode(brText);

    // fill the whole fixed-size slot, then copy the text in
    buf.fill(0x20 /* space */, area.start, area.end);
    buf.set(brBytes, area.start);
  }
}
