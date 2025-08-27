import { beforeAll, describe, expect, it } from "vitest";

import { CertificateChainValidator } from "./certificate-chain-validator";
import { MockHSMService } from "./mock-hsm-service";

import type { LogEntry } from "@pades-poc/shared";

describe("CertificateChainValidator", () => {
  let mockHSM: MockHSMService;
  let validator: CertificateChainValidator;

  beforeAll(async () => {
    mockHSM = new MockHSMService();
    await mockHSM.ready;
    validator = new CertificateChainValidator();
  });

  describe("validateChain", () => {
    it("should validate a simple self-signed chain", async () => {
      // Get certificates from mock HSM
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const chainPems = mockHSM.getCertificateChainPem(true); // Include root

      // Parse certificates using the same method as verification service
      const pemToDer = (pem: string) => {
        const b64 = pem
          .replace(/-----BEGIN [^-]+-----/g, "")
          .replace(/-----END [^-]+-----/g, "")
          .replace(/\s+/g, "");
        return Buffer.from(b64, "base64");
      };

      const { fromBER } = await import("asn1js");
      const { Certificate } = await import("pkijs");

      const parsecert = (pem: string) => {
        const der = pemToDer(pem);
        const asn1 = fromBER(der);
        return new Certificate({ schema: asn1.result });
      };

      const signerCert = parsecert(signerCertPem);
      const certificates = [signerCert, ...chainPems.map(parsecert)];

      const logs: LogEntry[] = [];
      const result = await validator.validateChain(certificates, signerCert, logs);

      expect(result.isValid).toBe(true);
      expect(result.chainLength).toBeGreaterThan(0);
      expect(result.certificates).toHaveLength(result.chainLength);
      expect(result.certificates[0]?.subject).toContain("Mock Prescripteur");
      expect(result.reasons).toHaveLength(0);

      // Check that we got debug logs
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((log) => log.level === "debug")).toBe(true);
    });

    it("should detect invalid certificate chains", async () => {
      // Create a certificate with invalid signature by using mismatched certs
      const { Certificate, Time, TimeType, RelativeDistinguishedNames } = await import("pkijs");
      const { Integer } = await import("asn1js");

      // Create a mock invalid certificate structure
      const invalidCert = new Certificate();
      invalidCert.subject = new RelativeDistinguishedNames({
        typesAndValues: [],
        valueBeforeDecode: new ArrayBuffer(0),
      });
      invalidCert.issuer = new RelativeDistinguishedNames({
        typesAndValues: [],
        valueBeforeDecode: new ArrayBuffer(0),
      });
      invalidCert.serialNumber = new Integer({ valueHex: new ArrayBuffer(4) });
      invalidCert.notBefore = new Time({
        type: TimeType.GeneralizedTime,
        value: new Date("2020-01-01"),
      });
      invalidCert.notAfter = new Time({
        type: TimeType.GeneralizedTime,
        value: new Date("2019-01-01"),
      }); // Expired

      const result = await validator.validateChain([invalidCert], invalidCert);

      expect(result.isValid).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((reason) => reason.includes("not valid"))).toBe(true);
    });

    it("should check key usage requirements", async () => {
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const chainPems = mockHSM.getCertificateChainPem(true);

      const pemToDer = (pem: string) => {
        const b64 = pem
          .replace(/-----BEGIN [^-]+-----/g, "")
          .replace(/-----END [^-]+-----/g, "")
          .replace(/\s+/g, "");
        return Buffer.from(b64, "base64");
      };

      const { fromBER } = await import("asn1js");
      const { Certificate } = await import("pkijs");

      const parseCart = (pem: string) => {
        const der = pemToDer(pem);
        const asn1 = fromBER(der);
        return new Certificate({ schema: asn1.result });
      };

      const signerCert = parseCart(signerCertPem);
      const certificates = [signerCert, ...chainPems.map(parseCart)];

      // Validate with key usage checking enabled
      const validatorWithKeyUsage = new CertificateChainValidator({
        checkKeyUsage: true,
      });

      const result = await validatorWithKeyUsage.validateChain(certificates, signerCert);

      expect(result.certificates[0]?.keyUsage).toBeDefined();
      expect(result.certificates[0]?.keyUsage).toContain("digitalSignature");
    });

    it("should handle maximum chain length limits", async () => {
      const signerCertPem = mockHSM.getSignerCertificatePem();
      const chainPems = mockHSM.getCertificateChainPem(true);

      const pemToDer = (pem: string) => {
        const b64 = pem
          .replace(/-----BEGIN [^-]+-----/g, "")
          .replace(/-----END [^-]+-----/g, "")
          .replace(/\s+/g, "");
        return Buffer.from(b64, "base64");
      };

      const { fromBER } = await import("asn1js");
      const { Certificate } = await import("pkijs");

      const parseCart = (pem: string) => {
        const der = pemToDer(pem);
        const asn1 = fromBER(der);
        return new Certificate({ schema: asn1.result });
      };

      const signerCert = parseCart(signerCertPem);
      const certificates = [signerCert, ...chainPems.map(parseCart)];

      // Set a very low chain length limit
      const validatorWithLimit = new CertificateChainValidator({
        maxChainLength: 1,
      });

      const result = await validatorWithLimit.validateChain(certificates, signerCert);

      expect(result.chainLength).toBeLessThanOrEqual(1);
    });
  });
});
