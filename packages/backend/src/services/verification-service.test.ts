import { beforeAll, describe, expect, it } from "vitest";

import { CMSService } from "./cms-service";
import { MockHSMService } from "./mock-hsm-service";
import { PDFService } from "./pdf-service";
import { SignatureService } from "./signature-service";
import { VerificationService } from "./verification-service";

import type { PDFSigningConfig } from "@pades-poc/shared";

describe("VerificationService", () => {
  let mockHSM: MockHSMService;
  let pdfService: PDFService;
  let signatureService: SignatureService;
  let cmsService: CMSService;
  let verificationService: VerificationService;

  beforeAll(async () => {
    mockHSM = new MockHSMService();
    await mockHSM.ready;
    pdfService = new PDFService();
    signatureService = new SignatureService();
    cmsService = new CMSService();
    verificationService = new VerificationService();
  });

  describe("verify", () => {
    it("should verify a valid PAdES-B-B signature", async () => {
      // Create a complete signed PDF
      const config: PDFSigningConfig = {
        signerName: "Dr. Test Signer",
        reason: "Test signature",
        location: "Test Location",
      };

      // Generate and prepare PDF
      const demoResult = await pdfService.generateDemoPDF(config);
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64, config);

      // Build signed attributes
      const messageDigest = Buffer.from(prepareResult.messageDigestB64, "base64");
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      // Sign with mock HSM
      const signature = await mockHSM.signData(signedAttrsDer);

      // Assemble CMS (without timestamp for B-B test)
      const cmsResult = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false,
      });

      // Embed in PDF
      const preparedBytes = Buffer.from(prepareResult.preparedPdfBase64, "base64");
      const signedPdf = pdfService.embedCmsIntoPdf(
        new Uint8Array(preparedBytes),
        new Uint8Array(cmsResult.cmsDer),
      );

      // Verify the signed PDF
      const verificationResult = await verificationService.verify(Buffer.from(signedPdf));

      expect(verificationResult.isCryptographicallyValid).toBe(true);
      expect(verificationResult.isPAdESCompliant).toBe(true);
      expect(verificationResult.isTimestamped).toBe(false);
      expect(verificationResult.signatureLevel).toBe("B-B");
      expect(verificationResult.reasons).toHaveLength(0);
    });

    it("should verify a valid PAdES-B-T signature with timestamp", async () => {
      const config: PDFSigningConfig = {
        signerName: "Dr. Test Signer",
        reason: "Test signature with timestamp",
      };

      // Generate and prepare PDF
      const demoResult = await pdfService.generateDemoPDF(config);
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64, config);

      // Build signed attributes
      const messageDigest = Buffer.from(prepareResult.messageDigestB64, "base64");
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      // Sign with mock HSM
      const signature = await mockHSM.signData(signedAttrsDer);

      // Assemble CMS with timestamp attempt (will fall back to B-B if TSA fails)
      const cmsResult = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: true,
      });

      // Embed in PDF
      const preparedBytes = Buffer.from(prepareResult.preparedPdfBase64, "base64");
      const signedPdf = pdfService.embedCmsIntoPdf(
        new Uint8Array(preparedBytes),
        new Uint8Array(cmsResult.cmsDer),
      );

      // Verify the signed PDF
      const verificationResult = await verificationService.verify(Buffer.from(signedPdf));

      expect(verificationResult.isCryptographicallyValid).toBe(true);
      expect(verificationResult.isPAdESCompliant).toBe(true);
      expect(verificationResult.signatureLevel).toMatch(/^B-(B|T)$/);
      expect(verificationResult.reasons).toHaveLength(0);
    });

    it("should detect modified PDF content", async () => {
      // Create a signed PDF
      const demoResult = await pdfService.generateDemoPDF();
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64);

      const messageDigest = Buffer.from(prepareResult.messageDigestB64, "base64");
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);
      const cmsResult = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false,
      });

      const preparedBytes = Buffer.from(prepareResult.preparedPdfBase64, "base64");
      const signedPdf = pdfService.embedCmsIntoPdf(
        new Uint8Array(preparedBytes),
        new Uint8Array(cmsResult.cmsDer),
      );

      // Modify PDF content after signing
      // Modify a byte that is guaranteed to be within the first signed range
      const text = Buffer.from(signedPdf).toString("latin1");
      const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(text)!;
      const start1 = parseInt(m[1], 10);
      const length1 = parseInt(m[2], 10);
      const flipAt = start1 + Math.min(25, length1 - 1); // safe inside [start1, start1+length1)
      const modifiedPdf = Buffer.from(signedPdf);
      modifiedPdf[flipAt] ^= 0xff;

      // Verify the modified PDF
      const verificationResult = await verificationService.verify(modifiedPdf);

      expect(verificationResult.isCryptographicallyValid).toBe(false);
      expect(verificationResult.isPAdESCompliant).toBe(false);
      expect(verificationResult.reasons).toContain("PDF content has been modified");
    });

    it("should handle invalid PDF gracefully", async () => {
      const invalidPdf = Buffer.from("not a valid pdf");

      const verificationResult = await verificationService.verify(invalidPdf);

      expect(verificationResult.isCryptographicallyValid).toBe(false);
      expect(verificationResult.isPAdESCompliant).toBe(false);
      expect(verificationResult.reasons[0]).toContain("No CMS signature found");
    });

    it("should handle PDF without signature", async () => {
      // Create unsigned PDF
      const demoResult = await pdfService.generateDemoPDF();
      const unsignedPdf = Buffer.from(demoResult.pdfBase64, "base64");

      const verificationResult = await verificationService.verify(unsignedPdf);

      expect(verificationResult.isCryptographicallyValid).toBe(false);
      expect(verificationResult.isPAdESCompliant).toBe(false);
      expect(verificationResult.reasons[0]).toContain("No CMS signature found");
    });
  });
});
