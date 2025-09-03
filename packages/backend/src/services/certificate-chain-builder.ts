/**
 * Certificate Chain Builder Service
 *
 * Automatically builds complete certificate chains by parsing AIA (Authority Information Access)
 * extensions and fetching intermediate certificates from CA issuers.
 */

import * as asn1js from "asn1js";
import { Certificate } from "pkijs";

import { logPAdES, padesBackendLogger } from "../logger";

import type { LogEntry } from "@pades-poc/shared";

export interface ChainBuildResult {
  certificateChain: string[]; // PEM format certificates
  success: boolean;
  errors: string[];
}

/**
 * Service for building complete certificate chains using AIA extensions
 */
export class CertificateChainBuilder {
  private readonly maxChainLength: number;
  private readonly fetchTimeout: number;

  constructor(maxChainLength = 10, fetchTimeoutMs = 10000) {
    this.maxChainLength = maxChainLength;
    this.fetchTimeout = fetchTimeoutMs;
  }

  /**
   * Build complete certificate chain starting from end-entity certificate
   */
  async buildChain(endEntityCertPem: string, logs?: LogEntry[]): Promise<ChainBuildResult> {
    const errors: string[] = [];
    const certificateChain: string[] = [endEntityCertPem];

    logs?.push({
      timestamp: new Date().toISOString(),
      level: "debug",
      source: "backend",
      message: "Starting certificate chain building with AIA",
      context: {
        endEntityCertLength: endEntityCertPem.length,
        maxChainLength: this.maxChainLength,
      },
    });

    try {
      let currentCertPem = endEntityCertPem;
      let chainLength = 1;

      while (chainLength < this.maxChainLength) {
        // Parse current certificate
        const currentCert = this.parseCertificate(currentCertPem);
        if (!currentCert) {
          errors.push(`Failed to parse certificate at chain position ${chainLength}`);
          break;
        }

        // Check if this is a self-signed root certificate
        if (this.isSelfSigned(currentCert)) {
          logs?.push({
            timestamp: new Date().toISOString(),
            level: "debug",
            source: "backend",
            message: "Reached self-signed root certificate",
            context: {
              chainLength,
              rootSubject: this.getSubjectCN(currentCert),
            },
          });
          break;
        }

        // Extract AIA extension
        const aiaUrls = this.extractAIAUrls(currentCert);
        if (aiaUrls.length === 0) {
          logs?.push({
            timestamp: new Date().toISOString(),
            level: "warning",
            source: "backend",
            message: "No AIA extension found, chain building incomplete",
            context: {
              chainLength,
              currentSubject: this.getSubjectCN(currentCert),
            },
          });
          break;
        }

        // Try to fetch issuer certificate from AIA URLs
        let issuerCertPem: string | null = null;
        for (const aiaUrl of aiaUrls) {
          try {
            issuerCertPem = await this.fetchCertificateFromAIA(aiaUrl, logs);
            if (issuerCertPem) {
              logs?.push({
                timestamp: new Date().toISOString(),
                level: "success",
                source: "backend",
                message: "Successfully fetched issuer certificate from AIA",
                context: {
                  aiaUrl,
                  chainLength: chainLength + 1,
                },
              });
              break;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push(`Failed to fetch from AIA URL ${aiaUrl}: ${errorMsg}`);
            logs?.push({
              timestamp: new Date().toISOString(),
              level: "warning",
              source: "backend",
              message: "Failed to fetch certificate from AIA URL",
              context: {
                aiaUrl,
                error: errorMsg,
              },
            });
          }
        }

        if (!issuerCertPem) {
          errors.push(`Could not fetch issuer certificate for chain position ${chainLength + 1}`);
          break;
        }

        // Verify the issuer certificate is valid
        const issuerCert = this.parseCertificate(issuerCertPem);
        if (!issuerCert) {
          errors.push(`Invalid issuer certificate fetched from AIA at position ${chainLength + 1}`);
          break;
        }

        // Verify this certificate actually issued the current one
        if (!this.verifiesIssuer(currentCert, issuerCert)) {
          errors.push(
            `Fetched certificate does not verify as issuer at position ${chainLength + 1}`,
          );
          break;
        }

        // Add to chain and continue
        certificateChain.push(issuerCertPem);
        currentCertPem = issuerCertPem;
        chainLength++;

        logs?.push({
          timestamp: new Date().toISOString(),
          level: "debug",
          source: "backend",
          message: "Added certificate to chain",
          context: {
            chainLength,
            issuerSubject: this.getSubjectCN(issuerCert),
          },
        });
      }

      const success = errors.length === 0 || chainLength > 1; // Success if we built at least some chain

      logs?.push({
        timestamp: new Date().toISOString(),
        level: success ? "success" : "warning",
        source: "backend",
        message: "Certificate chain building completed",
        context: {
          finalChainLength: chainLength,
          success,
          errorCount: errors.length,
        },
      });

      return {
        certificateChain,
        success,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Chain building failed: ${errorMsg}`);

      logs?.push({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "backend",
        message: "Certificate chain building failed",
        context: {
          error: errorMsg,
        },
      });

      return {
        certificateChain,
        success: false,
        errors,
      };
    }
  }

  /**
   * Parse PEM certificate to PKI.js Certificate object
   */
  private parseCertificate(certPem: string): Certificate | null {
    try {
      const certDer = this.pemToDer(certPem);
      const certAsn1 = asn1js.fromBER(certDer);
      if (certAsn1.offset === -1) return null;
      return new Certificate({ schema: certAsn1.result });
    } catch {
      return null;
    }
  }

  /**
   * Convert PEM to DER
   */
  private pemToDer(pem: string): Buffer {
    const b64 = pem
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, "");
    return Buffer.from(b64, "base64");
  }

  /**
   * Check if certificate is self-signed
   */
  private isSelfSigned(cert: Certificate): boolean {
    try {
      const subject = this.getDNString(cert.subject);
      const issuer = this.getDNString(cert.issuer);
      return subject === issuer;
    } catch {
      return false;
    }
  }

  /**
   * Extract AIA URLs from certificate extensions
   */
  private extractAIAUrls(cert: Certificate): string[] {
    const urls: string[] = [];

    try {
      if (!cert.extensions) return urls;

      // Find AIA extension (OID: 1.3.6.1.5.5.7.1.1)
      const aiaExt = cert.extensions.find((ext) => ext.extnID === "1.3.6.1.5.5.7.1.1");
      if (!aiaExt || !aiaExt.extnValue) return urls;

      // Parse AIA extension
      const aiaAsn1 = asn1js.fromBER(aiaExt.extnValue.valueBlock.valueHex);
      if (aiaAsn1.offset === -1) return urls;

      const aiaSequence = aiaAsn1.result as asn1js.Sequence;
      if (!aiaSequence.valueBlock?.value) return urls;

      // Extract CA Issuer URLs (accessMethod: 1.3.6.1.5.5.7.48.2)
      for (const accessDesc of aiaSequence.valueBlock.value) {
        if (!(accessDesc instanceof asn1js.Sequence)) continue;
        if (!accessDesc.valueBlock?.value || accessDesc.valueBlock.value.length < 2) continue;

        const accessMethod = accessDesc.valueBlock.value[0];
        const accessLocation = accessDesc.valueBlock.value[1];

        if (!(accessMethod instanceof asn1js.ObjectIdentifier)) continue;
        if (accessMethod.valueBlock.toString() !== "1.3.6.1.5.5.7.48.2") continue; // CA Issuer

        // Extract URL from GeneralName
        if (accessLocation instanceof asn1js.Primitive && accessLocation.idBlock.tagNumber === 6) {
          // uniformResourceIdentifier [6] IA5String
          const url = String.fromCharCode(...new Uint8Array(accessLocation.valueBlock.valueHex));
          if (url.startsWith("http://") || url.startsWith("https://")) {
            urls.push(url);
          }
        }
      }
    } catch (error) {
      logPAdES(
        padesBackendLogger.createLogEntry("warning", "backend", "Failed to parse AIA extension", {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }

    return urls;
  }

  /**
   * Fetch certificate from AIA URL
   */
  private async fetchCertificateFromAIA(url: string, logs?: LogEntry[]): Promise<string | null> {
    try {
      logs?.push({
        timestamp: new Date().toISOString(),
        level: "debug",
        source: "backend",
        message: "Fetching certificate from AIA URL",
        context: { url },
      });

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "PAdES-POC-CertificateChainBuilder/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Handle DER format (most common for AIA)
      if (
        contentType.includes("application/pkix-cert") ||
        contentType.includes("application/x-x509-ca-cert")
      ) {
        return this.derToPem(buffer);
      }

      // Handle PEM format
      if (contentType.includes("application/x-pem-file") || contentType.includes("text/plain")) {
        const pemContent = buffer.toString("utf8");
        if (pemContent.includes("-----BEGIN CERTIFICATE-----")) {
          return pemContent;
        }
      }

      // Try to parse as DER by default
      return this.derToPem(buffer);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logs?.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        source: "backend",
        message: "Failed to fetch certificate from AIA URL",
        context: { url, error: errorMsg },
      });
      return null;
    }
  }

  /**
   * Convert DER to PEM format
   */
  private derToPem(derBuffer: Buffer): string {
    const b64 = derBuffer.toString("base64");
    const pem = b64.match(/.{1,64}/g)?.join("\n") || b64;
    return `-----BEGIN CERTIFICATE-----\n${pem}\n-----END CERTIFICATE-----`;
  }

  /**
   * Verify that issuerCert issued subjectCert
   */
  private verifiesIssuer(subjectCert: Certificate, issuerCert: Certificate): boolean {
    try {
      const subjectIssuerDN = this.getDNString(subjectCert.issuer);
      const issuerSubjectDN = this.getDNString(issuerCert.subject);
      return subjectIssuerDN === issuerSubjectDN;
    } catch {
      return false;
    }
  }

  /**
   * Get Distinguished Name as string
   */
  private getDNString(dn: Certificate["subject"]): string {
    return dn.typesAndValues
      .map((tv) => {
        const type = this.getOidName(tv.type);
        const value = tv.value.valueBlock.value;
        return `${type}=${value}`;
      })
      .join(", ");
  }

  /**
   * Get common name for OID
   */
  private getOidName(oid: string): string {
    const oidMap: Record<string, string> = {
      "2.5.4.3": "CN",
      "2.5.4.6": "C",
      "2.5.4.7": "L",
      "2.5.4.8": "ST",
      "2.5.4.10": "O",
      "2.5.4.11": "OU",
    };
    return oidMap[oid] || oid;
  }

  /**
   * Get subject CN from certificate
   */
  private getSubjectCN(cert: Certificate): string {
    try {
      const cn = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3");
      return cn?.value.valueBlock.value || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
