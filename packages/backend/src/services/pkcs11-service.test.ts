/**
 * Unit tests for PKCS11Service
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { PKCS11Service } from "./pkcs11-service";

import type { LogEntry } from "@pades-poc/shared";

// Mock pkcs11js module
vi.mock("pkcs11js", () => {
  return {
    default: vi.fn(),
    PKCS11: vi.fn(() => ({
      load: vi.fn(),
      C_Initialize: vi.fn(),
      C_GetInfo: vi.fn(() => ({
        cryptokiVersion: "2.40",
        manufacturerID: "Mock Manufacturer",
        libraryDescription: "Mock PKCS#11 Library",
        libraryVersion: "1.0",
      })),
      C_GetSlotList: vi.fn(() => [0, 1]),
      C_GetSlotInfo: vi.fn((slotId: number) => ({
        slotDescription: `Mock Slot ${slotId}`,
        manufacturerID: "Mock",
        flags: slotId === 0 ? 1 : 0, // CKF_TOKEN_PRESENT for slot 0
      })),
      C_GetTokenInfo: vi.fn(() => ({
        label: "Mock Token",
        manufacturerID: "Mock",
        model: "Mock Model",
        serialNumber: "123456",
      })),
    })),
    CKF_TOKEN_PRESENT: 1,
    CKU_USER: 1,
    CKF_SERIAL_SESSION: 2,
    CKF_RW_SESSION: 4,
    CKO_CERTIFICATE: 1,
    CKC_X_509: 0,
    CKA_CLASS: 0,
    CKA_CERTIFICATE_TYPE: 1,
    CKA_VALUE: 2,
    CKA_LABEL: 3,
    CKA_ID: 4,
  };
});

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    access: vi.fn(() => Promise.resolve()),
  },
}));

describe("PKCS11Service", () => {
  let service: PKCS11Service;
  const mockConfig = {
    libraryPath: "/mock/path/to/library.so",
    slotIndex: 0,
    debug: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PKCS11Service(mockConfig);
  });

  describe("constructor", () => {
    it("should create service with default config", () => {
      const defaultService = new PKCS11Service({ libraryPath: "/test/path" });
      expect(defaultService).toBeInstanceOf(PKCS11Service);
    });

    it("should create service with custom config", () => {
      expect(service).toBeInstanceOf(PKCS11Service);
    });
  });

  describe("initialize", () => {
    it("should initialize PKCS#11 library successfully", async () => {
      const logs: LogEntry[] = [];

      await service.initialize(logs);

      expect(logs).toHaveLength(3); // info, success, debug logs
      expect(logs[0].level).toBe("info");
      expect(logs[0].message).toContain("Initializing PKCS#11 library");
      expect(logs[1].level).toBe("success");
      expect(logs[1].message).toContain("PKCS#11 library loaded and initialized");
    });

    it("should not reinitialize if already initialized", async () => {
      const logs: LogEntry[] = [];

      // First initialization
      await service.initialize(logs);
      const initialLogCount = logs.length;

      // Second initialization (should be skipped)
      await service.initialize(logs);

      expect(logs).toHaveLength(initialLogCount); // No new logs
    });

    it("should throw error if library file not found", async () => {
      const fs = await import("fs");
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error("File not found"));

      const logs: LogEntry[] = [];

      await expect(service.initialize(logs)).rejects.toThrow("PKCS#11 library not found");
      expect(logs.some((log) => log.level === "error")).toBe(true);
    });
  });

  describe("getSlots", () => {
    it("should return available slots with token information", async () => {
      const logs: LogEntry[] = [];
      await service.initialize(logs);

      const slots = service.getSlots(logs);

      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({
        slotId: 0,
        description: "Mock Slot 0",
        manufacturerId: "Mock",
        flags: 1,
        tokenPresent: true,
        tokenInfo: {
          label: "Mock Token",
          manufacturerId: "Mock",
          model: "Mock Model",
          serialNumber: "123456",
        },
      });

      expect(slots[1]).toEqual({
        slotId: 1,
        description: "Mock Slot 1",
        manufacturerId: "Mock",
        flags: 0,
        tokenPresent: false,
        tokenInfo: undefined,
      });
    });

    it("should throw error if not initialized", () => {
      const logs: LogEntry[] = [];

      expect(() => service.getSlots(logs)).toThrow("PKCS#11 not initialized");
    });
  });

  describe("logging", () => {
    it("should log messages when logs array provided", async () => {
      const logs: LogEntry[] = [];

      await service.initialize(logs);

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach((log) => {
        expect(log).toHaveProperty("timestamp");
        expect(log).toHaveProperty("level");
        expect(log).toHaveProperty("source", "pkcs11");
        expect(log).toHaveProperty("message");
        expect(typeof log.timestamp).toBe("string");
        expect(typeof log.message).toBe("string");
      });
    });

    it("should not throw when logs array not provided", async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should cleanup resources without errors", async () => {
      const logs: LogEntry[] = [];
      await service.initialize(logs);

      expect(() => service.cleanup(logs)).not.toThrow();

      // Should log cleanup messages
      const cleanupLogs = logs.filter(
        (log) =>
          log.message.includes("PKCS#11 session closed") ||
          log.message.includes("PKCS#11 library finalized"),
      );
      expect(cleanupLogs.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should handle library initialization errors gracefully", async () => {
      const mockPkcs11 = {
        load: vi.fn(() => {
          throw new Error("Mock library error");
        }),
        C_Initialize: vi.fn(),
      };

      const pkcs11js = await import("pkcs11js");
      vi.mocked(pkcs11js.PKCS11).mockImplementationOnce(() => mockPkcs11);

      const logs: LogEntry[] = [];

      await expect(service.initialize(logs)).rejects.toThrow("PKCS#11 initialization failed");

      const errorLogs = logs.filter((log) => log.level === "error");
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain("PKCS#11 initialization failed");
    });
  });
});
