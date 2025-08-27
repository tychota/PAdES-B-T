import { Sequence, Integer, ObjectIdentifier, UTCTime, fromBER, OctetString } from "asn1js";
import {
  ContentInfo,
  SignedData,
  Attribute,
  Certificate,
  EncapsulatedContentInfo,
  SignerInfo,
  AlgorithmIdentifier,
} from "pkijs";
import { beforeAll, describe, expect, it } from "vitest";

import { CMSService } from "./cms-service";
import { MockHSMService } from "./mock-hsm-service";
import { PAdESComplianceChecker } from "./pades-compliance-checker";
import { PDFService } from "./pdf-service";
import { SignatureService } from "./signature-service";

import type { LogEntry } from "@pades-poc/shared";
import type { SignerInfo as SignerInfoType } from "pkijs";

describe("PAdESComplianceChecker", () => {
  let mockHSM: MockHSMService;
  let pdfService: PDFService;
  let signatureService: SignatureService;
  let cmsService: CMSService;
  let complianceChecker: PAdESComplianceChecker;

  beforeAll(async () => {
    mockHSM = new MockHSMService();
    await mockHSM.ready;
    pdfService = new PDFService();
    signatureService = new SignatureService();
    cmsService = new CMSService();
    complianceChecker = new PAdESComplianceChecker();
  });

  describe("checkCompliance", () => {
    it("should validate compliant PAdES-B-B signature", async () => {
      // Create a complete signed PDF
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

      // Parse CMS for compliance checking
      const asn1 = fromBER(cmsResult.cmsDer);
      const contentInfo = new ContentInfo({ schema: asn1.result });
      const signedData = new SignedData({ schema: contentInfo.content });
      const signerInfo = signedData.signerInfos[0];

      const logs: LogEntry[] = [];
      const result = await complianceChecker.checkCompliance(
        signedData,
        signerInfo,
        false, // not timestamped
        true, // signature valid
        true, // digest matches
        true, // chain valid
        logs,
      );

      expect(result.isCompliant).toBe(true);
      expect(result.signatureLevel).toBe("B-B");
      expect(result.profile).toBe("Baseline");
      expect(result.summary.mandatoryPassed).toBe(result.summary.mandatoryTotal);
      expect(result.checks).toHaveLength(
        result.summary.mandatoryTotal + result.summary.recommendedTotal,
      );

      // Check for key mandatory requirements
      const mandatoryChecks = result.checks.filter((c) => c.level === "mandatory");
      expect(mandatoryChecks.some((c) => c.requirement.includes("Cryptographic signature"))).toBe(
        true,
      );
      expect(
        mandatoryChecks.some((c) => c.requirement.includes("contentType signed attribute")),
      ).toBe(true);
      expect(
        mandatoryChecks.some((c) => c.requirement.includes("messageDigest signed attribute")),
      ).toBe(true);

      // Check logs were generated
      expect(logs).toHaveLength(2);
      expect(logs[0]?.level).toBe("debug");
      expect(logs[1]?.level).toBe("success");
    });

    it("should detect non-compliant signature with missing attributes", async () => {
      // Create a minimal, non-compliant CMS structure
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const certDer = Buffer.from(
        signerCertPem
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s+/g, ""),
        "base64",
      );

      const certAsn1 = fromBER(certDer);
      const cert = new Certificate({ schema: certAsn1.result });

      const signedData = new SignedData({
        version: 1,
        encapContentInfo: new EncapsulatedContentInfo({
          eContentType: "1.2.840.113549.1.7.1",
        }),
        certificates: [cert],
        signerInfos: [],
      });

      // Create minimal signerInfo without required signed attributes
      const signerInfo: SignerInfoType = new SignerInfo({
        version: 1,
        sid: cert.serialNumber, // Invalid - should be IssuerAndSerialNumber
      }) as unknown as SignerInfoType;

      // Set up minimal structure
      signerInfo.digestAlgorithm = new AlgorithmIdentifier({
        algorithmId: "2.16.840.1.101.3.4.2.1",
      });
      signerInfo.signatureAlgorithm = new AlgorithmIdentifier({
        algorithmId: "1.2.840.113549.1.1.11",
      });
      signerInfo.signature = new OctetString({ valueHex: new ArrayBuffer(256) });

      const result = await complianceChecker.checkCompliance(
        signedData,
        signerInfo,
        false, // not timestamped
        false, // signature invalid
        false, // digest doesn't match
        false, // chain invalid
      );

      expect(result.isCompliant).toBe(false);
      expect(result.signatureLevel).toBe("B-B");
      expect(result.summary.mandatoryPassed).toBeLessThan(result.summary.mandatoryTotal);

      // Should have failed basic requirements
      const failedChecks = result.checks.filter((c) => c.level === "mandatory" && !c.satisfied);
      expect(failedChecks.length).toBeGreaterThan(0);

      // Should fail signature validation
      const sigCheck = result.checks.find((c) => c.requirement.includes("Cryptographic signature"));
      expect(sigCheck?.satisfied).toBe(false);
    });

    it("should validate PAdES-B-T requirements with timestamp", async () => {
      // Create a fake timestamp token for testing
      const fakeToken = new Sequence({
        value: [
          new ObjectIdentifier({ value: "1.2.840.113549.1.7.2" }), // signedData
          new Sequence({
            value: [
              new Integer({ value: 1 }), // version
              new Sequence({ value: [] }), // digestAlgorithms
              new Sequence({
                value: [
                  new ObjectIdentifier({ value: "1.2.840.113549.1.7.1" }), // id-data
                ],
              }),
            ],
          }),
        ],
      });

      // Create complete signed PDF with timestamp
      const demoResult = await pdfService.generateDemoPDF();
      const prepareResult = await pdfService.preparePDF(demoResult.pdfBase64);

      const messageDigest = Buffer.from(prepareResult.messageDigestB64, "base64");
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      // Create CMS with fake timestamp (testing structure only)
      const cmsBasic = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false,
      });

      // Parse and modify to add fake timestamp
      const asn1 = fromBER(cmsBasic.cmsDer);
      const contentInfo = new ContentInfo({ schema: asn1.result });
      const signedData = new SignedData({ schema: contentInfo.content });
      const signerInfo = signedData.signerInfos[0];

      // Add fake timestamp attribute
      const tsAttr = new Attribute({
        type: "1.2.840.113549.1.9.16.2.14",
        values: [fakeToken],
      });

      // Manually set unsigned attributes (this is for testing structure only)
      // unsignedAttrs is not in the type, but present at runtime for test
      (signerInfo as { unsignedAttrs?: { attributes: unknown[] } }).unsignedAttrs = {
        attributes: [tsAttr],
      };

      const result = await complianceChecker.checkCompliance(
        signedData,
        signerInfo,
        true, // timestamped
        true, // signature valid
        true, // digest matches
        true, // chain valid
      );

      expect(result.signatureLevel).toBe("B-T");

      // Should check for timestamp requirements
      const timestampCheck = result.checks.find((c) =>
        c.requirement.includes("signatureTimeStampToken"),
      );
      expect(timestampCheck).toBeDefined();
      expect(timestampCheck?.satisfied).toBe(true);
    });

    it("should detect forbidden signingTime attribute", async () => {
      // This test verifies that the compliance checker properly detects
      // forbidden elements like signingTime in signed attributes
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

      const asn1 = fromBER(cmsResult.cmsDer);
      const contentInfo = new ContentInfo({ schema: asn1.result });
      const signedData = new SignedData({ schema: contentInfo.content });
      const signerInfo = signedData.signerInfos[0];

      // Manually add forbidden signingTime attribute (for testing)
      const forbiddenAttr = new Attribute({
        type: "1.2.840.113549.1.9.5", // signingTime
        values: [new UTCTime({ valueDate: new Date() })],
      });

      if (signerInfo.signedAttrs) {
        signerInfo.signedAttrs.attributes.push(forbiddenAttr);
      }

      const result = await complianceChecker.checkCompliance(
        signedData,
        signerInfo,
        false,
        true,
        true,
        true,
      );

      // Should detect the forbidden attribute
      const forbiddenCheck = result.checks.find((c) =>
        c.requirement.includes("signingTime signed attribute must not be present"),
      );
      expect(forbiddenCheck).toBeDefined();
      expect(forbiddenCheck?.satisfied).toBe(false);
      expect(result.isCompliant).toBe(false);
    });

    it("should provide detailed summary statistics", async () => {
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

      const asn1 = fromBER(cmsResult.cmsDer);
      const contentInfo = new ContentInfo({ schema: asn1.result });
      const signedData = new SignedData({ schema: contentInfo.content });
      const signerInfo = signedData.signerInfos[0];

      const result = await complianceChecker.checkCompliance(
        signedData,
        signerInfo,
        false,
        true,
        true,
        true,
      );

      expect(result.summary).toBeDefined();
      expect(result.summary.mandatoryTotal).toBeGreaterThan(0);
      expect(result.summary.recommendedTotal).toBeGreaterThan(0);
      expect(result.summary.mandatoryPassed).toBeLessThanOrEqual(result.summary.mandatoryTotal);
      expect(result.summary.recommendedPassed).toBeLessThanOrEqual(result.summary.recommendedTotal);

      // Check that all checks are accounted for
      const totalChecks = result.summary.mandatoryTotal + result.summary.recommendedTotal;
      expect(result.checks).toHaveLength(totalChecks);
    });
  });
});
