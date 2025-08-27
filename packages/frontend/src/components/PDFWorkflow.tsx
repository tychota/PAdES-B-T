import React, { useState, useRef, ChangeEvent } from "react";

import { ApiClient } from "../services/api";

import type { LogEntry, PDFSigningConfig } from "@pades-poc/shared";

interface PDFWorkflowProps {
  apiClient: ApiClient;
}

export const PDFWorkflow: React.FC<PDFWorkflowProps> = ({ apiClient }) => {
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [pdfMetadata, setPdfMetadata] = useState<{ size: number; name: string } | null>(null);
  const [signingConfig, setSigningConfig] = useState<PDFSigningConfig>({
    signerName: "Dr. MARTIN Pierre",
    reason: "ePrescription signature",
    location: "France",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const clearLogs = (): void => {
    setLogs([]);
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString("fr-FR");
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
      // 10MB limit
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

      setPdfBase64(base64);
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

      // Add backend logs
      response.logs?.forEach((log) => {
        setLogs((prev) => [...prev, { ...log, source: "backend" }]);
      });

      if (response.success) {
        setPdfBase64(response.pdfBase64);
        const size = Math.round((response.pdfBase64.length * 3) / 4); // Approximate binary size from base64
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
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

  const downloadPDF = (): void => {
    if (!pdfBase64 || !pdfMetadata) return;

    try {
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = pdfMetadata.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog("info", `PDF downloaded: ${pdfMetadata.name}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      addLog("error", `Download failed: ${errorMessage}`);
    }
  };

  const previewPDF = (): string => {
    return `data:application/pdf;base64,${pdfBase64}`;
  };

  return (
    <div className="pdf-workflow">
      <div className="workflow-section">
        <h2>📄 Étape 1: Génération/Upload du PDF</h2>
        <p>Créez une ePrescription de démonstration ou chargez un PDF existant</p>

        {/* Configuration Form */}
        <div className="config-form">
          <h3>Configuration de signature</h3>
          <div className="form-grid">
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
              />
            </div>
            <div className="form-group">
              <label htmlFor="location">Lieu:</label>
              <input
                id="location"
                type="text"
                value={signingConfig.location || ""}
                onChange={(e) =>
                  setSigningConfig((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="France"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="action-buttons">
          <button
            onClick={() => {
              void handleGenerateDemo();
            }}
            disabled={loading}
            className="btn btn-primary"
            type="button"
          >
            {loading ? "Génération..." : "🚀 Générer PDF de démonstration"}
          </button>

          <div className="file-upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                void handleFileUpload(e);
              }}
              style={{ display: "none" }}
              disabled={loading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn btn-secondary"
              type="button"
            >
              📂 Charger un PDF existant
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}

        {/* PDF Status */}
        {pdfMetadata && (
          <div className="pdf-status">
            <div className="status-info">
              <p>
                ✅ PDF chargé: <strong>{pdfMetadata.name}</strong>
              </p>
              <p>
                📐 Taille: <strong>{(pdfMetadata.size / 1024).toFixed(1)} KB</strong>
              </p>
            </div>
            <button onClick={downloadPDF} className="btn btn-download" type="button">
              💾 Télécharger
            </button>
          </div>
        )}
      </div>

      {/* PDF Preview */}
      {pdfBase64 && (
        <div className="pdf-preview-section">
          <h3>Aperçu du PDF</h3>
          <div className="pdf-viewer">
            <object data={previewPDF()} type="application/pdf" width="100%" height="500px">
              <p>
                Votre navigateur ne supporte pas l'affichage de PDF.
                <a href={previewPDF()} target="_blank" rel="noopener noreferrer">
                  Ouvrir dans un nouvel onglet
                </a>
              </p>
            </object>
          </div>
        </div>
      )}

      {/* Logs Display */}
      <div className="logs-section">
        <div className="logs-header">
          <h3>📋 Logs du processus</h3>
          <button onClick={clearLogs} className="btn btn-small" type="button">
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
