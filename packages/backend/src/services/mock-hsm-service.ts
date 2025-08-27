/**
 * Mock HSM Service for development and testing
 *
 * Built on PKI.js + Node WebCrypto for proper certificate generation and RSA signing.
 * Generates a Root CA and a leaf "signer" certificate (RSA 2048, SHA-256) with
 * PKCS#8 PEM private key persistence.
 *
 * Key features:
 * - Self-signed certificate generation with proper X.509 structure
 * - RSASSA-PKCS1-v1_5 signing compatible with PAdES requirements
 * - Certificate persistence across service restarts
 * - Async initialization with explicit ready Promise
 * - Comprehensive logging integration
 *
 * @example
 * const mockHSM = new MockHSMService();
 * await mockHSM.ready;
 * const signature = await mockHSM.signData(dataToSign);
 */

import { createHash, webcrypto as nodeWebcrypto, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as asn1js from "asn1js";
import {
  AttributeTypeAndValue,
  BasicConstraints,
  Certificate,
  CryptoEngine,
  Extension,
  RelativeDistinguishedNames,
  Time,
  setEngine,
  getCrypto,
} from "pkijs";

import { logPAdES, padesBackendLogger } from "../logger";

/** ─────────── PKI.js engine setup (Node WebCrypto) ─────────── */
setEngine(
  "nodeEngine",
  new CryptoEngine({
    name: "nodeEngine",
    crypto: nodeWebcrypto as unknown as Crypto,
    subtle: nodeWebcrypto.subtle as unknown as SubtleCrypto,
  }),
);
/** ─────────────────────────────────────────────────────────── */

export interface MockCertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  keyUsage: string[]; // Human-readable key usage flags
  fingerprint: string; // SHA-256 hex with colons (e.g., "AA:BB:CC...")
}

export interface MockHSMConfig {
  keySize: number; // RSA modulus length in bits
  validityYears: number; // Certificate validity period
  certDir: string; // Directory to store generated certificates
  signerName: string; // Subject CN for the signing certificate
  organization: string; // Organization name in certificate subjects
  country: string; // Country code in certificate subjects
  hashAlgorithm: "SHA-256"; // Hash algorithm for signing (fixed for now)
}

const DEFAULTS: MockHSMConfig = {
  keySize: 2048,
  validityYears: 5,
  certDir: join(process.cwd(), "certificates"),
  signerName: "Dr. Mock Prescripteur",
  organization: "Demo Medical Center",
  country: "FR",
  hashAlgorithm: "SHA-256",
};

/**
 * Mock Hardware Security Module implementation
 *
 * Provides RSA-SHA256 signing capabilities with X.509 certificate generation
 * for development and testing environments. Not suitable for production use.
 */
export class MockHSMService {
  /**
   * Initialization promise - await this before using the service
   * @example await mockHSM.ready;
   */
  public readonly ready: Promise<void>;

  private _inited = false;
  private readonly cfg: MockHSMConfig;
  private readonly subtle = nodeWebcrypto.subtle;
  private readonly pki = getCrypto(true); // PKI.js crypto engine

  private rootCertPem?: string;
  private signerCertPem?: string;
  private rootKey?: CryptoKey;
  private signerKey?: CryptoKey;

  /**
   * Create a new Mock HSM instance
   * @param cfg Partial configuration (merged with defaults)
   */
  constructor(cfg: Partial<MockHSMConfig> = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };

    // Ensure certificate directory exists
    if (!existsSync(this.cfg.certDir)) {
      mkdirSync(this.cfg.certDir, { recursive: true });

      const entry = padesBackendLogger.createLogEntry(
        "info",
        "mock-hsm",
        "Created certificate directory",
        { certDir: this.cfg.certDir },
      );
      logPAdES(entry);
    }

    // Start async initialization
    this.ready = this.init();
  }

  /**
   * Check if the Mock HSM is fully initialized and ready to use
   * @returns true if initialization completed successfully
   */
  isInitialized(): boolean {
    return this._inited;
  }

  /**
   * Get the signing certificate in PEM format
   * @throws Error if not initialized
   * @returns PEM-encoded X.509 certificate
   */
  getSignerCertificatePem(): string {
    this.ensureReady();
    return this.signerCertPem!;
  }

  /**
   * Get the certificate chain for validation
   * @param includeRoot Whether to include root CA certificate
   * @returns Array of PEM-encoded certificates (leaf first, then CA)
   */
  getCertificateChainPem(includeRoot = true): string[] {
    this.ensureReady();
    return includeRoot ? [this.signerCertPem!, this.rootCertPem!] : [this.signerCertPem!];
  }

  /**
   * Get detailed certificate information
   * @throws Error if not initialized
   * @returns Structured certificate metadata
   */
  getCertificateInfo(): MockCertificateInfo {
    this.ensureReady();

    try {
      // Use Node's built-in X509Certificate parser for reliable extraction
      const x509 = new X509Certificate(this.signerCertPem!);
      const fp = this.sha256Colon(Buffer.from(x509.raw));

      return {
        subject: x509.subject, // e.g. "CN=Dr. Mock Prescripteur, O=Demo Medical Center, C=FR"
        issuer: x509.issuer,
        serialNumber: x509.serialNumber,
        validFrom: new Date(x509.validFrom),
        validTo: new Date(x509.validTo),
        // We know what we set in the KeyUsage extension for the leaf certificate
        keyUsage: ["digitalSignature", "nonRepudiation"],
        fingerprint: fp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const entry = padesBackendLogger.createLogEntry(
        "error",
        "mock-hsm",
        `Failed to parse certificate info: ${errorMessage}`,
      );
      logPAdES(entry);
      throw new Error(`Certificate parsing failed: ${errorMessage}`);
    }
  }

  /**
   * Sign arbitrary data using RSASSA-PKCS1-v1_5 with SHA-256
   * @param data Data to sign (Buffer or Uint8Array)
   * @throws Error if not initialized
   * @returns Promise resolving to signature bytes
   */
  async signData(data: Uint8Array | Buffer): Promise<Buffer> {
    this.ensureReady();

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    const entry = padesBackendLogger.createLogEntry(
      "info",
      "mock-hsm",
      "Signing data with RSA-SHA256",
      { dataSize: bytes.length },
    );
    logPAdES(entry);

    try {
      const sig = await this.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, this.signerKey!, bytes);

      const signature = Buffer.from(sig);

      const successEntry = padesBackendLogger.createLogEntry(
        "success",
        "mock-hsm",
        "Data signed successfully",
        {
          signatureSize: signature.length,
          algorithm: "RSA-SHA256",
        },
      );
      logPAdES(successEntry);

      return signature;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown signing error";

      const errorEntry = padesBackendLogger.createLogEntry(
        "error",
        "mock-hsm",
        `RSA signing failed: ${errorMessage}`,
      );
      logPAdES(errorEntry);

      throw new Error(`Signing operation failed: ${errorMessage}`);
    }
  }

  /**
   * Sign base64-encoded data (convenience method)
   * @param b64 Base64-encoded data to sign
   * @returns Promise resolving to base64-encoded signature
   */
  async signBase64(b64: string): Promise<string> {
    try {
      const data = Buffer.from(b64, "base64");
      const sig = await this.signData(data);
      return sig.toString("base64");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Base64 signing failed: ${errorMessage}`);
    }
  }

  /**
   * Sign DER-encoded signed attributes (PAdES-specific method)
   * @param der DER-encoded signed attributes from CMS structure
   * @returns Promise resolving to signature bytes
   */
  async signSignedAttributesDER(der: Uint8Array): Promise<Buffer> {
    const entry = padesBackendLogger.createLogEntry(
      "info",
      "mock-hsm",
      "Signing PAdES signed attributes",
      { derSize: der.length },
    );
    logPAdES(entry);

    return this.signData(der);
  }

  // ─────────────────── Private Implementation ─────────────────

  /**
   * Async initialization - load existing certificates or generate new ones
   */
  private async init(): Promise<void> {
    const initEntry = padesBackendLogger.createLogEntry(
      "info",
      "mock-hsm",
      "Initializing Mock HSM service",
      {
        keySize: this.cfg.keySize,
        validityYears: this.cfg.validityYears,
        certDir: this.cfg.certDir,
      },
    );
    logPAdES(initEntry);

    const paths = {
      rootCert: join(this.cfg.certDir, "mock-root-cert.pem"),
      signerCert: join(this.cfg.certDir, "mock-signer-cert.pem"),
      rootKeyPem: join(this.cfg.certDir, "mock-root-key.pem"), // PKCS#8
      signerKeyPem: join(this.cfg.certDir, "mock-signer-key.pem"), // PKCS#8
    };

    const haveAll =
      existsSync(paths.rootCert) &&
      existsSync(paths.signerCert) &&
      existsSync(paths.rootKeyPem) &&
      existsSync(paths.signerKeyPem);

    if (haveAll) {
      try {
        await this.loadExistingCertificates(paths);

        const loadEntry = padesBackendLogger.createLogEntry(
          "success",
          "mock-hsm",
          "Loaded existing certificates from disk",
        );
        logPAdES(loadEntry);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        const warnEntry = padesBackendLogger.createLogEntry(
          "warning",
          "mock-hsm",
          `Failed to load existing certificates, regenerating: ${errorMessage}`,
        );
        logPAdES(warnEntry);

        // Fall through to generation
        await this.generateAndPersist(paths);
      }
    } else {
      await this.generateAndPersist(paths);
    }

    this._inited = true;

    const readyEntry = padesBackendLogger.createLogEntry(
      "success",
      "mock-hsm",
      "Mock HSM initialization completed",
      { signerSubject: this.getCertificateInfo().subject },
    );
    logPAdES(readyEntry);
  }

  /**
   * Load certificates and keys from disk
   */
  private async loadExistingCertificates(paths: {
    rootCert: string;
    signerCert: string;
    rootKeyPem: string;
    signerKeyPem: string;
  }): Promise<void> {
    this.rootCertPem = readFileSync(paths.rootCert, "utf8");
    this.signerCertPem = readFileSync(paths.signerCert, "utf8");
    this.rootKey = await this.importPkcs8(readFileSync(paths.rootKeyPem, "utf8"));
    this.signerKey = await this.importPkcs8(readFileSync(paths.signerKeyPem, "utf8"));
  }

  /**
   * Generate new certificate hierarchy and persist to disk
   */
  private async generateAndPersist(paths: {
    rootCert: string;
    signerCert: string;
    rootKeyPem: string;
    signerKeyPem: string;
  }): Promise<void> {
    const genEntry = padesBackendLogger.createLogEntry(
      "info",
      "mock-hsm",
      "Generating new certificate hierarchy",
      { algorithm: "RSA-SHA256", keySize: this.cfg.keySize },
    );
    logPAdES(genEntry);

    const rsaParams: RsaHashedKeyGenParams = {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: this.cfg.keySize,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: this.cfg.hashAlgorithm,
    };

    // Generate key pairs
    const rootKeys = (await this.subtle.generateKey(rsaParams, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const leafKeys = (await this.subtle.generateKey(rsaParams, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;

    const now = new Date();
    const notAfter = new Date(now.getTime() + this.cfg.validityYears * 365 * 24 * 60 * 60 * 1000);

    const rootDN = `CN=Mock Root CA, O=${this.cfg.organization}, C=${this.cfg.country}`;
    const leafDN = `CN=${this.cfg.signerName}, O=${this.cfg.organization}, C=${this.cfg.country}`;

    // Generate certificates
    const rootCert = await this.createCertificate({
      subject: rootDN,
      issuer: rootDN, // Self-signed
      serialNumber: 1,
      notBefore: now,
      notAfter,
      keyPair: rootKeys,
      signingKey: rootKeys.privateKey,
      isCA: true,
    });

    const leafCert = await this.createCertificate({
      subject: leafDN,
      issuer: rootDN,
      serialNumber: 0x012345, // Fixed serial number for consistency
      notBefore: now,
      notAfter,
      keyPair: leafKeys,
      signingKey: rootKeys.privateKey, // Signed by root CA
      isCA: false,
    });

    // Convert to PEM and persist
    this.rootCertPem = this.certToPem(rootCert);
    this.signerCertPem = this.certToPem(leafCert);
    writeFileSync(paths.rootCert, this.rootCertPem);
    writeFileSync(paths.signerCert, this.signerCertPem);

    // Export and persist private keys as PKCS#8 PEM
    const rootPkcs8 = await this.subtle.exportKey("pkcs8", rootKeys.privateKey);
    const leafPkcs8 = await this.subtle.exportKey("pkcs8", leafKeys.privateKey);
    writeFileSync(paths.rootKeyPem, this.toPem("PRIVATE KEY", rootPkcs8));
    writeFileSync(paths.signerKeyPem, this.toPem("PRIVATE KEY", leafPkcs8));

    // Keep imported keys in memory for signing
    this.rootKey = rootKeys.privateKey;
    this.signerKey = leafKeys.privateKey;

    const persistEntry = padesBackendLogger.createLogEntry(
      "success",
      "mock-hsm",
      "Generated and persisted new certificate hierarchy",
    );
    logPAdES(persistEntry);
  }

  /**
   * Create an X.509 certificate using PKI.js
   */
  private async createCertificate(params: {
    keyPair: CryptoKeyPair;
    signingKey: CryptoKey;
    subject: string;
    issuer: string;
    serialNumber: number;
    notBefore: Date;
    notAfter: Date;
    isCA: boolean;
  }): Promise<Certificate> {
    const cert = new Certificate();
    cert.version = 2; // X.509 v3
    cert.serialNumber = new asn1js.Integer({ value: params.serialNumber });
    cert.issuer = this.rdn(params.issuer);
    cert.subject = this.rdn(params.subject);
    cert.notBefore = new Time({ value: params.notBefore });
    cert.notAfter = new Time({ value: params.notAfter });
    await cert.subjectPublicKeyInfo.importKey(params.keyPair.publicKey);

    // Set up X.509v3 extensions
    let keyUsageBits = 0;
    if (params.isCA) {
      keyUsageBits |= 0x04; // keyCertSign (bit 2)
      keyUsageBits |= 0x02; // cRLSign (bit 1)
    } else {
      keyUsageBits |= 0x80; // digitalSignature (bit 7)
      keyUsageBits |= 0x40; // nonRepudiation/contentCommitment (bit 6)
    }

    cert.extensions = [
      new Extension({
        extnID: "2.5.29.19", // BasicConstraints
        critical: true,
        extnValue: new BasicConstraints({
          cA: params.isCA,
          pathLenConstraint: params.isCA ? 0 : undefined,
        })
          .toSchema()
          .toBER(false),
      }),
      new Extension({
        extnID: "2.5.29.15", // KeyUsage
        critical: true,
        extnValue: new asn1js.BitString({
          valueHex: new Uint8Array([0, keyUsageBits]).buffer,
        }).toBER(false),
      }),
    ];

    // Sign the certificate
    await cert.sign(params.signingKey, this.cfg.hashAlgorithm, this.pki);
    return cert;
  }

  /**
   * Parse Distinguished Name string into PKI.js structure
   * @param dn Distinguished name string (e.g., "CN=Test, O=Org, C=US")
   */
  private rdn(dn: string): RelativeDistinguishedNames {
    const rdn = new RelativeDistinguishedNames();
    for (const kv of dn.split(",").map((s) => s.trim())) {
      const [kRaw, v] = kv.split("=").map((s) => s.trim());
      const k = kRaw?.toUpperCase();

      // Map common RDN types to OIDs
      const oid =
        k === "CN"
          ? "2.5.4.3" // commonName
          : k === "O"
            ? "2.5.4.10" // organizationName
            : k === "C"
              ? "2.5.4.6" // countryName
              : k === "OU"
                ? "2.5.4.11" // organizationalUnitName
                : undefined;

      if (!oid || !v) continue;

      rdn.typesAndValues.push(
        new AttributeTypeAndValue({
          type: oid,
          value: new asn1js.Utf8String({ value: v }),
        }),
      );
    }
    return rdn;
  }

  /**
   * Ensure the service is initialized before use
   */
  private ensureReady(): void {
    if (!this._inited) {
      throw new Error("Mock HSM not initialized - await mockHSM.ready before use");
    }
  }

  /**
   * Import PKCS#8 PEM private key for signing
   */
  private importPkcs8(pem: string): Promise<CryptoKey> {
    const der = this.fromPem(pem);
    return this.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: this.cfg.hashAlgorithm },
      true,
      ["sign"],
    );
  }

  /**
   * Convert PKI.js Certificate to PEM string
   */
  private certToPem(cert: Certificate): string {
    const der = Buffer.from(cert.toSchema().toBER(false));
    return this.toPem("CERTIFICATE", der);
  }

  /**
   * Convert binary data to PEM format
   */
  private toPem(label: string, data: ArrayBuffer | Buffer): string {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const b64 =
      buf
        .toString("base64")
        .match(/.{1,64}/g)
        ?.join("\n") ?? buf.toString("base64");
    return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
  }

  /**
   * Extract binary data from PEM format
   */
  private fromPem(pem: string): Buffer {
    const b64 = pem
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, "");
    return Buffer.from(b64, "base64");
  }

  /**
   * Calculate SHA-256 fingerprint with colon separators
   */
  private sha256Colon(der: Buffer): string {
    return (
      createHash("sha256").update(der).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? ""
    );
  }
}
