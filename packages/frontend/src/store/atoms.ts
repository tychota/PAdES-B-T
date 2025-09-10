// packages/frontend/src/store/atoms.ts

import { notifications } from "@mantine/notifications";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useMemo } from "react";

import { ApiClient } from "../services/api";
import { IcanopeeService } from "../services/icanopee";

import type {
  LogEntry,
  PcscReader,
  FinalizeRequest,
  PKCS11SlotInfo,
  PKCS11CertificateInfo,
} from "@pades-poc/shared";

// --- Base State Atoms ---
export type WorkflowStep = "generate" | "preSign" | "sign" | "finalize" | "verify" | "completed";

export interface WorkflowState {
  step: WorkflowStep;
  pdfBase64: string | null;
  preparedPdfBase64?: string;
  byteRange?: [number, number, number, number];
  messageDigestB64?: string;
  signedAttrsDerB64?: string;
  expectedDigestB64?: string; // For CPS digest validation
  signatureB64?: string;
  signerCertPem?: string;
  certificateChainPem?: string[];
  signedPdfBase64: string | null;
}

export const workflowStateAtom = atom<WorkflowState>({
  step: "generate",
  pdfBase64: null,
  signedPdfBase64: null,
});

export const pdfFileAtom = atom<File | null>(null);
export const loadingAtom = atom<boolean>(false);
export const logsAtom = atom<LogEntry[]>([]);
// Persistent atoms with localStorage using jotai/utils
export const signingMethodAtom = atomWithStorage<"mock" | "cps" | "pkcs11">(
  "signingMethod",
  "mock",
);
export const pinAtom = atomWithStorage<string>("pin", "");
export const availableReadersAtom = atom<PcscReader[]>([]);
export const selectedReaderAtom = atomWithStorage<string | null>("selectedReader", null);
export const icanopeeStatusAtom = atom<"idle" | "loading" | "error">("idle");
export const icanopeeErrorAtom = atom<string | null>(null);

// PKCS#11 atoms
export const pkcs11SlotsAtom = atom<PKCS11SlotInfo[]>([]);
export const selectedSlotAtom = atomWithStorage<number | null>("selectedSlot", null);
export const pkcs11CertificatesAtom = atom<PKCS11CertificateInfo[]>([]);
export const selectedCertificateAtom = atomWithStorage<string | null>("selectedCertificate", null);
export const pkcs11StatusAtom = atom<"idle" | "loading" | "error">("idle");
export const pkcs11ErrorAtom = atom<string | null>(null);

// --- Debug Atoms ---
export const debugPdfObjectsAtom = atom<string>("");
export const debugCmsDataAtom = atom<{
  signedDataVersion: number;
  digestAlgorithms: string[];
  eContentType: string;
  certificateCount: number;
  signerSubject?: string;
  hasTimestamp: boolean;
  signedAttributeOids: string[];
} | null>(null);
export const debugLoadingAtom = atom<boolean>(false);

// --- Derived State Atoms ---

export const pdfBase64Atom = atom(
  (get) =>
    get(workflowStateAtom).signedPdfBase64 ||
    get(workflowStateAtom).preparedPdfBase64 ||
    get(workflowStateAtom).pdfBase64,
);

export const canProceedAtom = atom<boolean>((get) => {
  const state = get(workflowStateAtom);
  const signingMethod = get(signingMethodAtom);
  const pin = get(pinAtom);
  const selectedReader = get(selectedReaderAtom);
  const selectedSlot = get(selectedSlotAtom);
  const selectedCertificate = get(selectedCertificateAtom);

  switch (state.step) {
    case "generate":
      // allow continue when a file is selected OR a base64 PDF already exists
      return !!get(pdfFileAtom) || !!state.pdfBase64;
    case "preSign":
      // allow continue to run the prepare API when we have a PDF to prepare
      return !!state.pdfBase64;
    case "sign":
      // STRICT SEPARATION: Only validate requirements for the selected signing method
      if (signingMethod === "mock") {
        return !!state.messageDigestB64;
      }
      if (signingMethod === "cps") {
        // CPS workflow: Only require messageDigest, PIN, and selected reader
        // Do NOT check PKCS#11 state (selectedSlot, selectedCertificate)
        return !!state.messageDigestB64 && pin.length >= 4 && !!selectedReader;
      }
      if (signingMethod === "pkcs11") {
        // PKCS#11 workflow: Only require messageDigest, PIN, slot, and certificate
        // Do NOT check CPS state (selectedReader)
        return (
          !!state.messageDigestB64 &&
          pin.length >= 4 &&
          selectedSlot !== null &&
          !!selectedCertificate
        );
      }
      return false;
    case "finalize":
      // do NOT require signature yet—it's created when you click Continue
      return (
        !!state.preparedPdfBase64 &&
        !!state.signedAttrsDerB64 &&
        !!state.signerCertPem &&
        Array.isArray(state.byteRange)
      );
    case "verify":
      return !!state.signedPdfBase64;
    default:
      return false;
  }
});

// --- Action Hooks ---

const addLogsAtom = atom(null, (_get, set, newLogs: LogEntry[]) => {
  if (newLogs.length > 0) {
    set(logsAtom, (prev) => [...prev, ...newLogs]);
  }
});

export const useIcanopee = () => {
  const setStatus = useSetAtom(icanopeeStatusAtom);
  const setError = useSetAtom(icanopeeErrorAtom);
  const setReaders = useSetAtom(availableReadersAtom);
  const addLogs = useSetAtom(addLogsAtom);

  const getReaders = async () => {
    setStatus("loading");
    setError(null);
    try {
      const icanopee = new IcanopeeService();
      const logCallback = (level: LogEntry["level"], message: string) =>
        addLogs([{ timestamp: new Date().toISOString(), level, source: "cps", message }]);

      const readers = await icanopee.getReaders(logCallback);
      const cpsReaders = readers.filter((r) => r.i_slotType === 3);
      setReaders(cpsReaders);
      if (cpsReaders.length === 0) {
        throw new Error("No CPS card readers found.");
      }
      setStatus("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown Icanopee error";
      setError(msg);
      setStatus("error");
    }
  };
  return {
    getReaders,
    status: useAtomValue(icanopeeStatusAtom),
    error: useAtomValue(icanopeeErrorAtom),
  };
};

export const usePKCS11 = () => {
  const setStatus = useSetAtom(pkcs11StatusAtom);
  const setError = useSetAtom(pkcs11ErrorAtom);
  const setSlots = useSetAtom(pkcs11SlotsAtom);
  const setCertificates = useSetAtom(pkcs11CertificatesAtom);
  const addLogs = useSetAtom(addLogsAtom);
  const apiClient = new ApiClient();

  const getSlots = async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await apiClient.getPKCS11Slots();

      if (response.logs) addLogs(response.logs);

      if (!response.success) {
        throw new Error(response.error?.message || "Failed to get PKCS#11 slots");
      }

      setSlots(response.slots);
      if (response.slots.length === 0) {
        throw new Error("No PKCS#11 slots found");
      }
      setStatus("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown PKCS#11 error";
      setError(msg);
      setStatus("error");
    }
  };

  const getCertificates = async (slotId: number, pin?: string) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await apiClient.getPKCS11Certificates({ slotId, pin });

      if (response.logs) addLogs(response.logs);

      if (!response.success) {
        throw new Error(response.error?.message || "Failed to get PKCS#11 certificates");
      }

      setCertificates(response.certificates);
      if (response.certificates.length === 0) {
        throw new Error("No certificates found on token");
      }
      setStatus("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown PKCS#11 error";
      setError(msg);
      setStatus("error");
    }
  };

  return {
    getSlots,
    getCertificates,
    status: useAtomValue(pkcs11StatusAtom),
    error: useAtomValue(pkcs11ErrorAtom),
  };
};

// UI preferences
export const showLogTimestampsAtom = atom<boolean>(true);
export const indentBackendLogsAtom = atom<boolean>(true);

// Signature-level preference (B-B vs B-T)
export const includeTimestampAtom = atomWithStorage<boolean>("includeTimestamp", true);

export const useWorkflowActions = () => {
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const setLoading = useSetAtom(loadingAtom);
  const addLogs = useSetAtom(addLogsAtom);
  const state = useAtomValue(workflowStateAtom);
  const pdfFile = useAtomValue(pdfFileAtom);
  const signingMethod = useAtomValue(signingMethodAtom);
  const pin = useAtomValue(pinAtom);
  const selectedReader = useAtomValue(selectedReaderAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const selectedCertificate = useAtomValue(selectedCertificateAtom);
  const includeTimestamp = useAtomValue(includeTimestampAtom);

  const apiClient = new ApiClient();
  // Use a single shared IcanopeeService instance to maintain session/card state
  const icanopee = useMemo(() => new IcanopeeService(), []);

  const handleApiResponse = (response: { logs?: LogEntry[] }, successMessage: string) => {
    if (response.logs) addLogs(response.logs);
    notifications.show({ title: "Success", message: successMessage, color: "green" });
  };

  const handleError = (err: unknown, step: string) => {
    const message =
      err instanceof Error ? err.message : `An unknown error occurred during ${step}.`;
    notifications.show({ title: "Error", message, color: "red" });
    addLogs([{ timestamp: new Date().toISOString(), level: "error", source: "frontend", message }]);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => {
        const e = reader.error;
        if (e instanceof Error) {
          reject(e);
        } else {
          // DOMException or unknown error - provide a generic message
          reject(new Error("Failed to read file."));
        }
      };
    });

  const generateDemoPDF = async () => {
    setLoading(true);
    try {
      const response = await apiClient.generateDemoPDF({ config: {} });
      handleApiResponse(response, "Demo PDF generated successfully.");
      setWorkflowState({ step: "preSign", pdfBase64: response.pdfBase64, signedPdfBase64: null });
    } catch (e) {
      handleError(e, "PDF generation");
    } finally {
      setLoading(false);
    }
  };

  const runCurrentStep = async () => {
    setLoading(true);
    try {
      switch (state.step) {
        case "generate": {
          if (!pdfFile) throw new Error("No PDF file selected.");
          const base64 = await fileToBase64(pdfFile);
          setWorkflowState({ ...state, step: "preSign", pdfBase64: base64 });
          break;
        }

        case "preSign": {
          if (!state.pdfBase64) throw new Error("Missing PDF content.");
          const prepRes = await apiClient.preparePDF({ pdfBase64: state.pdfBase64, config: {} });
          handleApiResponse(prepRes, "PDF prepared for signing.");
          setWorkflowState({ ...state, ...prepRes, step: "sign" });
          break;
        }

        case "sign": {
          let certRes: { signerCertPem?: string; certificateChainPem?: string[] } = {};

          // STRICT WORKFLOW SEPARATION: Each signing method uses completely different code paths
          if (signingMethod === "mock") {
            // Mock HSM workflow - get certificate from mock service
            certRes = await apiClient.getMockCert();
          } else if (signingMethod === "cps") {
            // CPS workflow - ONLY use Icanopee, NO PKCS#11 calls
            if (!selectedReader) throw new Error("No CPS reader selected.");

            const logCallback = (level: LogEntry["level"], message: string) =>
              addLogs([{ timestamp: new Date().toISOString(), level, source: "cps", message }]);

            // Step 1: Connect to card (calls hl_getcpxcard)
            await icanopee.connectToCard(selectedReader, logCallback);

            // Step 2: Read card info and certificate (calls hl_readcpxcard)
            const card = await icanopee.readCard(selectedReader, pin, logCallback);
            certRes = { signerCertPem: card.certificate, certificateChainPem: [] };

            // IMPORTANT: CPS workflow ends here - no PKCS#11 operations
          } else if (signingMethod === "pkcs11") {
            // PKCS#11 workflow - ONLY use PKCS#11, NO Icanopee calls
            if (selectedSlot === null) throw new Error("No PKCS#11 slot selected.");
            if (!selectedCertificate) throw new Error("No certificate selected.");

            // Get certificates from the selected slot to find the matching one
            const response = await apiClient.getPKCS11Certificates({ slotId: selectedSlot, pin });

            if (response.logs) addLogs(response.logs);
            if (!response.success) {
              throw new Error(response.error?.message || "Failed to get certificates");
            }

            const selectedCert = response.certificates.find(
              (certItem: PKCS11CertificateInfo) => certItem.label === selectedCertificate,
            );
            if (!selectedCert)
              throw new Error(`Selected certificate not found: ${selectedCertificate}`);

            certRes = { signerCertPem: selectedCert.certificatePem, certificateChainPem: [] };

            // IMPORTANT: PKCS#11 workflow ends here - no Icanopee operations
          } else {
            throw new Error(`Unknown signing method: ${signingMethod as string}`);
          }

          if (!certRes.signerCertPem) throw new Error("Could not retrieve signer certificate.");

          // Common presign step for all methods
          const presignRes = await apiClient.presignPDF({
            messageDigestB64: state.messageDigestB64!,
            signerCertPem: certRes.signerCertPem,
          });
          handleApiResponse(presignRes, "Pre-sign complete.");
          setWorkflowState({ ...state, ...presignRes, ...certRes, step: "finalize" });
          break;
        }

        case "finalize": {
          let sigRes = { signatureB64: "" };

          // STRICT WORKFLOW SEPARATION: Each signing method uses completely different signing paths
          if (signingMethod === "mock") {
            // Mock HSM workflow - sign with mock service
            sigRes = await apiClient.mockSign(state.signedAttrsDerB64!);
          } else if (signingMethod === "cps") {
            // CPS workflow - ONLY use Icanopee, NO PKCS#11 calls
            if (!selectedReader) throw new Error("No CPS reader selected.");

            const logCallback = (level: LogEntry["level"], message: string) =>
              addLogs([{ timestamp: new Date().toISOString(), level, source: "cps", message }]);

            // Ensure card is connected
            await icanopee.connectToCard(selectedReader, logCallback);

            // IMPORTANT: pass the SignedAttributes DER to the HSM and set preHashed = false
            // so the device computes SHA-256(SignedAttributesDER) internally and signs it.
            const signedAttrsDerB64 = state.signedAttrsDerB64!;
            const signingResult = await icanopee.signWithCard(
              selectedReader,
              pin,
              signedAttrsDerB64, // s_dataToSignInBase64: DER(SET OF Attribute), base64
              logCallback,
            );

            // Validate CPS digest matches server-expected digest
            if (state.expectedDigestB64 && signingResult.digest) {
              const expectedDigest = state.expectedDigestB64.replace(/[=\s]/g, ""); // Normalize base64
              const cpsDigest = signingResult.digest.replace(/[=\s]/g, ""); // Normalize base64

              if (expectedDigest !== cpsDigest) {
                addLogs([
                  {
                    timestamp: new Date().toISOString(),
                    level: "error",
                    source: "cps",
                    message: `Digest mismatch! Expected: ${state.expectedDigestB64}, CPS returned: ${signingResult.digest}`,
                  },
                ]);
                throw new Error(
                  `CPS digest validation failed. Expected digest doesn't match CPS-computed digest. This could indicate data corruption or tampering.`,
                );
              } else {
                addLogs([
                  {
                    timestamp: new Date().toISOString(),
                    level: "success",
                    source: "cps",
                    message: "CPS digest validation passed - digests match",
                  },
                ]);
              }
            } else if (state.expectedDigestB64) {
              addLogs([
                {
                  timestamp: new Date().toISOString(),
                  level: "warning",
                  source: "cps",
                  message: "No digest returned by CPS - skipping validation",
                },
              ]);
            }

            sigRes = { signatureB64: signingResult.signature };

            // IMPORTANT: CPS workflow ends here - no PKCS#11 operations
          } else if (signingMethod === "pkcs11") {
            // PKCS#11 workflow - ONLY use PKCS#11, NO Icanopee calls
            if (selectedSlot === null) throw new Error("No PKCS#11 slot selected.");
            if (!selectedCertificate) throw new Error("No certificate selected.");

            const signedAttrsDerB64 = state.signedAttrsDerB64!;

            // Call the backend PKCS#11 signing API
            const response = await apiClient.signWithPKCS11({
              slotId: selectedSlot,
              pin,
              dataToSignB64: signedAttrsDerB64, // DER(signedAttributes) in base64
              certificateFilter: { label: selectedCertificate },
            });

            if (response.logs) addLogs(response.logs);
            if (!response.success) {
              throw new Error(response.error?.message || "PKCS#11 signing failed");
            }

            sigRes = { signatureB64: response.signatureB64 };

            // IMPORTANT: PKCS#11 workflow ends here - no Icanopee operations
          } else {
            throw new Error(`Unknown signing method: ${signingMethod as string}`);
          }

          const finalizeRequest: FinalizeRequest = {
            preparedPdfBase64: state.preparedPdfBase64!,
            byteRange: state.byteRange!,
            signedAttrsDerB64: state.signedAttrsDerB64!,
            signatureB64: sigRes.signatureB64,
            signerCertPem: state.signerCertPem!,
            certificateChainPem: state.certificateChainPem,
            withTimestamp: includeTimestamp, // control B-B (false) vs B-T (true)
          };

          const finalizeRes = await apiClient.finalizePDF(finalizeRequest);
          handleApiResponse(finalizeRes, "PDF finalized and timestamped.");

          setWorkflowState({
            ...state,
            signedPdfBase64: finalizeRes.signedPdfBase64,
            step: "verify",
          });
          break;
        }

        case "verify": {
          const verifyRes = await apiClient.verifyPDF({ pdfBase64: state.signedPdfBase64! });
          handleApiResponse(verifyRes, "Verification complete.");
          setWorkflowState({ ...state, step: "completed" });
          break;
        }
      }
    } catch (e) {
      handleError(e, state.step);
    } finally {
      setLoading(false);
    }
  };

  return { generateDemoPDF, runCurrentStep };
};
