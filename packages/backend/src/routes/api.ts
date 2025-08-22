import { Router } from "express";

import { logger } from "../index";

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
} from "@pades-poc/shared";

export const router = Router();

// Health check endpoint
router.get("/health", (req, res) => {
  const response: HealthResponse = {
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "PAdES-B-T Signature Service",
    version: "1.0.0",
  };

  logger.info("Health check requested", { ip: req.ip, userAgent: req.get("User-Agent") });
  res.json(response);
});

// Generate demo PDF
router.post("/pdf/generate", (req, res) => {
  const request = req.body as GenerateDemoPDFRequest;

  logger.info("Demo PDF generation requested", { config: request.config });

  // TODO: Implement PDF generation
  const response: GenerateDemoPDFResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Demo PDF generation not yet implemented",
      timestamp: new Date().toISOString(),
    },
    pdfBase64: "",
  };

  res.status(501).json(response);
});

// Step 1: Prepare PDF for signing
router.post("/pdf/prepare", (req, res) => {
  const request = req.body as PrepareRequest;

  logger.info("PDF prepare requested", {
    configPresent: !!request.config,
    pdfSize: request.pdfBase64.length || 0,
  });

  // TODO: Implement PDF preparation
  const response: PrepareResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "PDF preparation not yet implemented",
      timestamp: new Date().toISOString(),
    },
    preparedPdfBase64: "",
    byteRange: [0, 0, 0, 0],
    messageDigestB64: "",
  };

  res.status(501).json(response);
});

// Step 2: Pre-sign (build signed attributes)
router.post("/pdf/presign", (req, res) => {
  const request = req.body as PresignRequest;

  logger.info("PDF presign requested", {
    messageDigestPresent: !!request.messageDigestB64,
    certPresent: !!request.signerCertPem,
  });

  // TODO: Implement pre-signing
  const response: PresignResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "PDF pre-signing not yet implemented",
      timestamp: new Date().toISOString(),
    },
    toBeSignedB64: "",
    signedAttrsDerB64: "",
  };

  res.status(501).json(response);
});

// Step 3: Finalize (assemble CMS and embed in PDF)
router.post("/pdf/finalize", (req, res) => {
  const request = req.body as FinalizeRequest;

  logger.info("PDF finalize requested", {
    byteRange: request.byteRange,
    signaturePresent: !!request.signatureB64,
    certPresent: !!request.signerCertPem,
  });

  // TODO: Implement finalization
  const response: FinalizeResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "PDF finalization not yet implemented",
      timestamp: new Date().toISOString(),
    },
    signedPdfBase64: "",
  };

  res.status(501).json(response);
});

// Verify signed PDF
router.post("/pdf/verify", (req, res) => {
  const request = req.body as VerificationRequest;

  logger.info("PDF verification requested", {
    pdfSize: request.pdfBase64.length || 0,
  });

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
router.post("/mock/sign", (req, res) => {
  const { toBeSignedB64 } = req.body as { toBeSignedB64: string };

  logger.info("Mock HSM signing requested", {
    dataSize: toBeSignedB64.length || 0,
  });

  // TODO: Implement mock HSM
  const response: MockSignResponse = {
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Mock HSM signing not yet implemented",
      timestamp: new Date().toISOString(),
    },
    signatureB64: "",
    signerCertPem: "",
    signatureAlgorithmOid: "",
  };

  res.status(501).json(response);
});

// CPS card endpoints (for production)
router.post("/cps/readers", (req, res) => {
  logger.info("CPS readers list requested");

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
  logger.info("CPS signing requested");

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
