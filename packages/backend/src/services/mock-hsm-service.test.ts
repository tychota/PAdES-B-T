import { existsSync, rmSync } from "fs";
import { join } from "path";

import { fromBER, BitString } from "asn1js";
import { Certificate } from "pkijs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.stubEnv("LOG_LEVEL", "error");

import { MockHSMService } from "./mock-hsm-service";

describe("MockHSMService", () => {
  const testCertDir = join(process.cwd(), "test-certificates");
  let mockHSM: MockHSMService;

  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(testCertDir)) {
      rmSync(testCertDir, { recursive: true, force: true });
    }

    mockHSM = new MockHSMService({
      certDir: testCertDir,
      signerName: "Test Signer",
      organization: "Test Org",
    });
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (existsSync(testCertDir)) {
      rmSync(testCertDir, { recursive: true, force: true });
    }
  });

  describe("initialization", () => {
    it("should create certificate directory", () => {
      expect(existsSync(testCertDir)).toBe(true);
    });

    it("should eventually be initialized (async)", async () => {
      await mockHSM.ready; // <— instead of sleep
      expect(mockHSM.isInitialized()).toBe(true);
    }, 10000);
  });

  describe("certificate operations", () => {
    it("should provide signer certificate in PEM format", async () => {
      await mockHSM.ready;

      const cert = mockHSM.getSignerCertificatePem();
      expect(typeof cert).toBe("string");
      expect(cert).toContain("-----BEGIN CERTIFICATE-----");
      expect(cert).toContain("-----END CERTIFICATE-----");
    }, 10000);

    it("should provide certificate chain", async () => {
      await mockHSM.ready;

      const chain = mockHSM.getCertificateChainPem();
      expect(Array.isArray(chain)).toBe(true);
    }, 10000);

    it("should provide certificate info", async () => {
      await mockHSM.ready;

      const info = mockHSM.getCertificateInfo();

      expect(info.subject).toContain("Test Signer");
      expect(info.issuer).toContain("Mock Intermediate CA");
      expect(info.keyUsage).toContain("digitalSignature");
      expect(info.keyUsage).toContain("nonRepudiation");
      expect(info.validFrom).toBeInstanceOf(Date);
      expect(info.validTo).toBeInstanceOf(Date);
      expect(info.fingerprint).toMatch(/^([0-9A-F]{2}:?)+$/);
    }, 10000);
  });

  describe("signing operations", () => {
    it("should sign data successfully", async () => {
      await mockHSM.ready;

      const testData = Buffer.from("test data to sign");
      const signature = await mockHSM.signData(testData);

      expect(Buffer.isBuffer(signature)).toBe(true);
      expect(signature.length).toBeGreaterThan(0);
    }, 10000);

    it("should sign base64 data successfully", async () => {
      await mockHSM.ready;

      const testData = "test data to sign";
      const testDataB64 = Buffer.from(testData).toString("base64");
      const signatureB64 = await mockHSM.signBase64(testDataB64); // <— use signBase64

      expect(typeof signatureB64).toBe("string");
      expect(signatureB64.length).toBeGreaterThan(0);
      expect(() => Buffer.from(signatureB64, "base64")).not.toThrow();
    }, 10000);

    it("should produce the same signature for the same data with PKCS#1 v1.5", async () => {
      await mockHSM.ready;

      const testData = Buffer.from("consistent test data");
      const signature1 = await mockHSM.signData(testData);
      const signature2 = await mockHSM.signData(testData);

      // RSA signatures include randomness in padding, so they should be different
      expect(signature1.length).toBe(signature2.length);
      expect(Buffer.compare(signature1, signature2)).toBe(0);
    }, 10000);

    it("should handle empty data", async () => {
      await mockHSM.ready;

      const emptyData = Buffer.alloc(0);
      await expect(mockHSM.signData(emptyData)).resolves.not.toThrow();
    }, 10000);
  });

  describe("persistence", () => {
    it("should persist and reload certificates", async () => {
      await mockHSM.ready;
      const firstCert = mockHSM.getSignerCertificatePem();

      // Create new instance with same cert directory
      const secondHSM = new MockHSMService({
        certDir: testCertDir,
        signerName: "Test Signer",
        organization: "Test Org",
      });

      await secondHSM.ready;
      const reloadedCert = secondHSM.getSignerCertificatePem();
      expect(reloadedCert).toBe(firstCert);
    }, 15000);
  });

  describe("keyUsage", () => {
    it("leaf KeyUsage is digitalSignature + nonRepudiation; intermediate is CA", async () => {
      const hsm = new MockHSMService();
      await hsm.ready;
      const leafPem = hsm.getSignerCertificatePem();
      const [interPem] = hsm.getCertificateChainPem(false);

      const der = Buffer.from(leafPem.replace(/-----.*?-----/g, "").replace(/\s+/g, ""), "base64");
      const asn = fromBER(der);
      const leaf = new Certificate({ schema: asn.result });

      const kuExt = leaf.extensions?.find((e) => e.extnID === "2.5.29.15");
      if (!kuExt) {
        throw new Error("KeyUsage extension not found");
      }

      const parsed = fromBER(kuExt.extnValue.valueBlock.valueHex);
      if (parsed.offset === -1) {
        throw new Error("Failed to parse KeyUsage extension");
      }

      const bitStr = parsed.result as BitString;
      if (!bitStr.valueBlock?.valueHex) {
        throw new Error("Invalid BitString structure in KeyUsage extension");
      }

      console.log(bitStr.valueBlock.valueHex);
      const keyUsageBytes = new Uint8Array(bitStr.valueBlock.valueHex);
      const last = keyUsageBytes[keyUsageBytes.length - 1];
      if (last === undefined) {
        throw new Error("KeyUsage extension has no data");
      }
      expect(!!(last & 0x80)).toBe(true); // digitalSignature
      expect(!!(last & 0x40)).toBe(true); // nonRepudiation

      // Intermediate CA
      const intDer = Buffer.from(
        interPem.replace(/-----.*?-----/g, "").replace(/\s+/g, ""),
        "base64",
      );
      const intCert = new Certificate({ schema: fromBER(intDer).result });
      const bcExt = intCert.extensions?.find((e) => e.extnID === "2.5.29.19");
      if (!bcExt) {
        throw new Error("BasicConstraints extension not found in intermediate certificate");
      }
      expect(bcExt.critical).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should throw error when accessing uninitialized signer certificate", () => {
      // Create a fresh instance without waiting for initialization
      const uninitializedHSM = new MockHSMService();

      expect(() => uninitializedHSM.getSignerCertificatePem()).toThrow("Mock HSM not initialized");
    });

    it("should throw error when signing without initialization", async () => {
      const uninitializedHSM = new MockHSMService();

      await expect(uninitializedHSM.signData(Buffer.from("test"))).rejects.toThrow(
        "Mock HSM not initialized",
      );
    });
  });
});
