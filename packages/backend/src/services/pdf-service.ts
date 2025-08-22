/**
 * PDF processing service for PAdES-B-T signatures
 * Handles PDF generation, placeholder insertion, and ByteRange calculation
 */
import { PADES_CONSTANTS } from "@pades-poc/shared";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
  PDFArray,
  PDFHexString,
} from "pdf-lib";

import { toBase64, fromBase64, calculatePDFHash } from "./crypto-utils";

import type { PDFSigningConfig, ByteRange, PDFMetadata } from "@pades-poc/shared";

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
  /**
   * Generate a demo ePrescription PDF with basic content
   */
  async generateDemoPDF(config: PDFSigningConfig = {}): Promise<PDFProcessingResult> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Add a page with A4 dimensions
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText("ePrescription Médicale", {
      x: 50,
      y: 750,
      size: 20,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText("Document de démonstration PAdES-B-T", {
      x: 50,
      y: 720,
      size: 12,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Patient information
    page.drawText("INFORMATIONS PATIENT", {
      x: 50,
      y: 670,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const patientInfo = [
      "Nom: DUPONT Jean",
      "Date de naissance: 01/01/1980",
      "Numéro de sécurité sociale: 1 80 01 75 116 001 23",
      "Adresse: 123 Rue de la République, 75001 Paris",
    ];

    patientInfo.forEach((info, index) => {
      page.drawText(info, {
        x: 70,
        y: 640 - index * 20,
        size: 10,
        font,
      });
    });

    // Prescription content
    page.drawText("PRESCRIPTION", {
      x: 50,
      y: 540,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    page.drawRectangle({
      x: 50,
      y: 400,
      width: 495,
      height: 120,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });

    page.drawText("Médicament: Paracétamol 500mg", {
      x: 60,
      y: 480,
      size: 12,
      font,
    });

    page.drawText("Posologie: 1 comprimé 3 fois par jour", {
      x: 60,
      y: 460,
      size: 10,
      font,
    });

    page.drawText("Durée: 7 jours", {
      x: 60,
      y: 440,
      size: 10,
      font,
    });

    // Prescriber information
    page.drawText("PRESCRIPTEUR", {
      x: 50,
      y: 350,
      size: 14,
      font: boldFont,
    });

    page.drawText(`Dr. ${config.signerName || "MARTIN Pierre"}`, {
      x: 70,
      y: 320,
      size: 12,
      font,
    });

    page.drawText(`Lieu: ${config.location || "Cabinet Médical, Paris"}`, {
      x: 70,
      y: 300,
      size: 10,
      font,
    });

    // Footer with signature placeholder area
    page.drawRectangle({
      x: 300,
      y: 50,
      width: 245,
      height: 100,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1,
      color: rgb(0.95, 0.95, 0.95),
    });

    page.drawText("Zone de signature électronique", {
      x: 310,
      y: 120,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText("Signature PAdES-B-T", {
      x: 310,
      y: 100,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(`Date: ${new Date().toLocaleDateString("fr-FR")}`, {
      x: 310,
      y: 80,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    const metadata: PDFMetadata = {
      size: pdfBytes.length,
      pageCount: 1,
      hasExistingSignatures: false,
      existingSignatureCount: 0,
    };

    return {
      pdfBase64: toBase64(Buffer.from(pdfBytes)),
      metadata,
    };
  }

  /**
   * Add signature placeholder to PDF and prepare for signing
   */
  async preparePDF(pdfBase64: string, config: PDFSigningConfig = {}): Promise<PrepareResult> {
    const pdfBytes = fromBase64(pdfBase64);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Create signature placeholder
    const placeholderSize = PADES_CONSTANTS.DEFAULT_PLACEHOLDER_SIZE;
    const placeholder = "0".repeat(placeholderSize);

    // Add signature field to AcroForm
    const form = pdfDoc.getForm();

    // Create signature dictionary
    const context = pdfDoc.context;
    const signatureDict = context.obj({
      Type: PDFName.of("Sig"),
      Filter: PDFName.of(PADES_CONSTANTS.FILTER),
      SubFilter: PDFName.of(PADES_CONSTANTS.SUBFILTER),
      ByteRange: PDFArray.withContext(context),
      Contents: PDFHexString.of(placeholder),
      Reason: PDFString.of(config.reason || "ePrescription signature"),
      Location: PDFString.of(config.location || "France"),
      M: PDFString.of(new Date().toISOString()),
    });

    const signatureDictRef = context.register(signatureDict);

    // Add signature field
    const signatureField = form.createSignature("Signature1");
    signatureField.acroField.dict.set(PDFName.of("V"), signatureDictRef);

    // Set signature field rectangle (bottom right area)
    const signatureWidget = signatureField.acroField.getWidgets()[0];
    signatureWidget.setRectangle({
      x: 300,
      y: 50,
      width: 245,
      height: 100,
    });

    // Save the prepared PDF
    const preparedBytes = await pdfDoc.save({ useObjectStreams: false });
    const preparedBuffer = Buffer.from(preparedBytes);

    // Calculate ByteRange
    const byteRange = this.calculateByteRange(preparedBuffer);

    // Update ByteRange in the PDF
    const updatedPdf = this.updateByteRange(preparedBuffer, byteRange);

    // Calculate message digest
    const messageDigest = calculatePDFHash(updatedPdf, byteRange);

    return {
      preparedPdfBase64: toBase64(updatedPdf),
      byteRange,
      messageDigestB64: toBase64(messageDigest),
    };
  }

  /**
   * Calculate ByteRange for signature
   */
  private calculateByteRange(pdfBytes: Buffer): ByteRange {
    const pdfString = pdfBytes.toString("latin1");

    // Find the Contents placeholder
    const contentsMatch = pdfString.match(/\/Contents\s*<([0-9A-Fa-f]+)>/);
    if (!contentsMatch) {
      throw new Error("Contents placeholder not found in PDF");
    }

    const contentsStart = pdfString.indexOf(contentsMatch[0]) + "/Contents <".length;
    const contentsEnd = contentsStart + contentsMatch[1].length;

    // ByteRange format: [start1, length1, start2, length2]
    // Covers everything except the Contents hex string
    return [
      0, // Start from beginning
      contentsStart, // Length to Contents start
      contentsEnd, // Start after Contents
      pdfBytes.length - contentsEnd, // Length to end
    ];
  }

  /**
   * Update ByteRange values in PDF
   */
  private updateByteRange(pdfBytes: Buffer, byteRange: ByteRange): Buffer {
    let pdfString = pdfBytes.toString("latin1");

    // Find and replace ByteRange placeholder
    const byteRangeStr = `[${byteRange.join(" ")}]`;
    pdfString = pdfString.replace(/\/ByteRange\s*\[[^\]]*\]/, `/ByteRange ${byteRangeStr}`);

    return Buffer.from(pdfString, "latin1");
  }

  /**
   * Get PDF metadata
   */
  async getPDFMetadata(pdfBase64: string): Promise<PDFMetadata> {
    const pdfBytes = fromBase64(pdfBase64);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    return {
      size: pdfBytes.length,
      pageCount: pdfDoc.getPageCount(),
      hasExistingSignatures: false, // TODO: Implement signature detection
      existingSignatureCount: 0,
    };
  }
}
