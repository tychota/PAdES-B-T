import { useAtomValue, useSetAtom } from "jotai";
import React, { useRef } from "react";

import { ApiClient } from "../services/api";
import { IcanopeeService } from "../services/icanopee";
import {
  workflowStateAtom,
  pdfMetadataAtom,
  signingConfigAtom,
  loadingAtom,
  errorAtom,
  logsAtom,
  signingMethodAtom,
  pinAtom,
  selectedReaderAtom,
} from "../store/atoms";

import { StepSign } from "./workflow/steps/StepSign";
import { StepUpload } from "./workflow/steps/StepUpload";
import { WorkflowActions } from "./workflow/WorkflowActions";
import { WorkflowProgress } from "./workflow/WorkflowProgress";

import type { LogEntry } from "@pades-poc/shared";

interface PDFWorkflowProps {
  apiClient: ApiClient;
}

export const PDFWorkflow: React.FC<PDFWorkflowProps> = ({ apiClient }) => {
  const workflowState = useAtomValue(workflowStateAtom);
  const pdfMetadata = useAtomValue(pdfMetadataAtom);
  const signingConfig = useAtomValue(signingConfigAtom);
  const error = useAtomValue(errorAtom);
  const logs = useAtomValue(logsAtom);
  const signingMethod = useAtomValue(signingMethodAtom);
  const pin = useAtomValue(pinAtom);
  const selectedReader = useAtomValue(selectedReaderAtom);

  const setWorkflowState = useSetAtom(workflowStateAtom);
  const setPdfMetadata = useSetAtom(pdfMetadataAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const setLogs = useSetAtom(logsAtom);

  const icanopeeService = useRef(new IcanopeeService());

  const addLog = (level: LogEntry["level"], message: string): void => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: "frontend",
      message,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const addBackendLogs = (backendLogs: LogEntry[]): void => {
    const mappedLogs = backendLogs.map((log) => ({ ...log, source: "backend" as const }));
    setLogs((prev) => [...prev, ...mappedLogs]);
  };

  const generateTimestamp = (): string => {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  };

  const resetWorkflow = (): void => {
    setWorkflowState({
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
    setPdfMetadata(null);
    setError(null);
  };

  const handleNextStep = async (): Promise<void> => {
    setError(null);
    setLoading(true);

    try {
      switch (workflowState.step) {
        case "prepare":
          await handlePrepare();
          break;
        case "presign":
          await handlePresign();
          break;
        case "sign":
          await handleSign();
          break;
        case "finalize":
          await handleFinalize();
          break;
        case "verify":
          await handleVerify();
          break;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur: ${errorMessage}`);
      addLog("error", `Step ${workflowState.step} failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async (): Promise<void> => {
    addLog("info", "Preparing PDF for signing...");

    const response = await apiClient.preparePDF({
      pdfBase64: workflowState.pdfBase64,
      config: signingConfig,
    });

    if (response.logs) {
      addBackendLogs(response.logs);
    }

    if (response.success) {
      setWorkflowState((prev) => ({
        ...prev,
        preparedPdfBase64: response.preparedPdfBase64,
        byteRange: response.byteRange,
        messageDigestB64: response.messageDigestB64,
        step: "presign",
      }));
      addLog("success", "PDF prepared for signing");
    } else {
      throw new Error(response.error?.message || "Preparation failed");
    }
  };

  const handlePresign = async (): Promise<void> => {
    addLog("info", "Building signed attributes...");

    // Get certificate for presign step
    let signerCert = "";
    if (signingMethod === "mock") {
      const mockResponse = await apiClient.mockSign("dummy");
      signerCert = mockResponse.signerCertPem;
    } else if (signingMethod === "cps") {
      addLog("info", "Fetching signer certificate from CPS card...");
      const cardInfo = await icanopeeService.current.readCard(
        selectedReader,
        pin,
        (level, message) => addLog(level, `[Icanopee] ${message}`),
      );
      signerCert = cardInfo.certificate;
      if (!signerCert) {
        throw new Error("No certificate returned from CPS card");
      }
      addLog("success", "Signer certificate fetched from CPS card");
    }

    const response = await apiClient.presignPDF({
      messageDigestB64: workflowState.messageDigestB64,
      signerCertPem: signerCert,
    });

    if (response.logs) {
      addBackendLogs(response.logs);
    }

    if (response.success) {
      setWorkflowState((prev) => ({
        ...prev,
        toBeSignedB64: response.toBeSignedB64,
        signedAttrsDerB64: response.signedAttrsDerB64,
        step: "sign",
      }));
      addLog("success", "Signed attributes built");
    } else {
      throw new Error(response.error?.message || "Presign failed");
    }
  };

  const handleSign = async (): Promise<void> => {
    let signature: string;
    let certificate: string;

    if (signingMethod === "mock") {
      addLog("info", "Signing with Mock HSM...");
      const response = await apiClient.mockSign(workflowState.toBeSignedB64);

      if (!response.success) {
        throw new Error(response.error?.message || "Mock signing failed");
      }

      signature = response.signatureB64;
      certificate = response.signerCertPem;
      addLog("success", "Signed with Mock HSM");
    } else {
      addLog("info", `Signing with CPS card in ${selectedReader}...`);

      if (!pin || pin.length < 4) {
        throw new Error("PIN CPS requis (4-8 chiffres)");
      }

      const result = await icanopeeService.current.completeSigningWorkflow(
        selectedReader,
        pin,
        workflowState.toBeSignedB64,
        (level, message) => addLog(level, `[Icanopee] ${message}`),
      );

      signature = result.signature;
      certificate = result.certificate;
      addLog("success", `Signed with CPS card: ${result.cardInfo.holderName}`);
    }

    setWorkflowState((prev) => ({
      ...prev,
      signatureB64: signature,
      signerCertPem: certificate,
      step: "finalize",
    }));
  };

  const handleFinalize = async (): Promise<void> => {
    addLog("info", "Finalizing signed PDF with timestamp...");

    const response = await apiClient.finalizePDF({
      preparedPdfBase64: workflowState.preparedPdfBase64,
      byteRange: workflowState.byteRange,
      signedAttrsDerB64: workflowState.signedAttrsDerB64,
      signatureB64: workflowState.signatureB64,
      signerCertPem: workflowState.signerCertPem,
    });

    if (response.logs) {
      addBackendLogs(response.logs);
    }

    if (response.success) {
      setWorkflowState((prev) => ({
        ...prev,
        signedPdfBase64: response.signedPdfBase64,
        step: "verify",
      }));
      addLog("success", "PDF signed and timestamped (PAdES-B-T)");
    } else {
      throw new Error(response.error?.message || "Finalize failed");
    }
  };

  const handleVerify = async (): Promise<void> => {
    addLog("info", "Verifying signed PDF...");

    const response = await apiClient.verifyPDF({
      pdfBase64: workflowState.signedPdfBase64,
    });

    if (response.logs) {
      addBackendLogs(response.logs);
    }

    if (response.success) {
      const result = response.result;
      const status = result.isCryptographicallyValid ? "✅ VALIDE" : "❌ INVALIDE";
      const compliance = result.isPAdESCompliant ? "Conforme PAdES-B-T" : "Non conforme";

      addLog("success", `Verification: ${status} - ${compliance}`);
      if (result.signerCN) {
        addLog("info", `Signataire: ${result.signerCN}`);
      }
      if (result.timestampTime) {
        addLog("info", `Horodatage: ${new Date(result.timestampTime).toLocaleString("fr-FR")}`);
      }

      setWorkflowState((prev) => ({ ...prev, step: "completed" }));
    } else {
      throw new Error(response.error?.message || "Verification failed");
    }
  };

  const downloadPDF = (type: "original" | "signed"): void => {
    const base64 = type === "signed" ? workflowState.signedPdfBase64 : workflowState.pdfBase64;
    if (!base64 || !pdfMetadata) return;

    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const timestamp = generateTimestamp();
      const baseName = pdfMetadata.name.replace(/\.pdf$/i, "");
      const suffix = type === "signed" ? "_signed" : "_original";

      link.href = url;
      link.download = `${baseName}_${timestamp}${suffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog("info", `PDF ${type} downloaded: ${link.download}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      addLog("error", `Download failed: ${errorMessage}`);
    }
  };

  const previewPDF = (): string => {
    const base64 = workflowState.signedPdfBase64 || workflowState.pdfBase64;
    return `data:application/pdf;base64,${base64}`;
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString("fr-FR");
  };

  const clearLogs = (): void => {
    setLogs([]);
  };

  const renderCurrentStepContent = () => {
    switch (workflowState.step) {
      case "upload":
        return <StepUpload apiClient={apiClient} />;
      case "sign":
        return <StepSign />;
      case "completed":
        return (
          <div className="step-content">
            <div className="completion-section">
              <div className="completion-content">
                <div className="completion-header">
                  <h3>🎉 Signature terminée avec succès !</h3>
                  <p>Votre document a été signé selon le standard PAdES-B-T avec horodatage.</p>
                </div>
                <div className="completion-actions">
                  <button
                    onClick={() => downloadPDF("signed")}
                    className="btn btn-success btn-large"
                    type="button"
                  >
                    💾 Télécharger PDF signé
                  </button>
                  <button onClick={resetWorkflow} className="btn btn-secondary" type="button">
                    🔄 Nouveau document
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="step-content">
            <div className="step-header">
              <h3>⏳ Étape automatique</h3>
              <p>Cette étape se déroule automatiquement. Cliquez sur continuer pour poursuivre.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="pdf-workflow">
      <WorkflowProgress />

      <div className="workflow-content">{renderCurrentStepContent()}</div>

      <WorkflowActions onNext={() => void handleNextStep()} onReset={resetWorkflow} />

      {/* Error Display */}
      {error && (
        <div className="error-display">
          <div className="error-content">
            <div className="error-icon">❌</div>
            <div className="error-message">
              <h4>Erreur</h4>
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* PDF Status */}
      {pdfMetadata && (
        <div className="pdf-status-section">
          <div className="pdf-status">
            <div className="pdf-info">
              <div className="pdf-info__icon">📄</div>
              <div className="pdf-info__details">
                <h4>{pdfMetadata.name}</h4>
                <p>Taille: {(pdfMetadata.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <div className="pdf-actions">
              <button
                onClick={() => downloadPDF("original")}
                className="btn btn-outline btn-small"
                type="button"
              >
                💾 Original
              </button>
              {workflowState.signedPdfBase64 && (
                <button
                  onClick={() => downloadPDF("signed")}
                  className="btn btn-success btn-small"
                  type="button"
                >
                  💾 Signé
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview */}
      {(workflowState.pdfBase64 || workflowState.signedPdfBase64) && (
        <div className="pdf-preview-section">
          <h3>Aperçu du document</h3>
          <div className="pdf-viewer">
            <object data={previewPDF()} type="application/pdf" width="100%" height="500px">
              <p>
                Votre navigateur ne supporte pas l'affichage de PDF.{" "}
                <a href={previewPDF()} target="_blank" rel="noopener noreferrer">
                  Ouvrir dans un nouvel onglet
                </a>
              </p>
            </object>
          </div>
        </div>
      )}

      {/* Logs Section */}
      <div className="logs-section">
        <div className="logs-header">
          <h3>📋 Journal des opérations</h3>
          <button onClick={clearLogs} className="btn btn-outline btn-small" type="button">
            🗑️ Effacer
          </button>
        </div>
        <div className="logs-container">
          {logs.length === 0 ? (
            <div className="no-logs">Aucune opération effectuée</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`log-entry log-${log.level} log-${log.source}`}>
                <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                <span className="log-level">[{log.level.toUpperCase()}]</span>
                <span className="log-source">[{log.source.toUpperCase()}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
