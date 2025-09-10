// packages/backend/src/routes/api.ts
import { generateShortId } from "@pades-poc/shared";
import { Router } from "express";

import { padesBackendLogger, logPAdES } from "../logger";
import { CMSService } from "../services/cms-service";
import { fromBase64, toBase64 } from "../services/crypto-utils";
import { dumpPdfObjects, extractCmsDer, parseCmsSummary } from "../services/debug-service";
import { MockHSMService } from "../services/mock-hsm-service";
import { PDFService } from "../services/pdf-service";
import { PKCS11Service } from "../services/pkcs11-service";
import { SignatureService } from "../services/signature-service";
import { VerificationService } from "../services/verification-service";

import type {
  HealthResponse,
  PrepareRequest,
  PrepareResponse,
  PresignRequest,
  PresignResponse,
  FinalizeRequest,
  FinalizeResponse,
  VerificationRequest,
  VerificationResponse,
  GenerateDemoPDFRequest,
  GenerateDemoPDFResponse,
  MockSignResponse,
  LogEntry,
  BaseApiResponse,
} from "@pades-poc/shared";

export const router = Router();

// Initialize services
const pdfService = new PDFService();
const mockHSM = new MockHSMService();
const signatureService = new SignatureService();
const cmsService = new CMSService();

// PKCS#11 service (initialized on-demand)
let pkcs11Service: PKCS11Service | null = null;

const getPKCS11Service = (): PKCS11Service => {
  if (!pkcs11Service) {
    const libraryPath = process.env.PKCS11_LIBRARY_PATH;
    if (!libraryPath) {
      throw new Error("PKCS11_LIBRARY_PATH environment variable not set");
    }
    
    pkcs11Service = new PKCS11Service({
      libraryPath,
      debug: process.env.NODE_ENV === "development",
    });
  }
  return pkcs11Service;
};

// Init Mock HSM
void mockHSM.ready
  .then(() => {
    const e = padesBackendLogger.createLogEntry("success", "backend", "Mock HSM ready");
    logPAdES(e);
  })
  .catch((error) => {
    const e = padesBackendLogger.createLogEntry(
      "error",
      "backend",
      `Mock HSM init failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    logPAdES(e);
  });

// Helper to both log and collect entries
const pushAndLog = (logs: LogEntry[], entry: LogEntry): void => {
  logs.push(entry);
  logPAdES(entry);
};

// Health
router.get("/health", (req, res) => {
  const logs: LogEntry[] = [];
  const workflowId = generateShortId();

  const info = padesBackendLogger.createLogEntry("info", "backend", "Health check requested", {
    ip: req.ip,
    ua: req.get("User-Agent"),
    mockHSMReady: mockHSM.isInitialized(),
    workflowId,
  });
  pushAndLog(logs, info);

  const response: HealthResponse & { logs: LogEntry[] } = {
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "PAdES-B-T Signature Service",
    version: "1.0.0",
    logs,
  };
  res.json(response);
});

// Generate demo PDF
router.post("/pdf/generate", async (req, res) => {
  const request = req.body as GenerateDemoPDFRequest;
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  const start = padesBackendLogger.logWorkflowStep(
    "info",
    "backend",
    "prepare",
    "Demo PDF generation requested",
    workflowId,
    { config: request.config },
  );
  pushAndLog(logs, start);

  try {
    const result = await pdfService.generateDemoPDF(request.config);

    const ok = padesBackendLogger.logWorkflowStep(
      "success",
      "backend",
      "prepare",
      "Demo PDF generated",
      workflowId,
      { pdfSize: result.metadata.size, pageCount: result.metadata.pageCount },
    );
    pushAndLog(logs, ok);

    const response: GenerateDemoPDFResponse & { logs: LogEntry[] } = {
      success: true,
      pdfBase64: result.pdfBase64,
      logs,
    };
    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const err = padesBackendLogger.logWorkflowStep(
      "error",
      "backend",
      "prepare",
      `Demo PDF generation failed: ${msg}`,
      workflowId,
    );
    pushAndLog(logs, err);

    const response: GenerateDemoPDFResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "PDF_GENERATION_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      pdfBase64: "",
      logs,
    };
    res.status(500).json(response);
  }
});

// Prepare
router.post("/pdf/prepare", async (req, res) => {
  const request = req.body as PrepareRequest;
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  const pdfSize = Buffer.from(request.pdfBase64 || "", "base64").length;
  pushAndLog(
    logs,
    padesBackendLogger.logWorkflowStep(
      "info",
      "backend",
      "prepare",
      "PDF prepare requested",
      workflowId,
      { configPresent: !!request.config, pdfSize },
    ),
  );

  try {
    const result = await pdfService.preparePDF(request.pdfBase64, request.config);

    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "success",
        "backend",
        "prepare",
        "PDF prepared",
        workflowId,
        {
          preparedSize: Buffer.from(result.preparedPdfBase64, "base64").length,
          byteRange: result.byteRange,
        },
      ),
    );

    const response: PrepareResponse & { logs: LogEntry[] } = {
      success: true,
      preparedPdfBase64: result.preparedPdfBase64,
      byteRange: result.byteRange,
      messageDigestB64: result.messageDigestB64,
      logs,
    };
    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "error",
        "backend",
        "prepare",
        `PDF preparation failed: ${msg}`,
        workflowId,
      ),
    );

    const response: PrepareResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "PDF_PREPARATION_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      preparedPdfBase64: "",
      byteRange: [0, 0, 0, 0],
      messageDigestB64: "",
      logs,
    };
    res.status(500).json(response);
  }
});

// Presign
router.post("/pdf/presign", async (req, res) => {
  const request = req.body as PresignRequest;
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  // Enhanced diagnostic logging for CPS workflow debugging
  const isCPSWorkflow =
    request.signerCertPem?.includes("ASIP-SANTE") ||
    request.signerCertPem?.includes("IGC-SANTE") ||
    request.signerCertPem?.includes("CPS");

  pushAndLog(
    logs,
    padesBackendLogger.logWorkflowStep(
      "info",
      "backend",
      "presign",
      "PDF presign requested",
      workflowId,
      {
        messageDigestPresent: !!request.messageDigestB64,
        certPresent: !!request.signerCertPem,
        isCPSWorkflow,
        certLength: request.signerCertPem?.length || 0,
        certPreview: request.signerCertPem?.substring(0, 200) + "..." || "none",
      },
    ),
  );

  try {
    if (!request.messageDigestB64) {
      const response: PresignResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "messageDigestB64 is required",
          timestamp: new Date().toISOString(),
        },
        signedAttrsDerB64: "",
        expectedDigestB64: "",
        logs,
      };
      res.status(400).json(response);
      return;
    }

    if (!request.signerCertPem) {
      const response: PresignResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "signerCertPem is required for PAdES presigning",
          timestamp: new Date().toISOString(),
        },
        signedAttrsDerB64: "",
        expectedDigestB64: "",
        logs,
      };
      res.status(400).json(response);
      return;
    }

    const messageDigest = fromBase64(request.messageDigestB64);

    // Add detailed logging for CPS certificate processing
    if (isCPSWorkflow) {
      pushAndLog(
        logs,
        padesBackendLogger.logWorkflowStep(
          "debug",
          "backend",
          "presign",
          "Processing CPS certificate for signed attributes",
          workflowId,
          {
            messageDigestHex: messageDigest.toString("hex"),
            messageDigestSize: messageDigest.length,
            certType: "CPS",
          },
        ),
      );
    }

    const serviceLogs: LogEntry[] = [];
    const result = signatureService.buildSignedAttributes(
      { messageDigest, signerCertPem: request.signerCertPem },
      serviceLogs,
    );

    serviceLogs.forEach((l) => pushAndLog(logs, l));

    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "success",
        "backend",
        "presign",
        "Signed attributes built",
        workflowId,
        {
          derSize: result.signedAttrsDer.length,
          derHex: result.signedAttrsDer.toString("hex").substring(0, 64) + "...",
          isCPSWorkflow,
        },
      ),
    );

    // Calculate SHA-256 digest for CPS validation
    const { sha256 } = await import("../services/crypto-utils");
    const expectedDigest = sha256(result.signedAttrsDer);

    const response: PresignResponse & { logs: LogEntry[] } = {
      success: true,
      signedAttrsDerB64: toBase64(result.signedAttrsDer),
      expectedDigestB64: toBase64(expectedDigest),
      logs,
    };

    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "error",
        "backend",
        "presign",
        `PDF presigning failed: ${msg}`,
        workflowId,
        {
          errorType: error?.constructor?.name || "Unknown",
          errorStack: stack?.split("\n").slice(0, 5).join("\n") || "No stack",
          isCPSWorkflow,
        },
      ),
    );

    const response: PresignResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "PRESIGN_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      signedAttrsDerB64: "",
      expectedDigestB64: "",
      logs,
    };
    res.status(500).json(response);
  }
});

// Finalize
router.post("/pdf/finalize", async (req, res) => {
  const request = req.body as FinalizeRequest;
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.logWorkflowStep(
      "info",
      "backend",
      "finalize",
      "PDF finalize requested",
      workflowId,
      {
        byteRange: request.byteRange,
        signaturePresent: !!request.signatureB64,
        certPresent: !!request.signerCertPem,
        signatureAlgorithm: request.signatureAlgorithmOid,
      },
    ),
  );

  try {
    if (!request.preparedPdfBase64) {
      const response: FinalizeResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "preparedPdfBase64 is required",
          timestamp: new Date().toISOString(),
        },
        signedPdfBase64: "",
        logs,
      };
      res.status(400).json(response);
      return;
    }

    if (!request.signedAttrsDerB64 || !request.signatureB64 || !request.signerCertPem) {
      const response: FinalizeResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "signedAttrsDerB64, signatureB64, and signerCertPem are required",
          timestamp: new Date().toISOString(),
        },
        signedPdfBase64: "",
        logs,
      };
      res.status(400).json(response);
      return;
    }

    const preparedPdfBytes = fromBase64(request.preparedPdfBase64);
    const signedAttrsDer = fromBase64(request.signedAttrsDerB64);
    const signature = fromBase64(request.signatureB64);

    const serviceLogs: LogEntry[] = [];
    const cmsResult = await cmsService.assembleCMS(
      {
        signedAttrsDer,
        signature,
        signerCertPem: request.signerCertPem,
        certificateChainPem: request.certificateChainPem,
        signatureAlgorithmOid: request.signatureAlgorithmOid,
        withTimestamp: request.withTimestamp !== false, // default true; allow B-B if explicitly false
      },
      serviceLogs,
    );

    serviceLogs.forEach((l) => pushAndLog(logs, l));

    const signedPdfBytes = pdfService.embedCmsIntoPdf(
      new Uint8Array(preparedPdfBytes),
      new Uint8Array(cmsResult.cmsDer),
    );

    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "success",
        "backend",
        "finalize",
        "PDF finalized",
        workflowId,
        {
          finalPdfSize: signedPdfBytes.length,
          cmsSize: cmsResult.cmsDer.length,
          estimatedCmsSize: cmsResult.estimatedSize,
        },
      ),
    );

    const response: FinalizeResponse & { logs: LogEntry[] } = {
      success: true,
      signedPdfBase64: toBase64(Buffer.from(signedPdfBytes)),
      logs,
    };
    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "error",
        "backend",
        "finalize",
        `PDF finalization failed: ${msg}`,
        workflowId,
      ),
    );

    const response: FinalizeResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "FINALIZATION_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      signedPdfBase64: "",
      logs,
    };
    res.status(500).json(response);
  }
});

// Verify
router.post("/pdf/verify", async (req, res) => {
  const request = req.body as VerificationRequest;
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  const pdfSize = Buffer.from(request.pdfBase64 || "", "base64").length;
  pushAndLog(
    logs,
    padesBackendLogger.logWorkflowStep(
      "info",
      "backend",
      "verify",
      "PDF verification requested",
      workflowId,
      { pdfSize },
    ),
  );

  try {
    const verificationService = new VerificationService();
    const verificationResult = await verificationService.verify({ pdfBase64: request.pdfBase64 });

    verificationResult.logs.forEach((l) => pushAndLog(logs, l));

    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        verificationResult.isCryptographicallyValid ? "success" : "warning",
        "backend",
        "verify",
        `Verification: ${verificationResult.isCryptographicallyValid ? "VALID" : "INVALID"}`,
        workflowId,
        {
          isValid: verificationResult.isCryptographicallyValid,
          signatureLevel: verificationResult.signatureLevel,
          isTimestamped: verificationResult.isTimestamped,
          signerCN: verificationResult.signerCN,
          reasonCount: verificationResult.reasons.length,
        },
      ),
    );

    const response: VerificationResponse & { logs: LogEntry[] } = {
      success: true,
      result: {
        isCryptographicallyValid: verificationResult.isCryptographicallyValid,
        isPAdESCompliant: verificationResult.isPAdESCompliant,
        isTimestamped: verificationResult.isTimestamped,
        signatureLevel: verificationResult.signatureLevel,
        signerCN: verificationResult.signerCN,
        signingTime: verificationResult.signingTime,
        timestampTime: verificationResult.timestampTime,
        reasons: verificationResult.reasons,
      },
      logs,
    };
    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.logWorkflowStep(
        "error",
        "backend",
        "verify",
        `Verification failed: ${msg}`,
        workflowId,
      ),
    );

    const response: VerificationResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "VERIFICATION_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      result: {
        isCryptographicallyValid: false,
        isPAdESCompliant: false,
        isTimestamped: false,
        signatureLevel: "UNKNOWN",
        reasons: [msg],
      },
      logs,
    };
    res.status(500).json(response);
  }
});

// Provide DC parameter to frontend
router.get("/icanopee/dc-parameter", (req, res) => {
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry(
      "info",
      "backend",
      "DC parameter requested for frontend Icanopee integration",
      { workflowId },
    ),
  );

  try {
    const dcParameter = process.env.ICANOPEE_DC_PARAMETER;

    if (!dcParameter) {
      const response: BaseApiResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "DC_PARAMETER_NOT_CONFIGURED",
          message: "Set ICANOPEE_DC_PARAMETER env",
          timestamp: new Date().toISOString(),
        },
        logs,
      };
      res.status(500).json(response);
      return;
    }

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "backend", "DC parameter provided", {
        workflowId,
        parameterLength: dcParameter.length,
      }),
    );

    res.json({ success: true, dcParameter, logs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry(
        "error",
        "backend",
        `Failed to provide DC parameter: ${msg}`,
        { workflowId },
      ),
    );

    res.status(500).json({
      success: false,
      error: { code: "DC_PARAMETER_ERROR", message: msg, timestamp: new Date().toISOString() },
      logs,
    });
  }
});

// NEW: Mock HSM certificate endpoint
router.get("/mock/cert", (req, res) => {
  const logs: LogEntry[] = [];
  const workflowId = generateShortId();

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry("info", "mock-hsm", "Mock HSM cert requested", {
      workflowId,
    }),
  );

  try {
    if (!mockHSM.isInitialized()) {
      throw new Error("Mock HSM not initialized");
    }
    const signerCertPem = mockHSM.getSignerCertificatePem();
    const certificateChainPem = mockHSM.getCertificateChainPem(false);

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "mock-hsm", "Provided mock cert", {
        workflowId,
        certLen: signerCertPem.length,
      }),
    );

    res.json({
      success: true,
      signerCertPem,
      certificateChainPem,
      logs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("error", "mock-hsm", `Mock cert failed: ${msg}`, {
        workflowId,
      }),
    );

    res.status(500).json({
      success: false,
      error: { code: "MOCK_CERT_FAILED", message: msg, timestamp: new Date().toISOString() },
      logs,
    });
  }
});

// Mock sign
router.post("/mock/sign", async (req, res) => {
  const { toBeSignedB64 } = req.body as { toBeSignedB64: string };
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry("info", "mock-hsm", "Mock HSM sign requested", {
      workflowId,
      dataSize: toBeSignedB64?.length || 0,
    }),
  );

  try {
    if (!toBeSignedB64) {
      const response: MockSignResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "toBeSignedB64 is required",
          timestamp: new Date().toISOString(),
        },
        signatureB64: "",
        signerCertPem: "",
        signatureAlgorithmOid: "",
        logs,
      };
      res.status(400).json(response);
      return;
    }

    if (!mockHSM.isInitialized()) await mockHSM.ready;
    if (!mockHSM.isInitialized()) {
      const response: MockSignResponse & { logs: LogEntry[] } = {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Mock HSM not properly initialized",
          timestamp: new Date().toISOString(),
        },
        signatureB64: "",
        signerCertPem: "",
        signatureAlgorithmOid: "",
        logs,
      };
      res.status(500).json(response);
      return;
    }

    const signatureB64 = await mockHSM.signBase64(toBeSignedB64);
    const signerCertPem = mockHSM.getSignerCertificatePem();
    const certificateChainPem = mockHSM.getCertificateChainPem(false);

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "mock-hsm", "Mock sign success", {
        workflowId,
        signatureSize: Buffer.from(signatureB64, "base64").length,
        algorithm: "RSA-SHA256",
      }),
    );

    const response: MockSignResponse & { logs: LogEntry[] } = {
      success: true,
      signatureB64,
      signerCertPem,
      certificateChainPem,
      signatureAlgorithmOid: "1.2.840.113549.1.1.11",
      logs,
    };
    res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("error", "mock-hsm", `Mock sign failed: ${msg}`, {
        workflowId,
      }),
    );

    const response: MockSignResponse & { logs: LogEntry[] } = {
      success: false,
      error: {
        code: "SIGNING_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
      signatureB64: "",
      signerCertPem: "",
      signatureAlgorithmOid: "",
      logs,
    };
    res.status(500).json(response);
  }
});

// DEBUG: dump PDF objects
router.post("/debug/pdf-objects", (req, res) => {
  try {
    const {
      pdfBase64,
      onlySignatureObjects = false,
      collapseStreams = true,
    } = req.body as {
      pdfBase64: string;
      onlySignatureObjects?: boolean;
      collapseStreams?: boolean;
    };
    const { objectsText, sigObjNos } = dumpPdfObjects({
      pdfBase64,
      onlySignatureObjects,
      collapseStreams,
    });
    res.json({ success: true, objectsText, signatureObjectNumbers: sigObjNos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({
      success: false,
      error: {
        code: "DEBUG_PDF_OBJECTS_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// DEBUG: parse CMS SignedData
router.post("/debug/cms", (req, res) => {
  try {
    const { pdfBase64, cmsDerBase64 } = req.body as { pdfBase64?: string; cmsDerBase64?: string };
    const cmsDer = extractCmsDer(pdfBase64, cmsDerBase64);
    const out = parseCmsSummary(cmsDer);
    res.json({ success: true, ...out });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({
      success: false,
      error: {
        code: "DEBUG_CMS_FAILED",
        message: msg,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// PKCS#11: Get available slots
router.get("/pkcs11/slots", async (req, res) => {
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry("info", "pkcs11", "PKCS#11 slots requested", { workflowId })
  );

  try {
    const pkcs11 = getPKCS11Service();
    await pkcs11.initialize(logs);
    const slots = pkcs11.getSlots(logs);

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "pkcs11", "PKCS#11 slots retrieved", {
        workflowId,
        slotCount: slots.length,
      })
    );

    res.json({
      success: true,
      slots,
      logs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("error", "pkcs11", `PKCS#11 slots failed: ${msg}`, { workflowId })
    );

    res.status(500).json({
      success: false,
      error: { code: "PKCS11_SLOTS_FAILED", message: msg, timestamp: new Date().toISOString() },
      logs,
    });
  }
});

// PKCS#11: Get certificates from slot
router.post("/pkcs11/certificates", async (req, res) => {
  const { slotId, pin } = req.body as { slotId: number; pin?: string };
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry("info", "pkcs11", "PKCS#11 certificates requested", {
      workflowId,
      slotId,
      pinProvided: !!pin,
    })
  );

  try {
    const pkcs11 = getPKCS11Service();
    await pkcs11.initialize(logs);
    pkcs11.openSession(slotId, logs);

    if (pin) {
      pkcs11.login(pin, logs);
    }

    const certificates = pkcs11.findCertificates(logs);

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "pkcs11", "PKCS#11 certificates retrieved", {
        workflowId,
        certificateCount: certificates.length,
      })
    );

    res.json({
      success: true,
      certificates: certificates.map(cert => ({
        label: cert.label,
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        certificatePem: cert.certificatePem,
      })),
      logs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("error", "pkcs11", `PKCS#11 certificates failed: ${msg}`, { workflowId })
    );

    res.status(500).json({
      success: false,
      error: { code: "PKCS11_CERTIFICATES_FAILED", message: msg, timestamp: new Date().toISOString() },
      logs,
    });
  }
});

// PKCS#11: Sign data (replaces the problematic Icanopee string API)
router.post("/pkcs11/sign", async (req, res) => {
  const {
    slotId,
    pin,
    dataToSignB64,
    certificateFilter,
  } = req.body as {
    slotId: number;
    pin: string;
    dataToSignB64: string; // DER(signedAttributes) in base64
    certificateFilter?: { label?: string; subject?: string };
  };
  
  const workflowId = generateShortId();
  const logs: LogEntry[] = [];

  pushAndLog(
    logs,
    padesBackendLogger.createLogEntry("info", "pkcs11", "PKCS#11 signing requested", {
      workflowId,
      slotId,
      dataSize: Buffer.from(dataToSignB64 || "", "base64").length,
      hasFilter: !!certificateFilter,
    })
  );

  try {
    if (!dataToSignB64 || !pin) {
      const response = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "dataToSignB64 and pin are required",
          timestamp: new Date().toISOString(),
        },
        logs,
      };
      res.status(400).json(response);
      return;
    }

    const dataToSign = fromBase64(dataToSignB64);
    
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("debug", "pkcs11", "Signing DER data with PKCS#11", {
        workflowId,
        dataHex: dataToSign.toString("hex").substring(0, 64) + "...",
        dataSize: dataToSign.length,
      })
    );

    const pkcs11 = getPKCS11Service();
    const result = await pkcs11.findAndSign(dataToSign, slotId, pin, certificateFilter, logs);

    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("success", "pkcs11", "PKCS#11 signing completed", {
        workflowId,
        signatureSize: result.signature.length,
        certificateSubject: result.certificate.subject,
        algorithm: result.algorithm,
      })
    );

    res.json({
      success: true,
      signatureB64: toBase64(result.signature),
      signerCertPem: result.certificate.certificatePem,
      signatureAlgorithmOid: result.algorithm,
      certificate: {
        label: result.certificate.label,
        subject: result.certificate.subject,
        issuer: result.certificate.issuer,
        serialNumber: result.certificate.serialNumber,
      },
      logs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    pushAndLog(
      logs,
      padesBackendLogger.createLogEntry("error", "pkcs11", `PKCS#11 signing failed: ${msg}`, { workflowId })
    );

    res.status(500).json({
      success: false,
      error: { code: "PKCS11_SIGNING_FAILED", message: msg, timestamp: new Date().toISOString() },
      logs,
    });
  }
});
