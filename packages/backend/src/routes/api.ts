import { generateShortId } from "@pades-poc/shared";
import { Router } from "express";

import { padesBackendLogger, logPAdES } from "../logger";
import { CMSService } from "../services/cms-service";
import { fromBase64, toBase64 } from "../services/crypto-utils";
import { MockHSMService } from "../services/mock-hsm-service";
import { PDFService } from "../services/pdf-service";
import { SignatureService } from "../services/signature-service";

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
} from "@pades-poc/shared";

export const router = Router();

// Initialize services
const pdfService = new PDFService();
const mockHSM = new MockHSMService();
const signatureService = new SignatureService();
const cmsService = new CMSService();

// Initialize Mock HSM in background
void mockHSM.ready
  .then(() => {
    const entry = padesBackendLogger.createLogEntry(
      "success",
      "backend",
      "Mock HSM service initialized and ready for use",
    );
    logPAdES(entry);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const entry = padesBackendLogger.createLogEntry(
      "error",
      "backend",
      `Mock HSM initialization failed: ${errorMessage}`,
    );
    logPAdES(entry);
  });

// Health check endpoint
router.get("/health", (req, res) => {
  // Check if Mock HSM is ready
  const mockHSMReady = mockHSM.isInitialized();

  const response: HealthResponse = {
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "PAdES-B-T Signature Service",
    version: "1.0.0",
  };

  const entry = padesBackendLogger.createLogEntry("info", "backend", "Health check requested", {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    mockHSMReady,
  });
  logPAdES(entry);

  res.json(response);
});

// Generate demo PDF
router.post("/pdf/generate", async (req, res) => {
  const request = req.body as GenerateDemoPDFRequest;
  const workflowId = generateShortId();

  const entry = padesBackendLogger.logWorkflowStep(
    "info",
    "backend",
    "prepare",
    "Demo PDF generation requested",
    workflowId,
    { config: request.config },
  );
  logPAdES(entry);

  try {
    const result = await pdfService.generateDemoPDF(request.config);

    const successEntry = padesBackendLogger.logWorkflowStep(
      "success",
      "backend",
      "prepare",
      "Demo PDF generated successfully",
      workflowId,
      {
        pdfSize: result.metadata.size,
        pageCount: result.metadata.pageCount,
      },
    );
    logPAdES(successEntry);

    const response: GenerateDemoPDFResponse = {
      success: true,
      pdfBase64: result.pdfBase64,
    };

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const errorEntry = padesBackendLogger.logWorkflowStep(
      "error",
      "backend",
      "prepare",
      `Demo PDF generation failed: ${errorMessage}`,
      workflowId,
    );
    logPAdES(errorEntry);

    const response: GenerateDemoPDFResponse = {
      success: false,
      error: {
        code: "PDF_GENERATION_FAILED",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      pdfBase64: "",
    };

    res.status(500).json(response);
  }
});

// Step 1: Prepare PDF for signing
router.post("/pdf/prepare", async (req, res) => {
  const request = req.body as PrepareRequest;
  const workflowId = generateShortId();
  const pdfSize = Buffer.from(request.pdfBase64 || "", "base64").length;

  const entry = padesBackendLogger.logWorkflowStep(
    "info",
    "backend",
    "prepare",
    "PDF prepare requested",
    workflowId,
    {
      configPresent: !!request.config,
      pdfSize,
    },
  );
  logPAdES(entry);

  try {
    const result = await pdfService.preparePDF(request.pdfBase64, request.config);

    const successEntry = padesBackendLogger.logWorkflowStep(
      "success",
      "backend",
      "prepare",
      "PDF prepared successfully",
      workflowId,
      {
        preparedSize: Buffer.from(result.preparedPdfBase64, "base64").length,
        byteRange: result.byteRange,
      },
    );
    logPAdES(successEntry);

    const response: PrepareResponse = {
      success: true,
      preparedPdfBase64: result.preparedPdfBase64,
      byteRange: result.byteRange,
      messageDigestB64: result.messageDigestB64,
    };

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const errorEntry = padesBackendLogger.logWorkflowStep(
      "error",
      "backend",
      "prepare",
      `PDF preparation failed: ${errorMessage}`,
      workflowId,
    );
    logPAdES(errorEntry);

    const response: PrepareResponse = {
      success: false,
      error: {
        code: "PDF_PREPARATION_FAILED",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      preparedPdfBase64: "",
      byteRange: [0, 0, 0, 0],
      messageDigestB64: "",
    };

    res.status(500).json(response);
  }
});

// Step 2: Pre-sign (build signed attributes)
router.post("/pdf/presign", (req, res) => {
  const request = req.body as PresignRequest;
  const workflowId = generateShortId();

  const entry = padesBackendLogger.logWorkflowStep(
    "info",
    "backend",
    "presign",
    "PDF presign requested",
    workflowId,
    {
      messageDigestPresent: !!request.messageDigestB64,
      certPresent: !!request.signerCertPem,
    },
  );
  logPAdES(entry);

  try {
    // Validate required parameters
    if (!request.messageDigestB64) {
      const response: PresignResponse = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "messageDigestB64 is required",
          timestamp: new Date().toISOString(),
        },
        toBeSignedB64: "",
        signedAttrsDerB64: "",
      };
      res.status(400).json(response);
      return;
    }

    if (!request.signerCertPem) {
      const response: PresignResponse = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "signerCertPem is required for PAdES presigning",
          timestamp: new Date().toISOString(),
        },
        toBeSignedB64: "",
        signedAttrsDerB64: "",
      };
      res.status(400).json(response);
      return;
    }

    // Decode message digest
    const messageDigest = fromBase64(request.messageDigestB64);

    // Build signed attributes
    const logs: LogEntry[] = [];
    const result = signatureService.buildSignedAttributes(
      {
        messageDigest,
        signerCertPem: request.signerCertPem,
      },
      logs,
    );

    // Log any debug information from the service
    logs.forEach((log) => logPAdES(log));

    const successEntry = padesBackendLogger.logWorkflowStep(
      "success",
      "backend",
      "presign",
      "Signed attributes built successfully",
      workflowId,
      {
        derSize: result.signedAttrsDer.length,
        hashSize: result.toBeSignedHash.length,
      },
    );
    logPAdES(successEntry);

    const response: PresignResponse = {
      success: true,
      toBeSignedB64: toBase64(result.toBeSignedHash),
      signedAttrsDerB64: toBase64(result.signedAttrsDer),
    };

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const errorEntry = padesBackendLogger.logWorkflowStep(
      "error",
      "backend",
      "presign",
      `PDF presigning failed: ${errorMessage}`,
      workflowId,
    );
    logPAdES(errorEntry);

    const response: PresignResponse = {
      success: false,
      error: {
        code: "PRESIGN_FAILED",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      toBeSignedB64: "",
      signedAttrsDerB64: "",
    };

    res.status(500).json(response);
  }
});

// Step 3: Finalize (assemble CMS and embed in PDF)
router.post("/pdf/finalize", async (req, res) => {
  const request = req.body as FinalizeRequest;
  const workflowId = generateShortId();

  const entry = padesBackendLogger.logWorkflowStep(
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
  );
  logPAdES(entry);

  try {
    // Validate required parameters
    if (!request.preparedPdfBase64) {
      const response: FinalizeResponse = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "preparedPdfBase64 is required",
          timestamp: new Date().toISOString(),
        },
        signedPdfBase64: "",
      };
      res.status(400).json(response);
      return;
    }

    if (!request.signedAttrsDerB64 || !request.signatureB64 || !request.signerCertPem) {
      const response: FinalizeResponse = {
        success: false,
        error: {
          code: "MISSING_PARAMETER",
          message: "signedAttrsDerB64, signatureB64, and signerCertPem are required",
          timestamp: new Date().toISOString(),
        },
        signedPdfBase64: "",
      };
      res.status(400).json(response);
      return;
    }

    // Decode parameters
    const preparedPdfBytes = fromBase64(request.preparedPdfBase64);
    const signedAttrsDer = fromBase64(request.signedAttrsDerB64);
    const signature = fromBase64(request.signatureB64);

    // Assemble CMS
    const logs: LogEntry[] = [];
    const cmsResult = await cmsService.assembleCMS(
      {
        signedAttrsDer,
        signature,
        signerCertPem: request.signerCertPem,
        certificateChainPem: request.certificateChainPem,
        signatureAlgorithmOid: request.signatureAlgorithmOid,
        withTimestamp: true,
      },
      logs,
    );

    // Log CMS assembly information
    logs.forEach((log) => logPAdES(log));

    // Embed CMS into PDF
    const signedPdfBytes = pdfService.embedCmsIntoPdf(
      new Uint8Array(preparedPdfBytes),
      new Uint8Array(cmsResult.cmsDer),
    );

    const successEntry = padesBackendLogger.logWorkflowStep(
      "success",
      "backend",
      "finalize",
      "PDF finalized successfully",
      workflowId,
      {
        finalPdfSize: signedPdfBytes.length,
        cmsSize: cmsResult.cmsDer.length,
        estimatedCmsSize: cmsResult.estimatedSize,
      },
    );
    logPAdES(successEntry);

    const response: FinalizeResponse = {
      success: true,
      signedPdfBase64: toBase64(Buffer.from(signedPdfBytes)),
    };

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const errorEntry = padesBackendLogger.logWorkflowStep(
      "error",
      "backend",
      "finalize",
      `PDF finalization failed: ${errorMessage}`,
      workflowId,
    );
    logPAdES(errorEntry);

    const response: FinalizeResponse = {
      success: false,
      error: {
        code: "FINALIZATION_FAILED",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      signedPdfBase64: "",
    };

    res.status(500).json(response);
  }
});

// Verify signed PDF
router.post("/pdf/verify", (req, res) => {
  const request = req.body as VerificationRequest;
  const workflowId = generateShortId();
  const pdfSize = Buffer.from(request.pdfBase64 || "", "base64").length;

  const entry = padesBackendLogger.logWorkflowStep(
    "info",
    "backend",
    "verify",
    "PDF verification requested",
    workflowId,
    { pdfSize },
  );
  logPAdES(entry);

  // TODO: Implement verification
  const response: VerificationResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "PDF verification not yet implemented",
      timestamp: new Date().toISOString(),
    },
    result: {
      isCryptographicallyValid: false,
      isPAdESCompliant: false,
      isTimestamped: false,
      signatureLevel: "UNKNOWN",
      reasons: ["Not yet implemented"],
    },
  };

  res.status(501).json(response);
});

// Mock HSM signing endpoint (for development)
router.post("/mock/sign", async (req, res) => {
  const { toBeSignedB64 } = req.body as { toBeSignedB64: string };
  const workflowId = generateShortId();

  const entry = padesBackendLogger.createLogEntry(
    "info",
    "mock-hsm",
    "Mock HSM signing requested",
    {
      workflowId,
      dataSize: toBeSignedB64?.length || 0,
    },
  );
  logPAdES(entry);

  try {
    if (!toBeSignedB64) {
      const response: MockSignResponse = {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "toBeSignedB64 parameter is required",
          timestamp: new Date().toISOString(),
        },
        signatureB64: "",
        signerCertPem: "",
        signatureAlgorithmOid: "",
      };
      res.status(400).json(response);
      return;
    }

    // Ensure Mock HSM is ready
    if (!mockHSM.isInitialized()) {
      // Try to wait a bit for initialization
      await mockHSM.ready;
    }

    if (!mockHSM.isInitialized()) {
      const response: MockSignResponse = {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Mock HSM not properly initialized",
          timestamp: new Date().toISOString(),
        },
        signatureB64: "",
        signerCertPem: "",
        signatureAlgorithmOid: "",
      };
      res.status(500).json(response);
      return;
    }

    const signatureB64 = await mockHSM.signBase64(toBeSignedB64);
    const signerCertPem = mockHSM.getSignerCertificatePem();
    const certificateChainPem = mockHSM.getCertificateChainPem(false); // Don't include root in response

    const successEntry = padesBackendLogger.createLogEntry(
      "success",
      "mock-hsm",
      "Data signed successfully with mock HSM",
      {
        workflowId,
        signatureSize: Buffer.from(signatureB64, "base64").length,
        algorithm: "RSA-SHA256",
      },
    );
    logPAdES(successEntry);

    const response: MockSignResponse = {
      success: true,
      signatureB64,
      signerCertPem,
      certificateChainPem,
      signatureAlgorithmOid: "1.2.840.113549.1.1.11", // SHA256withRSA
    };

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown signing error";

    const errorEntry = padesBackendLogger.createLogEntry(
      "error",
      "mock-hsm",
      `Mock HSM signing failed: ${errorMessage}`,
      { workflowId },
    );
    logPAdES(errorEntry);

    const response: MockSignResponse = {
      success: false,
      error: {
        code: "SIGNING_FAILED",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      signatureB64: "",
      signerCertPem: "",
      signatureAlgorithmOid: "",
    };

    res.status(500).json(response);
  }
});

// CPS card endpoints (for production)
router.post("/cps/readers", (req, res) => {
  const workflowId = generateShortId();

  const entry = padesBackendLogger.logCPSOperation(
    "info",
    "CPS readers list requested",
    workflowId,
    undefined,
  );
  logPAdES(entry);

  // TODO: Implement CPS reader detection
  res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "CPS reader detection not yet implemented",
      timestamp: new Date().toISOString(),
    },
  });
});

router.post("/cps/sign", (req, res) => {
  const workflowId = generateShortId();

  const entry = padesBackendLogger.logCPSOperation(
    "info",
    "CPS signing requested",
    workflowId,
    undefined,
  );
  logPAdES(entry);

  // TODO: Implement CPS signing
  res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "CPS signing not yet implemented",
      timestamp: new Date().toISOString(),
    },
  });
});
