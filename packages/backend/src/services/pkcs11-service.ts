/**
 * PKCS#11 Service for native CPS card integration
 *
 * This service provides direct PKCS#11 integration using pkcs11js, bypassing
 * the buggy Icanopee string-based API. It properly handles binary data for
 * signing operations as required by the PKCS#11 standard.
 */

import { promises as fs } from "fs";

import * as asn1js from "asn1js";
import * as pkcs11js from "pkcs11js";
import { Certificate } from "pkijs";

import type { LogEntry } from "@pades-poc/shared";

export interface PKCS11Config {
  /** Path to PKCS#11 library (e.g., cryptolib on macOS) */
  libraryPath: string;
  /** Slot index to use (defaults to 0) */
  slotIndex?: number;
  /** Token label to match (optional) */
  tokenLabel?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface PKCS11SlotInfo {
  slotId: number;
  description: string;
  manufacturerId: string;
  flags: number;
  tokenPresent: boolean;
  tokenInfo?: {
    label: string;
    manufacturerId: string;
    model: string;
    serialNumber: string;
  };
}

export interface PKCS11Certificate {
  handle: Buffer;
  label: string;
  id: Buffer;
  subject: string;
  issuer: string;
  serialNumber: string;
  certificatePem: string;
}

export interface PKCS11PrivateKey {
  handle: Buffer;
  label: string;
  id: Buffer;
  keyType: number;
  canSign: boolean;
}

export interface PKCS11SignResult {
  signature: Buffer;
  certificate: PKCS11Certificate;
  algorithm: string;
}

/**
 * PKCS#11 Service for direct hardware token integration
 */
export class PKCS11Service {
  private pkcs11: pkcs11js.PKCS11 | null = null;
  private session: Buffer | null = null;
  private initialized = false;
  private readonly config: Required<PKCS11Config>;

  constructor(config: PKCS11Config) {
    this.config = {
      slotIndex: 0,
      tokenLabel: "",
      debug: true,
      ...config,
    };
  }

  /**
   * Initialize PKCS#11 library and open session
   */
  async initialize(logs?: LogEntry[]): Promise<void> {
    if (this.initialized) return;

    this.log(logs, "info", "Initializing PKCS#11 library", { path: this.config.libraryPath });

    try {
      // Check if library exists
      try {
        await fs.access(this.config.libraryPath);
      } catch {
        throw new Error(`PKCS#11 library not found: ${this.config.libraryPath}`);
      }

      // Initialize library
      this.pkcs11 = new pkcs11js.PKCS11();
      this.pkcs11.load(this.config.libraryPath);
      this.pkcs11.C_Initialize();

      this.log(logs, "success", "PKCS#11 library loaded and initialized");

      // Get library info for logging
      const libInfo = this.pkcs11.C_GetInfo();
      this.log(logs, "debug", "PKCS#11 library info", {
        cryptokiVersion: libInfo.cryptokiVersion,
        manufacturerID: libInfo.manufacturerID,
        libraryDescription: libInfo.libraryDescription,
        libraryVersion: libInfo.libraryVersion,
      });

      this.initialized = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `PKCS#11 initialization failed: ${msg}`);
      throw new Error(`PKCS#11 initialization failed: ${msg}`);
    }
  }

  /**
   * Get available slots and token information
   */
  getSlots(logs?: LogEntry[]): PKCS11SlotInfo[] {
    if (!this.pkcs11) {
      throw new Error("PKCS#11 not initialized");
    }

    this.log(logs, "info", "Enumerating PKCS#11 slots");

    try {
      const slots = this.pkcs11.C_GetSlotList(true); // only slots with tokens
      const slotInfos: PKCS11SlotInfo[] = [];

      // DEBUG: Log the type and content of slots to validate our assumptions
      this.log(logs, "debug", "PKCS11 slots raw data", {
        slotsType: typeof slots,
        slotsLength: slots.length,
        firstSlotType: slots.length > 0 ? typeof slots[0] : "none",
        firstSlotValue: slots.length > 0 ? slots[0] : "none",
        isFirstSlotBuffer: slots.length > 0 ? Buffer.isBuffer(slots[0]) : false,
      });

      for (const slotId of slots) {
        // DEBUG: Log each slot's type and value
        this.log(logs, "debug", "Processing slot", {
          slotType: typeof slotId,
          slotValue: slotId,
          isBuffer: Buffer.isBuffer(slotId),
          slotToString: slotId.toString(),
        });

        try {
          // Convert Handle to number for interface compatibility first
          const slotIdNum = typeof slotId === "number" ? slotId : Buffer.isBuffer(slotId) ? slotId.readUInt32LE(0) : parseInt(String(slotId), 10);

          const slotInfo = this.pkcs11.C_GetSlotInfo(slotId);
          const tokenPresent = (slotInfo.flags & 0x00000001) !== 0; // CKF_TOKEN_PRESENT = 0x00000001

          let tokenInfo;
          if (tokenPresent) {
            try {
              tokenInfo = this.pkcs11.C_GetTokenInfo(slotId);
            } catch (tokenError) {
              this.log(logs, "warning", `Failed to get token info for slot ${slotIdNum}`, {
                error: tokenError instanceof Error ? tokenError.message : "Unknown",
              });
            }
          }

          const slotInfoResult = {
            slotId: slotIdNum,
            description: slotInfo.slotDescription?.trim() || "",
            manufacturerId: slotInfo.manufacturerID?.trim() || "",
            flags: slotInfo.flags,
            tokenPresent,
            tokenInfo: tokenInfo
              ? {
                  label: String(tokenInfo.label || "").trim(),
                  manufacturerId: String(tokenInfo.manufacturerId || "").trim(),
                  model: String(tokenInfo.model || "").trim(),
                  serialNumber: String(tokenInfo.serialNumber || "").trim(),
                }
              : undefined,
          };

          this.log(logs, "debug", "Slot info processed", {
            originalSlotId: slotId,
            convertedSlotId: slotIdNum,
            description: slotInfoResult.description,
            tokenPresent: slotInfoResult.tokenPresent,
            tokenLabel: slotInfoResult.tokenInfo?.label,
          });

          slotInfos.push(slotInfoResult);
        } catch (slotError) {
          const slotIdNum = typeof slotId === "number" ? slotId : Buffer.isBuffer(slotId) ? slotId.readUInt32LE(0) : parseInt(String(slotId), 10);
          this.log(logs, "warning", `Failed to get info for slot ${slotIdNum}`, {
            error: slotError instanceof Error ? slotError.message : String(slotError),
          });
        }
      }

      this.log(logs, "success", `Found ${slotInfos.length} PKCS#11 slots`, {
        slotsWithTokens: slotInfos.filter((s) => s.tokenPresent).length,
      });

      return slotInfos;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Failed to enumerate slots: ${msg}`);
      throw new Error(`Failed to enumerate slots: ${msg}`);
    }
  }

  /**
   * Open session with specified slot
   */
  openSession(slotId?: number, logs?: LogEntry[]): void {
    if (!this.pkcs11) {
      throw new Error("PKCS#11 not initialized");
    }

    const targetSlot = slotId ?? this.config.slotIndex;
    this.log(logs, "info", "Opening PKCS#11 session", { slotId: targetSlot });

    try {
      // Close existing session if any
      if (this.session) {
        try {
          this.pkcs11.C_CloseSession(this.session);
        } catch {
          // Ignore errors when closing old session
        }
      }

      // Open new session - convert number to Handle if needed
      const slotHandle = Buffer.alloc(8);
      slotHandle.writeUInt32LE(targetSlot, 0);
      this.session = this.pkcs11.C_OpenSession(slotHandle, 0x00000004 | 0x00000002); // CKF_SERIAL_SESSION | CKF_RW_SESSION

      this.log(logs, "success", "PKCS#11 session opened", { slotId: targetSlot });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Failed to open session: ${msg}`, { slotId: targetSlot });
      throw new Error(`Failed to open session with slot ${targetSlot}: ${msg}`);
    }
  }

  /**
   * Login to token with PIN
   */
  login(pin: string, logs?: LogEntry[]): void {
    if (!this.pkcs11 || !this.session) {
      throw new Error("PKCS#11 session not established");
    }

    this.log(logs, "info", "Logging into PKCS#11 token");

    try {
      this.pkcs11.C_Login(this.session, 1, pin); // CKU_USER = 1
      this.log(logs, "success", "Successfully logged into token");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Login failed: ${msg}`);
      throw new Error(`Token login failed: ${msg}`);
    }
  }

  /**
   * Find certificates on the token
   */
  findCertificates(logs?: LogEntry[]): PKCS11Certificate[] {
    if (!this.pkcs11 || !this.session) {
      throw new Error("PKCS#11 session not established");
    }

    this.log(logs, "info", "Searching for certificates on token");

    try {
      // Try different approaches to find certificates
      
      // Find certificate objects using the correct method
      this.pkcs11.C_FindObjectsInit(this.session, [
        { type: 0x00000000, value: 1 }, // CKA_CLASS = CKO_CERTIFICATE
      ]);

      const rawHandles = this.pkcs11.C_FindObjects(this.session);
      this.pkcs11.C_FindObjectsFinal(this.session);

      this.log(logs, "debug", "Certificate search raw result", {
        type: typeof rawHandles,
        isBuffer: Buffer.isBuffer(rawHandles),
        length: rawHandles ? rawHandles.length : 0,
        raw: rawHandles
      });

      // Parse the handles - C_FindObjects returns a Buffer containing concatenated handles
      // Each handle is 8 bytes
      let certHandles: Buffer[] = [];
      
      if (Buffer.isBuffer(rawHandles) && rawHandles.length > 0) {
        const handleCount = rawHandles.length / 8;
        this.log(logs, "debug", "Parsing certificate handles", {
          bufferLength: rawHandles.length,
          handleCount: handleCount
        });
        
        for (let i = 0; i < handleCount; i++) {
          const handle = rawHandles.subarray(i * 8, (i + 1) * 8);
          certHandles.push(handle);
          
          this.log(logs, "debug", `Certificate handle ${i}`, {
            handle: handle,
            hex: handle.toString('hex')
          });
        }
      } else if (Array.isArray(rawHandles)) {
        // In case it's returned as an array
        certHandles = rawHandles;
      }

      const certificates: PKCS11Certificate[] = [];

      if (certHandles && certHandles.length > 0) {
        for (const handle of certHandles) {
          try {
            this.log(logs, "debug", "Processing certificate", {
              handleType: typeof handle,
              handleLength: Buffer.isBuffer(handle) ? handle.length : "N/A",
              handle: handle
            });

            // First, verify this is actually a certificate by checking its class
            let classAttrs;
            try {
              classAttrs = this.pkcs11.C_GetAttributeValue(
                this.session,
                handle,
                [{ type: 0x00000000 }] // CKA_CLASS
              );
              const objClass = classAttrs[0].value.readUInt32LE(0);
              this.log(logs, "debug", "Object class check", {
                class: objClass,
                isCertificate: objClass === 1,
                isPrivateKey: objClass === 3,
                isPublicKey: objClass === 2
              });
              
              if (objClass !== 1) {
                this.log(logs, "debug", "Skipping non-certificate object", { class: objClass });
                continue;
              }
            } catch (classError) {
              this.log(logs, "warning", "Failed to get object class", {
                error: classError instanceof Error ? classError.message : "Unknown"
              });
              continue;
            }

            // Try getting certificate attributes with correct PKCS#11 constants
            const attrs = this.pkcs11.C_GetAttributeValue(
              this.session,
              handle,
              [
                { type: 0x00000011 }, // CKA_VALUE = 0x11
                { type: 0x00000003 }, // CKA_LABEL = 0x03  
                { type: 0x00000102 }, // CKA_ID = 0x102
              ],
            );

            const certDer = attrs[0].value;
            const label = attrs[1].value.toString().trim();
            const id = attrs[2].value;

            // Parse certificate using PKI.js
            const certAsn1 = asn1js.fromBER(certDer);
            if (certAsn1.offset === -1) {
              this.log(logs, "warning", "Invalid certificate DER encoding", { label });
              continue;
            }

            const cert = new Certificate({ schema: certAsn1.result });
            const subject = this.extractDN(cert.subject);
            const issuer = this.extractDN(cert.issuer);
            const serialNumber = Buffer.from(cert.serialNumber.valueBlock.valueHex).toString("hex");

            // Convert to PEM
            const certPem = this.derToPem(certDer, "CERTIFICATE");

            certificates.push({
              handle: handle, // handle is already a properly formatted Buffer
              label,
              id,
              subject,
              issuer,
              serialNumber,
              certificatePem: certPem,
            });

            this.log(logs, "debug", "Found certificate", {
              label,
              subject,
              serialNumber: serialNumber.substring(0, 16) + "...",
              handle: handle.toString(),
            });
          } catch (certError) {
            this.log(logs, "warning", "Failed to process certificate", {
              error: certError instanceof Error ? certError.message : "Unknown",
            });
          }
        }
      }

      this.log(logs, "success", `Found ${certificates.length} certificates`);
      return certificates;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Failed to find certificates: ${msg}`);
      throw new Error(`Failed to find certificates: ${msg}`);
    }
  }

  /**
   * Find private keys on the token
   */
  findPrivateKeys(logs?: LogEntry[]): PKCS11PrivateKey[] {
    if (!this.pkcs11 || !this.session) {
      throw new Error("PKCS#11 session not established");
    }

    this.log(logs, "info", "Searching for private keys on token");

    try {
      // Find private key objects
      this.pkcs11.C_FindObjectsInit(this.session, [
        { type: 0, value: 3 }, // CKA_CLASS = 0, CKO_PRIVATE_KEY = 3
      ]);

      const keyHandles = this.pkcs11.C_FindObjects(this.session);
      this.pkcs11.C_FindObjectsFinal(this.session);

      const privateKeys: PKCS11PrivateKey[] = [];

      if (keyHandles && keyHandles.length > 0) {
        for (const handle of keyHandles) {
          try {
            const attrs = this.pkcs11.C_GetAttributeValue(
              this.session,
              Buffer.isBuffer(handle) ? handle : Buffer.from([handle]),
              [
                { type: 3 }, // CKA_LABEL = 3
                { type: 4 }, // CKA_ID = 4
                { type: 0x00000100 }, // CKA_KEY_TYPE = 0x00000100
                { type: 0x00000108 }, // CKA_SIGN = 0x00000108
              ],
            );

            const label = attrs[0].value.toString().trim();
            const id = attrs[1].value;
            const keyType = attrs[2].value.readUInt32LE(0);
            const canSign = attrs[3].value[0] === 1;

            privateKeys.push({
              handle: Buffer.isBuffer(handle) ? handle : Buffer.from([handle]),
              label,
              id,
              keyType,
              canSign,
            });

            this.log(logs, "debug", "Found private key", {
              label,
              keyType: keyType === 0x00000000 ? "RSA" : `Unknown(${keyType})`, // CKK_RSA = 0x00000000
              canSign,
              handle: handle.toString(),
            });
          } catch (keyError) {
            this.log(logs, "warning", "Failed to process private key", {
              error: keyError instanceof Error ? keyError.message : "Unknown",
            });
          }
        }
      }

      this.log(logs, "success", `Found ${privateKeys.length} private keys`);
      return privateKeys;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Failed to find private keys: ${msg}`);
      throw new Error(`Failed to find private keys: ${msg}`);
    }
  }

  /**
   * Sign data using PKCS#11 (binary data, not base64)
   */
  signData(data: Buffer, certificateId: Buffer, logs?: LogEntry[]): PKCS11SignResult {
    if (!this.pkcs11 || !this.session) {
      throw new Error("PKCS#11 session not established");
    }

    this.log(logs, "info", "Signing data with PKCS#11", {
      dataSize: data.length,
      dataHex: data.toString("hex").substring(0, 32) + "...",
    });

    try {
      // Find matching private key by ID
      this.log(logs, "debug", "Searching for private key", {
        certificateIdHex: certificateId.toString('hex'),
        certificateIdLength: certificateId.length
      });

      this.pkcs11.C_FindObjectsInit(this.session, [
        { type: 0x00000000, value: 3 }, // CKA_CLASS = 0, CKO_PRIVATE_KEY = 3
        { type: 0x00000102, value: certificateId }, // CKA_ID = 0x102
      ]);

      const keyHandles = this.pkcs11.C_FindObjects(this.session);
      this.pkcs11.C_FindObjectsFinal(this.session);

      this.log(logs, "debug", "Private key search result", {
        keyHandlesType: typeof keyHandles,
        keyHandlesLength: keyHandles ? keyHandles.length : 0,
        keyHandlesIsArray: Array.isArray(keyHandles),
        keyHandles: keyHandles
      });

      if (!keyHandles || keyHandles.length === 0) {
        // Try to find all private keys to see what's available
        this.log(logs, "debug", "No private key found with certificate ID, listing all private keys");
        this.pkcs11.C_FindObjectsInit(this.session, [
          { type: 0x00000000, value: 3 }, // CKA_CLASS = 0, CKO_PRIVATE_KEY = 3
        ]);
        const allKeyHandles = this.pkcs11.C_FindObjects(this.session);
        this.pkcs11.C_FindObjectsFinal(this.session);

        this.log(logs, "debug", "All available private keys", {
          count: allKeyHandles ? allKeyHandles.length : 0,
          handles: allKeyHandles
        });

        throw new Error("No matching private key found for certificate");
      }

      // Parse private key handles like we do for certificates
      let privateKeyHandle: Buffer;
      if (Buffer.isBuffer(keyHandles) && keyHandles.length >= 8) {
        privateKeyHandle = keyHandles.subarray(0, 8);
        this.log(logs, "debug", "Using parsed private key handle", {
          handle: privateKeyHandle,
          hex: privateKeyHandle.toString('hex')
        });
      } else {
        privateKeyHandle = keyHandles[0];
        this.log(logs, "debug", "Using direct private key handle", {
          handle: privateKeyHandle
        });
      }

      // Find matching certificate
      this.pkcs11.C_FindObjectsInit(this.session, [
        { type: 0x00000000, value: 1 }, // CKA_CLASS = 0, CKO_CERTIFICATE = 1
        { type: 0x00000102, value: certificateId }, // CKA_ID = 0x102
      ]);

      const certHandles = this.pkcs11.C_FindObjects(this.session);
      this.pkcs11.C_FindObjectsFinal(this.session);

      if (!certHandles || certHandles.length === 0) {
        throw new Error("No matching certificate found");
      }

      // Parse certificate handle like we do in findCertificates
      let certHandle: Buffer;
      if (Buffer.isBuffer(certHandles) && certHandles.length >= 8) {
        certHandle = certHandles.subarray(0, 8);
        this.log(logs, "debug", "Using parsed certificate handle", {
          handle: certHandle,
          hex: certHandle.toString('hex')
        });
      } else {
        certHandle = certHandles[0];
        this.log(logs, "debug", "Using direct certificate handle", {
          handle: certHandle
        });
      }

      // Get certificate for result
      const certAttrs = this.pkcs11.C_GetAttributeValue(
        this.session,
        certHandle,
        [
          { type: 0x00000011 }, // CKA_VALUE = 0x11
          { type: 0x00000003 }, // CKA_LABEL = 0x03
        ],
      );

      const certDer = certAttrs[0].value;
      const certLabel = certAttrs[1].value.toString().trim();

      // Parse certificate for metadata
      const certAsn1 = asn1js.fromBER(certDer);
      const cert = new Certificate({ schema: certAsn1.result });
      const subject = this.extractDN(cert.subject);
      const issuer = this.extractDN(cert.issuer);
      const serialNumber = Buffer.from(cert.serialNumber.valueBlock.valueHex).toString("hex");
      const certPem = this.derToPem(certDer, "CERTIFICATE");

      this.log(logs, "debug", "Found matching certificate and private key", {
        label: certLabel,
        subject,
      });

      // Initialize signing operation (RSA with SHA-256)
      const mechanism = { mechanism: 0x00000040, parameter: undefined }; // CKM_SHA256_RSA_PKCS = 0x00000040
      this.log(logs, "debug", "Initializing signing operation", {
        mechanism: "CKM_SHA256_RSA_PKCS",
        privateKeyHandle: privateKeyHandle,
        privateKeyHandleHex: privateKeyHandle.toString('hex')
      });
      
      this.pkcs11.C_SignInit(
        this.session,
        mechanism,
        privateKeyHandle,
      );

      // Perform signing operation
      const signature = this.pkcs11.C_Sign(this.session, data, Buffer.alloc(256)); // RSA-2048 produces 256-byte signature

      this.log(logs, "success", "Data signed successfully", {
        signatureSize: signature.length,
        algorithm: "SHA256_RSA_PKCS",
      });

      return {
        signature,
        certificate: {
          handle: certHandle,
          label: certLabel,
          id: certificateId,
          subject,
          issuer,
          serialNumber,
          certificatePem: certPem,
        },
        algorithm: "1.2.840.113549.1.1.11", // SHA256withRSA OID
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.log(logs, "error", `Signing failed: ${msg}`);
      throw new Error(`PKCS#11 signing failed: ${msg}`);
    }
  }

  /**
   * Complete workflow: find certificate and sign data
   */
  async findAndSign(
    data: Buffer,
    slotId?: number,
    pin?: string,
    certificateFilter?: { label?: string; subject?: string },
    logs?: LogEntry[],
  ): Promise<PKCS11SignResult> {
    // Initialize if needed
    if (!this.initialized) {
      await this.initialize(logs);
    }

    // Open session
    this.openSession(slotId, logs);

    // Login if PIN provided
    if (pin) {
      this.login(pin, logs);
    }

    // Find certificates
    const certificates = this.findCertificates(logs);

    if (certificates.length === 0) {
      throw new Error("No certificates found on token");
    }

    // Filter certificate if criteria provided
    let targetCert = certificates[0]; // Default to first

    if (certificateFilter) {
      const filtered = certificates.filter((cert) => {
        if (certificateFilter.label && !cert.label.includes(certificateFilter.label)) {
          return false;
        }
        if (certificateFilter.subject && !cert.subject.includes(certificateFilter.subject)) {
          return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        throw new Error(`No certificate matching filter: ${JSON.stringify(certificateFilter)}`);
      }

      targetCert = filtered[0];
    }

    this.log(logs, "info", "Using certificate for signing", {
      label: targetCert.label,
      subject: targetCert.subject,
    });

    // Sign data
    return this.signData(data, targetCert.id, logs);
  }

  /**
   * Cleanup: close session and finalize library
   */
  cleanup(logs?: LogEntry[]): void {
    if (this.session && this.pkcs11) {
      try {
        this.pkcs11.C_CloseSession(this.session);
        this.session = null;
        this.log(logs, "debug", "PKCS#11 session closed");
      } catch (error) {
        this.log(logs, "warning", "Failed to close session", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }

    if (this.pkcs11) {
      try {
        this.pkcs11.C_Finalize();
        this.pkcs11 = null;
        this.initialized = false;
        this.log(logs, "debug", "PKCS#11 library finalized");
      } catch (error) {
        this.log(logs, "warning", "Failed to finalize library", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }
  }

  /**
   * Helper: Extract distinguished name from certificate
   */
  private extractDN(name: Certificate["subject"]): string {
    try {
      return name.typesAndValues.map((tv) => `${tv.type}=${tv.value.valueBlock.value}`).join(", ");
    } catch {
      return "Unknown";
    }
  }

  /**
   * Helper: Convert DER to PEM
   */
  private derToPem(der: Buffer, type: string): string {
    const base64 = der.toString("base64");
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`;
  }

  /**
   * Helper: Log with consistent format
   */
  private log(
    logs: LogEntry[] | undefined,
    level: LogEntry["level"],
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: "backend" as const,
      message,
      context,
    };

    if (logs) {
      logs.push(entry);
    }

    if (this.config.debug) {
      console.log(`[${level.toUpperCase()}] PKCS11: ${message}`, context || "");
    }
  }
}
