// packages/frontend/src/store/atoms.ts

import { notifications } from "@mantine/notifications";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";

import { ApiClient } from "../services/api";
import { IcanopeeService } from "../services/icanopee";

import type { LogEntry, PcscReader, FinalizeRequest } from "@pades-poc/shared";

// --- Base State Atoms ---
export type WorkflowStep = "generate" | "preSign" | "sign" | "finalize" | "verify" | "completed";

export interface WorkflowState {
  step: WorkflowStep;
  pdfBase64: string | null;
  preparedPdfBase64?: string;
  byteRange?: [number, number, number, number];
  messageDigestB64?: string;
  toBeSignedB64?: string;
  signedAttrsDerB64?: string;
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
export const signingMethodAtom = atom<"mock" | "cps">("mock");
export const pinAtom = atom<string>("");
export const availableReadersAtom = atom<PcscReader[]>([]);
export const selectedReaderAtom = atom<string | null>(null);
export const icanopeeStatusAtom = atom<"idle" | "loading" | "error">("idle");
export const icanopeeErrorAtom = atom<string | null>(null);

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

  switch (state.step) {
    case "generate":
      // allow continue when a file is selected OR a base64 PDF already exists
      return !!get(pdfFileAtom) || !!state.pdfBase64;
    case "preSign":
      // allow continue to run the prepare API when we have a PDF to prepare
      return !!state.pdfBase64;
    case "sign":
      if (signingMethod === "mock") return !!state.messageDigestB64;
      return !!state.messageDigestB64 && pin.length >= 4 && !!selectedReader;
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

// UI preferences
export const showLogTimestampsAtom = atom<boolean>(true);
export const indentBackendLogsAtom = atom<boolean>(true);

// Signature-level preference (B-B vs B-T)
export const includeTimestampAtom = atom<boolean>(true);

export const useWorkflowActions = () => {
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const setLoading = useSetAtom(loadingAtom);
  const addLogs = useSetAtom(addLogsAtom);
  const state = useAtomValue(workflowStateAtom);
  const pdfFile = useAtomValue(pdfFileAtom);
  const signingMethod = useAtomValue(signingMethodAtom);
  const pin = useAtomValue(pinAtom);
  const selectedReader = useAtomValue(selectedReaderAtom);
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
          if (signingMethod === "mock") {
            certRes = await apiClient.getMockCert();
          } else {
            if (!selectedReader) throw new Error("No CPS reader selected.");

            // Fixed: Connect to card first, then read it (following the working flow sequence)
            const logCallback = (level: LogEntry["level"], message: string) =>
              addLogs([{ timestamp: new Date().toISOString(), level, source: "cps", message }]);

            // Step 1: Connect to card (calls hl_getcpxcard)
            await icanopee.connectToCard(selectedReader, logCallback);

            // Step 2: Read card info and certificate (calls hl_readcpxcard)
            const card = await icanopee.readCard(selectedReader, pin, logCallback);
            certRes = { signerCertPem: card.certificate, certificateChainPem: [] };
          }
          if (!certRes.signerCertPem) throw new Error("Could not retrieve signer certificate.");
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

          if (signingMethod === "mock") {
            // Mock HSM signs the DER directly (unchanged)
            sigRes = await apiClient.mockSign(state.toBeSignedB64!);
          } else {
            // CPS path: let the HSM hash + sign the SignedAttributes DER
            if (!selectedReader) throw new Error("No CPS reader selected.");

            const logCallback = (level: LogEntry["level"], message: string) =>
              addLogs([{ timestamp: new Date().toISOString(), level, source: "cps", message }]);

            // Ensure card is connected
            await icanopee.connectToCard(selectedReader, logCallback);

            // IMPORTANT: pass the SignedAttributes DER to the HSM and set preHashed = false
            // so the device computes SHA-256(SignedAttributesDER) internally and signs it.
            const signedAttrsDerB64 = state.signedAttrsDerB64!;
            const { signature } = await icanopee.signWithCard(
              selectedReader,
              pin,
              signedAttrsDerB64, // s_stringToSign: DER(SET OF Attribute), base64
              logCallback,
            );
            sigRes = { signatureB64: signature };
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
