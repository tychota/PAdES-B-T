import { describe, it, expect, beforeEach } from "vitest";

import { PDFService } from "./pdf-service";

import type { PDFSigningConfig } from "@pades-poc/shared";

describe("PDFService", () => {
  let pdfService: PDFService;

  beforeEach(() => {
    pdfService = new PDFService();
  });

  describe("generateDemoPDF", () => {
    it("should generate a valid PDF with default configuration", async () => {
      const result = await pdfService.generateDemoPDF();

      expect(result.pdfBase64).toBeTruthy();
      expect(result.metadata.size).toBeGreaterThan(0);
      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.hasExistingSignatures).toBe(false);

      // Validate it's a valid PDF by checking header
      const pdfBuffer = Buffer.from(result.pdfBase64, "base64");
      const pdfHeader = pdfBuffer.toString("ascii", 0, 4);
      expect(pdfHeader).toBe("%PDF");
    });

    it("should use custom configuration", async () => {
      const config: PDFSigningConfig = {
        signerName: "Dr. Test",
        location: "Test Hospital",
        reason: "Test prescription",
      };

      const result = await pdfService.generateDemoPDF(config);
      const pdfBuffer = Buffer.from(result.pdfBase64, "base64");
      const pdfContent = pdfBuffer.toString("latin1");

      expect(pdfContent).toContain("Dr. Test");
      expect(pdfContent).toContain("Test Hospital");
    });

    it("should create PDF with expected metadata", async () => {
      const result = await pdfService.generateDemoPDF();

      expect(result.metadata).toMatchObject({
        size: expect.any(Number) as number,
        pageCount: 1,
        hasExistingSignatures: false,
        existingSignatureCount: 0,
      });
    });
  });

  describe("preparePDF", () => {
    it("should prepare PDF for signing with signature placeholder", async () => {
      // First generate a demo PDF
      const demoResult = await pdfService.generateDemoPDF();

      // Then prepare it for signing
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64);

      expect(prepareResult.preparedPdfBase64).toBeTruthy();
      expect(prepareResult.byteRange).toHaveLength(4);
      expect(prepareResult.messageDigestB64).toBeTruthy();

      // Validate ByteRange format [start1, length1, start2, length2]
      const [start1, length1, start2, length2] = prepareResult.byteRange;
      expect(start1).toBe(0);
      expect(length1).toBeGreaterThan(0);
      expect(start2).toBeGreaterThan(length1);
      expect(length2).toBeGreaterThan(0);
    });

    it("should include signature configuration in prepared PDF", async () => {
      const demoResult = await pdfService.generateDemoPDF();
      const config: PDFSigningConfig = {
        reason: "Test signature reason",
        location: "Test location",
      };

      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64, config);
      const preparedBuffer = Buffer.from(prepareResult.preparedPdfBase64, "base64");
      const pdfContent = preparedBuffer.toString("latin1");

      expect(pdfContent).toContain("Test signature reason");
      expect(pdfContent).toContain("Test location");
    });

    it("should generate valid message digest", async () => {
      const demoResult = await pdfService.generateDemoPDF();
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64);

      // Message digest should be valid base64 (SHA-256 = 32 bytes = 44 chars base64)
      const digestBuffer = Buffer.from(prepareResult.messageDigestB64, "base64");
      expect(digestBuffer.length).toBe(32);
    });
  });

  describe("getPDFMetadata", () => {
    it("should return correct metadata for generated PDF", async () => {
      const demoResult = await pdfService.generateDemoPDF();
      const metadata = await pdfService.getPDFMetadata(demoResult.pdfBase64);

      expect(metadata).toMatchObject({
        size: expect.any(Number) as number,
        pageCount: 1,
        hasExistingSignatures: false,
        existingSignatureCount: 0,
      });
    });
  });
});
