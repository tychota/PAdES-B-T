import * as asn1js from "asn1js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CMSService } from "./cms-service";
import { sha256, toBase64 } from "./crypto-utils";
import { MockHSMService } from "./mock-hsm-service";
import { SignatureService } from "./signature-service";
import { requestTimestamp as mockedRequestTs } from "./timestamp-service";

// Mock timestamp service to avoid external calls in tests
vi.mock("./timestamp-service", () => ({
  requestTimestamp: vi.fn().mockRejectedValue(new Error("TSA not available in tests")),
}));

describe("CMSService", () => {
  let mockHSM: MockHSMService;
  let signatureService: SignatureService;
  let cmsService: CMSService;

  beforeAll(async () => {
    mockHSM = new MockHSMService();
    await mockHSM.ready;
    signatureService = new SignatureService();
    cmsService = new CMSService();
  });

  describe("assembleCMS", () => {
    it("should assemble valid CMS SignedData structure using PKI.js", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      // Assemble CMS without timestamp (to avoid TSA calls)
      const result = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false, // <— renamed (no TSA in tests)
      });

      expect(result.cmsDer).toBeInstanceOf(Buffer);
      expect(result.cmsDer.length).toBeGreaterThan(0);
      expect(result.estimatedSize).toBe(result.cmsDer.length);
      // size can vary depending on PKI.js encoding and certificate length; assert “non-trivial”
      expect(result.estimatedSize).toBeGreaterThan(300);
      expect(result.isTimestamped).toBe(false);
    });

    it("should include certificate chain when provided", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const certificateChain = mockHSM.getCertificateChainPem(false); // Exclude root

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      const result = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        certificateChainPem: certificateChain,
        withTimestamp: false,
      });

      const resultWithoutChain = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false,
      });

      expect(result.cmsDer.length).toBeGreaterThan(resultWithoutChain.cmsDer.length);
    });

    it("should handle custom signature algorithm", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      const result = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        signatureAlgorithmOid: "1.2.840.113549.1.1.12", // SHA384withRSA (structure-only; mock signer uses SHA-256)
        withTimestamp: false,
      });

      expect(result.cmsDer).toBeInstanceOf(Buffer);
      expect(result.cmsDer.length).toBeGreaterThan(0);
    });

    it("should throw error for invalid certificate", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const invalidCert = "-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----";

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem: mockHSM.getSignerCertificatePem(), // OK for attrs
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      await expect(
        cmsService.assembleCMS({
          signedAttrsDer,
          signature,
          signerCertPem: invalidCert, // invalid for CMS assembly
          withTimestamp: false,
        }),
      ).rejects.toThrow("Invalid signer certificate DER");
    });

    it("should produce valid DER encoding", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      const result = await cmsService.assembleCMS({
        signedAttrsDer,
        signature,
        signerCertPem,
        withTimestamp: false,
      });

      expect(result.cmsDer[0]).toBe(0x30); // SEQUENCE

      const base64 = toBase64(result.cmsDer);
      expect(() => Buffer.from(base64, "base64")).not.toThrow();
    });
  });

  describe("assembleCMSBasic", () => {
    it("should assemble CMS synchronously without timestamp", async () => {
      const testData = Buffer.from("test document content");
      const messageDigest = sha256(testData);
      const signerCertPem = mockHSM.getSignerCertificatePem();

      const { signedAttrsDer } = signatureService.buildSignedAttributes({
        messageDigest,
        signerCertPem,
      });

      const signature = await mockHSM.signData(signedAttrsDer);

      const result = cmsService.assembleCMSBasic({
        signedAttrsDer,
        signature,
        signerCertPem,
      });

      expect(result).not.toBeInstanceOf(Promise);
      expect(result.cmsDer).toBeInstanceOf(Buffer);
      expect(result.isTimestamped).toBe(false);
    });
  });

  it("should add timestamp when TSA succeeds", async () => {
    // Minimal fake ContentInfo (empty SEQUENCE is enough for assembly)
    const fakeToken = new asn1js.Sequence();

    // Flip the mock to succeed for this test
    vi.mocked(mockedRequestTs).mockResolvedValueOnce({
      timestampToken: fakeToken,
      timestampTime: new Date("2024-01-01T00:00:00Z").toISOString(),
      tsaUrl: "https://tsa.example.test",
      accuracy: "±1s",
      serialNumber: "01",
    });

    const testData = Buffer.from("timestamped document");
    const messageDigest = sha256(testData);
    const signerCertPem = mockHSM.getSignerCertificatePem();

    const { signedAttrsDer } = signatureService.buildSignedAttributes({
      messageDigest,
      signerCertPem,
    });

    const signature = await mockHSM.signData(signedAttrsDer);

    const result = await cmsService.assembleCMS({
      signedAttrsDer,
      signature,
      signerCertPem,
      withTimestamp: true,
    });

    expect(result.isTimestamped).toBe(true);
    expect(result.timestampInfo?.tsaUrl).toBe("https://tsa.example.test");
    expect(result.cmsDer.length).toBeGreaterThan(0);
  });
});
