import { useAtomValue, useSetAtom } from "jotai";
import React, { useRef, ChangeEvent } from "react";

import { ApiClient } from "../../../services/api";
import {
  signingConfigAtom,
  workflowStateAtom,
  pdfMetadataAtom,
  loadingAtom,
  errorAtom,
  logsAtom,
} from "../../../store/atoms";

import type { LogEntry } from "@pades-poc/shared";

interface StepUploadProps {
  apiClient: ApiClient;
}

export const StepUpload: React.FC<StepUploadProps> = ({ apiClient }) => {
  const signingConfig = useAtomValue(signingConfigAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const setPdfMetadata = useSetAtom(pdfMetadataAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const setLogs = useSetAtom(logsAtom);
  const setSigningConfig = useSetAtom(signingConfigAtom);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (file.type !== "application/pdf") {
      setError("Veuillez sélectionner un fichier PDF uniquement.");
      addLog("error", "Invalid file type selected - only PDF files are accepted");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Le fichier PDF doit faire moins de 10 MB.");
      addLog("error", `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB limit`);
      return;
    }

    setError(null);
    setLoading(true);
    addLog("info", `Loading PDF file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64 = btoa(String.fromCharCode(...uint8Array));

      setWorkflowState((prev) => ({ ...prev, pdfBase64: base64, step: "prepare" }));
      setPdfMetadata({ size: file.size, name: file.name });
      addLog("success", "PDF file loaded successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur lors du chargement du fichier: ${errorMessage}`);
      addLog("error", `Failed to load PDF file: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDemo = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    addLog("info", "Generating demo ePrescription PDF...");

    try {
      const response = await apiClient.generateDemoPDF({ config: signingConfig });

      if (response.logs) {
        addBackendLogs(response.logs);
      }

      if (response.success) {
        const size = Math.round((response.pdfBase64.length * 3) / 4);
        const timestamp = generateTimestamp();

        setWorkflowState((prev) => ({ ...prev, pdfBase64: response.pdfBase64, step: "prepare" }));
        setPdfMetadata({
          size,
          name: `eprescription_demo_${timestamp}.pdf`,
        });
        addLog("success", `Demo PDF generated successfully (${(size / 1024).toFixed(1)} KB)`);
      } else {
        throw new Error(response.error?.message || "Generation failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur lors de la génération: ${errorMessage}`);
      addLog("error", `Demo PDF generation failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="step-content">
      <div className="step-header">
        <h3>📄 Configuration et génération du PDF</h3>
        <p>Configurez les paramètres de signature et générez ou chargez votre document</p>
      </div>

      {/* Configuration Form */}
      <div className="config-section">
        <h4>Configuration de signature</h4>
        <div className="config-grid">
          <div className="form-group">
            <label htmlFor="signerName">Nom du prescripteur:</label>
            <input
              id="signerName"
              type="text"
              value={signingConfig.signerName || ""}
              onChange={(e) =>
                setSigningConfig((prev) => ({ ...prev, signerName: e.target.value }))
              }
              placeholder="Dr. MARTIN Pierre"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="reason">Motif de signature:</label>
            <input
              id="reason"
              type="text"
              value={signingConfig.reason || ""}
              onChange={(e) => setSigningConfig((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="ePrescription signature"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="location">Lieu:</label>
            <input
              id="location"
              type="text"
              value={signingConfig.location || ""}
              onChange={(e) => setSigningConfig((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="France"
              className="form-input"
            />
          </div>
        </div>
      </div>

      <div className="action-buttons">
        <button
          onClick={() => void handleGenerateDemo()}
          className="btn btn-primary btn-large"
          type="button"
        >
          🚀 Générer PDF de démonstration
        </button>

        <div className="file-upload-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => void handleFileUpload(e)}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary btn-large"
            type="button"
          >
            📂 Charger un PDF existant
          </button>
        </div>
      </div>
    </div>
  );
};
