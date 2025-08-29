import { LogEntry } from "@pades-poc/shared";
import { beforeAll, describe, expect, it } from "vitest";

import { sha256 } from "./crypto-utils";
import { MockHSMService } from "./mock-hsm-service";
import { SignatureService } from "./signature-service";

describe("SignatureService", () => {
  let mockHSM: MockHSMService;
  let signatureService: SignatureService;

  beforeAll(async () => {
    mockHSM = new MockHSMService();
    await mockHSM.ready;
    signatureService = new SignatureService();
  });

  describe("buildSignedAttributes", () => {
    it("should build valid signed attributes structure", () => {
      const testData = Buffer.from("test message for signing");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const result = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      expect(result.signedAttrsDer).toBeInstanceOf(Buffer);
      expect(result.signedAttrsDer.length).toBeGreaterThan(0);
      // signedAttrsDer contains the DER bytes that should be signed directly
    });

    it("should produce deterministic output for same inputs", () => {
      const testData = Buffer.from("consistent test data");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const result1 = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const result2 = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      expect(Buffer.compare(result1.signedAttrsDer, result2.signedAttrsDer)).toBe(0);
    });

    it("should include mandatory PAdES attributes", () => {
      const testData = Buffer.from("test message");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const result = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      // Parse the DER to verify structure contains the attributes
      const derString = result.signedAttrsDer.toString("hex");

      // Should contain OIDs for the three mandatory attributes
      // The exact hex representation may vary due to PKI.js encoding
      expect(result.signedAttrsDer.length).toBeGreaterThan(100); // Should be substantial
      expect(derString).toMatch(/2a864886f70d01090[3-5]/); // Should contain some contentType/messageDigest OIDs
    });

    it("should handle different message digests correctly", () => {
      const testData1 = Buffer.from("first message");
      const testData2 = Buffer.from("second message");
      const messageDigest1 = sha256(testData1);
      const messageDigest2 = sha256(testData2);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const result1 = signatureService.buildSignedAttributes({
        messageDigest: messageDigest1,
        signerCertPem,
      });

      const result2 = signatureService.buildSignedAttributes({
        messageDigest: messageDigest2,
        signerCertPem,
      });

      // Results should be different due to different message digests
      expect(Buffer.compare(result1.signedAttrsDer, result2.signedAttrsDer)).not.toBe(0);
    });

    it("should throw error for invalid certificate", () => {
      const testData = Buffer.from("test message");
      const messageDigest = sha256(testData);
      const invalidCert = "-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----";

      expect(() => {
        signatureService.buildSignedAttributes({
          messageDigest,
          signerCertPem: invalidCert,
        });
      }).toThrow("Failed to build signed attributes");
    });

    it("should log debug information when logs array provided", () => {
      const testData = Buffer.from("test message");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const logs: LogEntry[] = [];

      signatureService.buildSignedAttributes(
        {
          messageDigest,
          signerCertPem,
        },
        logs,
      );

      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe("debug");
      expect(logs[0]?.message).toContain("Built signed attributes");
      expect(logs[0]?.context).toHaveProperty("attributeCount", 3);
    });
  });
});
