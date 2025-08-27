/**
 * PAdES Compliance Checker for ETSI EN 319 142-1
 *
 * Validates PDF signatures against PAdES baseline profile requirements.
 * Provides detailed compliance reporting for B-B and B-T signature levels.
 */

import * as asn1js from "asn1js";
import { Certificate, SignedData, SignerInfo, ContentInfo } from "pkijs";

import type { LogEntry } from "@pades-poc/shared";

export interface ComplianceCheck {
  requirement: string;
  satisfied: boolean;
  level: "mandatory" | "recommended" | "optional";
  details?: string;
}

export interface PAdESComplianceResult {
  isCompliant: boolean;
  signatureLevel: "B-B" | "B-T" | "UNKNOWN";
  profile: "Baseline" | "Unknown";
  checks: ComplianceCheck[];
  summary: {
    mandatoryPassed: number;
    mandatoryTotal: number;
    recommendedPassed: number;
    recommendedTotal: number;
  };
}

/**
 * Comprehensive PAdES compliance checker according to ETSI EN 319 142-1
 */
export class PAdESComplianceChecker {
  /**
   * Check PAdES compliance for a signed PDF
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async checkCompliance(
    signedData: SignedData,
    signerInfo: SignerInfo,
    isTimestamped: boolean,
    signatureValid: boolean,
    digestMatches: boolean,
    chainValid: boolean,
    logs?: LogEntry[],
  ): Promise<PAdESComplianceResult> {
    const checks: ComplianceCheck[] = [];

    logs?.push({
      timestamp: new Date().toISOString(),
      level: "debug",
      source: "backend",
      message: "Starting PAdES compliance validation",
      context: { isTimestamped, signatureValid, digestMatches, chainValid },
    });

    // 1. Basic signature validation
    this.checkBasicSignatureRequirements(checks, signatureValid, digestMatches, chainValid);

    // 2. CMS structure validation
    this.checkCMSStructure(checks, signedData, signerInfo);

    // 3. Signed attributes validation
    this.checkSignedAttributes(checks, signerInfo);

    // 4. Certificate requirements
    this.checkCertificateRequirements(checks, signedData);

    // 5. Timestamp requirements (for B-T)
    if (isTimestamped) {
      this.checkTimestampRequirements(checks, signerInfo);
    }

    // 6. Forbidden elements
    this.checkForbiddenElements(checks, signerInfo);

    // Calculate summary
    const summary = this.calculateSummary(checks);
    const isCompliant = summary.mandatoryPassed === summary.mandatoryTotal && signatureValid;
    const signatureLevel = isTimestamped ? "B-T" : "B-B";

    logs?.push({
      timestamp: new Date().toISOString(),
      level: isCompliant ? "success" : "warning",
      source: "backend",
      message: `PAdES compliance check completed: ${isCompliant ? "COMPLIANT" : "NON-COMPLIANT"}`,
      context: {
        signatureLevel,
        mandatoryPassed: summary.mandatoryPassed,
        mandatoryTotal: summary.mandatoryTotal,
        totalChecks: checks.length,
      },
    });

    return {
      isCompliant,
      signatureLevel,
      profile: "Baseline",
      checks,
      summary,
    };
  }

  /**
   * Check basic signature validation requirements
   */
  private checkBasicSignatureRequirements(
    checks: ComplianceCheck[],
    signatureValid: boolean,
    digestMatches: boolean,
    chainValid: boolean,
  ): void {
    checks.push({
      requirement: "Cryptographic signature must be valid",
      satisfied: signatureValid,
      level: "mandatory",
      details: signatureValid
        ? "RSA-SHA256 signature verification successful"
        : "Signature verification failed",
    });

    checks.push({
      requirement: "Document integrity must be preserved (messageDigest)",
      satisfied: digestMatches,
      level: "mandatory",
      details: digestMatches
        ? "PDF ByteRange digest matches messageDigest attribute"
        : "PDF content has been modified after signing",
    });

    checks.push({
      requirement: "Certificate chain must be valid",
      satisfied: chainValid,
      level: "mandatory",
      details: chainValid
        ? "Certificate chain validation successful"
        : "Certificate chain validation failed",
    });
  }

  /**
   * Check CMS SignedData structure requirements
   */
  private checkCMSStructure(
    checks: ComplianceCheck[],
    signedData: SignedData,
    signerInfo: SignerInfo,
  ): void {
    // Check SignedData version
    const correctVersion = signedData.version === 1;
    checks.push({
      requirement: "SignedData version must be 1",
      satisfied: correctVersion,
      level: "mandatory",
      details: `SignedData version: ${signedData.version}`,
    });

    // Check detached signature
    const isDetached = !signedData.encapContentInfo.eContent;
    checks.push({
      requirement: "Signature must be detached (no eContent)",
      satisfied: isDetached,
      level: "mandatory",
      details: isDetached ? "Detached signature confirmed" : "Signature is not detached",
    });

    // Check eContentType is id-data
    const hasCorrectContentType =
      signedData.encapContentInfo.eContentType === "1.2.840.113549.1.7.1";
    checks.push({
      requirement: "eContentType must be id-data",
      satisfied: hasCorrectContentType,
      level: "mandatory",
      details: `eContentType: ${signedData.encapContentInfo.eContentType}`,
    });

    // Check SignerInfo version
    const correctSignerVersion = signerInfo.version === 1;
    checks.push({
      requirement: "SignerInfo version must be 1",
      satisfied: correctSignerVersion,
      level: "mandatory",
      details: `SignerInfo version: ${signerInfo.version}`,
    });

    // Check digest algorithm
    const digestAlgOid = signerInfo.digestAlgorithm.algorithmId;
    const isSha256 = digestAlgOid === "2.16.840.1.101.3.4.2.1";
    checks.push({
      requirement: "Digest algorithm should be SHA-256 or stronger",
      satisfied: isSha256,
      level: "recommended",
      details: `Digest algorithm: ${digestAlgOid}`,
    });
  }

  /**
   * Check mandatory signed attributes
   */
  private checkSignedAttributes(checks: ComplianceCheck[], signerInfo: SignerInfo): void {
    if (!signerInfo.signedAttrs) {
      checks.push({
        requirement: "SignedAttributes must be present",
        satisfied: false,
        level: "mandatory",
        details: "No signed attributes found",
      });
      return;
    }

    const attributes = signerInfo.signedAttrs.attributes;

    // Check contentType attribute
    const contentTypeAttr = attributes.find((a) => a.type === "1.2.840.113549.1.9.3");
    const hasContentType = !!contentTypeAttr;
    checks.push({
      requirement: "contentType signed attribute must be present",
      satisfied: hasContentType,
      level: "mandatory",
      details: hasContentType
        ? "contentType attribute found"
        : "Missing mandatory contentType attribute",
    });

    // Check messageDigest attribute
    const messageDigestAttr = attributes.find((a) => a.type === "1.2.840.113549.1.9.4");
    const hasMessageDigest = !!messageDigestAttr;
    checks.push({
      requirement: "messageDigest signed attribute must be present",
      satisfied: hasMessageDigest,
      level: "mandatory",
      details: hasMessageDigest
        ? "messageDigest attribute found"
        : "Missing mandatory messageDigest attribute",
    });

    // Check signingCertificateV2 attribute (recommended for PAdES)
    const signingCertV2Attr = attributes.find((a) => a.type === "1.2.840.113549.1.9.16.2.47");
    const hasSigningCertV2 = !!signingCertV2Attr;
    checks.push({
      requirement: "signingCertificateV2 signed attribute should be present",
      satisfied: hasSigningCertV2,
      level: "recommended",
      details: hasSigningCertV2
        ? "signingCertificateV2 attribute found"
        : "Missing recommended signingCertificateV2 attribute",
    });

    // Validate contentType value
    if (contentTypeAttr && contentTypeAttr.values[0]) {
      const ctValue = contentTypeAttr.values[0] as asn1js.BaseBlock;
      const isIdData =
        ctValue instanceof asn1js.ObjectIdentifier &&
        ctValue.valueBlock.toString() === "1.2.840.113549.1.7.1";
      checks.push({
        requirement: "contentType attribute value must be id-data",
        satisfied: isIdData,
        level: "mandatory",
        details: isIdData ? "contentType value is id-data" : "contentType value is not id-data",
      });
    }
  }

  /**
   * Check certificate requirements
   */
  private checkCertificateRequirements(checks: ComplianceCheck[], signedData: SignedData): void {
    const hasCertificates =
      Array.isArray(signedData.certificates) && signedData.certificates.length > 0;
    checks.push({
      requirement: "Signer certificate must be included in SignedData",
      satisfied: hasCertificates,
      level: "mandatory",
      details: hasCertificates
        ? `${signedData.certificates?.length || 0} certificates included`
        : "No certificates found in SignedData",
    });

    if (hasCertificates) {
      const signerCert = signedData.certificates?.find((cert) => cert instanceof Certificate);
      if (signerCert instanceof Certificate) {
        // Check key usage
        const keyUsageExt = signerCert.extensions?.find((ext) => ext.extnID === "2.5.29.15");
        if (keyUsageExt) {
          try {
            const keyUsageBits = new asn1js.BitString({
              valueHex: keyUsageExt.extnValue.valueBlock.valueHex,
            });
            const bitsArr = new Uint8Array(keyUsageBits.valueBlock.valueHex);
            const bits = bitsArr.length > 0 ? bitsArr[bitsArr.length - 1] : 0;

            const hasDigitalSignature = !!(bits & 0x80);
            const hasNonRepudiation = !!(bits & 0x40);

            checks.push({
              requirement:
                "Signer certificate must have digitalSignature or nonRepudiation key usage",
              satisfied: hasDigitalSignature || hasNonRepudiation,
              level: "mandatory",
              details: `Key usage bits: digitalSignature=${hasDigitalSignature}, nonRepudiation=${hasNonRepudiation}`,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            checks.push({
              requirement: "Signer certificate key usage must be parseable",
              satisfied: false,
              level: "mandatory",
              details: `Failed to parse key usage extension: ${errorMessage}`,
            });
          }
        } else {
          checks.push({
            requirement: "Signer certificate should have key usage extension",
            satisfied: false,
            level: "recommended",
            details: "No key usage extension found",
          });
        }

        // Check certificate validity period
        const now = new Date();
        const isValid = now >= signerCert.notBefore.value && now <= signerCert.notAfter.value;
        checks.push({
          requirement: "Signer certificate must be valid at signing time",
          satisfied: isValid,
          level: "mandatory",
          details: `Certificate validity: ${signerCert.notBefore.value.toISOString()} to ${signerCert.notAfter.value.toISOString()}`,
        });
      }
    }
  }

  /**
   * Check timestamp requirements for B-T level
   */
  private checkTimestampRequirements(checks: ComplianceCheck[], signerInfo: SignerInfo): void {
    if (!signerInfo.unsignedAttrs) {
      checks.push({
        requirement: "Timestamp token must be present for PAdES-B-T",
        satisfied: false,
        level: "mandatory",
        details: "No unsigned attributes found",
      });
      return;
    }

    const tsAttr = signerInfo.unsignedAttrs.attributes.find(
      (a) => a.type === "1.2.840.113549.1.9.16.2.14",
    );
    const hasTimestamp = !!tsAttr;

    checks.push({
      requirement: "signatureTimeStampToken unsigned attribute must be present for B-T",
      satisfied: hasTimestamp,
      level: "mandatory",
      details: hasTimestamp
        ? "Timestamp token found in unsigned attributes"
        : "Missing timestamp token for PAdES-B-T level",
    });

    if (hasTimestamp && tsAttr?.values[0]) {
      // Basic timestamp token structure validation
      try {
        let tokenSchema: asn1js.BaseBlock | undefined;
        const tsValue = tsAttr.values[0] as asn1js.BaseBlock;

        if (tsValue instanceof asn1js.Sequence) {
          tokenSchema = tsValue;
        } else if (tsValue instanceof asn1js.OctetString) {
          const parsed = asn1js.fromBER(tsValue.valueBlock.valueHex);
          if (parsed.offset !== -1) {
            tokenSchema = parsed.result;
          }
        }

        if (tokenSchema) {
          const timestampToken = new ContentInfo({ schema: tokenSchema });
          const isSignedData = timestampToken.contentType === "1.2.840.113549.1.7.2";

          checks.push({
            requirement: "Timestamp token must be valid CMS SignedData",
            satisfied: isSignedData,
            level: "mandatory",
            details: isSignedData
              ? "Timestamp token is valid SignedData"
              : "Timestamp token is not SignedData",
          });
        } else {
          checks.push({
            requirement: "Timestamp token must be parseable ASN.1",
            satisfied: false,
            level: "mandatory",
            details: "Failed to parse timestamp token ASN.1 structure",
          });
        }
      } catch (e) {
        checks.push({
          requirement: "Timestamp token must be valid",
          satisfied: false,
          level: "mandatory",
          details: `Timestamp validation error: ${e instanceof Error ? e.message : "Unknown error"}`,
        });
      }
    }
  }

  /**
   * Check for forbidden elements in PAdES baseline profiles
   */
  private checkForbiddenElements(checks: ComplianceCheck[], signerInfo: SignerInfo): void {
    if (signerInfo.signedAttrs) {
      // Check for forbidden signingTime attribute in signed attributes
      const signingTimeAttr = signerInfo.signedAttrs.attributes.find(
        (a) => a.type === "1.2.840.113549.1.9.5",
      );
      const hasSigningTime = !!signingTimeAttr;

      checks.push({
        requirement: "signingTime signed attribute must not be present (PAdES baseline)",
        satisfied: !hasSigningTime,
        level: "mandatory",
        details: hasSigningTime
          ? "Forbidden signingTime attribute found in signed attributes"
          : "No forbidden signingTime attribute found",
      });
    }

    // Check for proper signature algorithm
    const sigAlgOid = signerInfo.signatureAlgorithm.algorithmId;
    const isRsaSha256 = sigAlgOid === "1.2.840.113549.1.1.11";
    const isStrongAlg =
      isRsaSha256 ||
      sigAlgOid === "1.2.840.113549.1.1.12" || // SHA384withRSA
      sigAlgOid === "1.2.840.113549.1.1.13"; // SHA512withRSA

    checks.push({
      requirement: "Signature algorithm should be RSA with SHA-256 or stronger",
      satisfied: isStrongAlg,
      level: "recommended",
      details: `Signature algorithm: ${sigAlgOid}`,
    });
  }

  /**
   * Calculate compliance summary
   */
  private calculateSummary(checks: ComplianceCheck[]): PAdESComplianceResult["summary"] {
    const summary = {
      mandatoryPassed: 0,
      mandatoryTotal: 0,
      recommendedPassed: 0,
      recommendedTotal: 0,
    };

    for (const check of checks) {
      if (check.level === "mandatory") {
        summary.mandatoryTotal++;
        if (check.satisfied) {
          summary.mandatoryPassed++;
        }
      } else if (check.level === "recommended") {
        summary.recommendedTotal++;
        if (check.satisfied) {
          summary.recommendedPassed++;
        }
      }
    }

    return summary;
  }
}
