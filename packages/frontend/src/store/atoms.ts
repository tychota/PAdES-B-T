import { atom } from "jotai";

import type { LogEntry, PDFSigningConfig, PcscReader } from "@pades-poc/shared";

export type WorkflowStep =
  | "upload"
  | "prepare"
  | "presign"
  | "sign"
  | "finalize"
  | "verify"
  | "completed";
export type SigningMethod = "mock" | "cps";

export interface WorkflowState {
  step: WorkflowStep;
  pdfBase64: string;
  preparedPdfBase64: string;
  byteRange: [number, number, number, number];
  messageDigestB64: string;
  toBeSignedB64: string;
  signedAttrsDerB64: string;
  signatureB64: string;
  signerCertPem: string;
  signedPdfBase64: string;
}

export interface PDFMetadata {
  size: number;
  name: string;
}

// Core workflow state
export const workflowStateAtom = atom<WorkflowState>({
  step: "upload",
  pdfBase64: "",
  preparedPdfBase64: "",
  byteRange: [0, 0, 0, 0],
  messageDigestB64: "",
  toBeSignedB64: "",
  signedAttrsDerB64: "",
  signatureB64: "",
  signerCertPem: "",
  signedPdfBase64: "",
});

// PDF metadata
export const pdfMetadataAtom = atom<PDFMetadata | null>(null);

// Signing configuration
export const signingConfigAtom = atom<PDFSigningConfig>({
  signerName: "Dr. MARTIN Pierre",
  reason: "ePrescription signature",
  location: "France",
});

// UI state
export const loadingAtom = atom<boolean>(false);
export const errorAtom = atom<string | null>(null);
export const logsAtom = atom<LogEntry[]>([]);

// CPS state
export const signingMethodAtom = atom<SigningMethod>("cps");
export const pinAtom = atom<string>("");
export const availableReadersAtom = atom<PcscReader[]>([]);
export const selectedReaderAtom = atom<string>("");

// Derived atoms
export const canProceedAtom = atom<boolean>((get) => {
  const state = get(workflowStateAtom);
  const signingMethod = get(signingMethodAtom);
  const pin = get(pinAtom);
  const selectedReader = get(selectedReaderAtom);

  switch (state.step) {
    case "upload":
      return !!state.pdfBase64;
    case "prepare":
      return !!state.pdfBase64; // Fix: check source PDF, not prepared PDF
    case "presign":
      return !!state.preparedPdfBase64 && !!state.messageDigestB64;
    case "sign":
      return (
        !!state.toBeSignedB64 && (signingMethod === "mock" || (pin.length >= 4 && !!selectedReader))
      );
    case "finalize":
      return !!state.signatureB64;
    case "verify":
      return !!state.signedPdfBase64;
    default:
      return false;
  }
});
