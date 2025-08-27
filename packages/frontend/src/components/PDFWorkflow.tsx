import React, { useState, useRef, ChangeEvent, useEffect } from "react";

import { ApiClient, ApiRequestError } from "../services/api";
import { IcanopeeService } from "../services/icanopee";

import type { LogEntry, PDFSigningConfig, PcscReader } from "@pades-poc/shared";

interface PDFWorkflowProps {
  apiClient: ApiClient;
}

type WorkflowStep = "upload" | "prepare" | "presign" | "sign" | "finalize" | "verify" | "completed";
type SigningMethod = "mock" | "cps";

interface WorkflowState {
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

const STORAGE_KEY_PIN = "pades_cps_pin";

export const PDFWorkflow: React.FC<PDFWorkflowProps> = ({ apiClient }) => {
  const [pdfMetadata, setPdfMetadata] = useState<{ size: number; name: string } | null>(null);
  const [signingConfig, setSigningConfig] = useState<PDFSigningConfig>({
    signerName: "Dr. MARTIN Pierre",
    reason: "ePrescription signature",
    location: "France",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingMethod, setSigningMethod] = useState<SigningMethod>("cps");
  const [pin, setPin] = useState<string>("");
  const [availableReaders, setAvailableReaders] = useState<PcscReader[]>([]);
  const [selectedReader, setSelectedReader] = useState<string>("");
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const icanopeeService = useRef(new IcanopeeService());

  // Load PIN from localStorage on mount
  useEffect(() => {
    const savedPin = localStorage.getItem(STORAGE_KEY_PIN);
    if (savedPin) {
      setPin(savedPin);
    }
  }, []);

  // Save PIN to localStorage when it changes
  useEffect(() => {
    if (pin.length >= 4) {
      localStorage.setItem(STORAGE_KEY_PIN, pin);
    }
  }, [pin]);

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

  const clearLogs = (): void => {
    setLogs([]);
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString("fr-FR");
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
      let logMsg = `Failed to load PDF file: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
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
      let logMsg = `Demo PDF generation failed: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async (): Promise<void> => {
    if (!workflowState.pdfBase64) return;

    setError(null);
    setLoading(true);
    addLog("info", "Preparing PDF for signing...");

    try {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur lors de la préparation: ${errorMessage}`);
      let logMsg = `PDF preparation failed: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePresign = async (): Promise<void> => {
    if (!workflowState.messageDigestB64) return;

    setError(null);
    setLoading(true);
    addLog("info", "Building signed attributes...");

    try {
      // Get certificate for presign step
      let signerCert = "";
      if (signingMethod === "mock") {
        const mockResponse = await apiClient.mockSign("dummy");
        signerCert = mockResponse.signerCertPem;
      } else if (signingMethod === "cps") {
        try {
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
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          setError(`Erreur lors de la récupération du certificat: ${errorMessage}`);
          addLog("error", `Failed to fetch signer certificate: ${errorMessage}`);
          setLoading(false);
          return;
        }
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur lors de la préparation de signature: ${errorMessage}`);
      let logMsg = `Presign failed: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGetCPSReaders = async (): Promise<void> => {
    setLoading(true);
    addLog("info", "Getting CPS readers from Icanopee...");

    try {
      const readers = await icanopeeService.current.getReaders((level, message) =>
        addLog(level, `[Icanopee] ${message}`),
      );

      const cpsReaders = readers.filter((r) => r.i_slotType === 3);
      setAvailableReaders(cpsReaders);

      if (cpsReaders.length > 0) {
        setSelectedReader(cpsReaders[0].s_name);
        addLog("success", `Found ${cpsReaders.length} CPS card(s)`);
      } else {
        throw new Error("No CPS cards found");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur CPS: ${errorMessage}`);
      addLog("error", `CPS reader detection failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (): Promise<void> => {
    if (!workflowState.toBeSignedB64) return;

    setError(null);
    setLoading(true);

    try {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (errorMessage === "WRONG_PINCODE") {
        setError("Code PIN incorrect. Veuillez réessayer.");
        addLog("error", "Wrong CPS PIN code");
      } else {
        setError(`Erreur de signature: ${errorMessage}`);
        addLog("error", `Signing failed: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async (): Promise<void> => {
    if (!workflowState.signatureB64) return;

    setError(null);
    setLoading(true);
    addLog("info", "Finalizing signed PDF with timestamp...");

    try {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur de finalisation: ${errorMessage}`);
      let logMsg = `Finalize failed: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (): Promise<void> => {
    if (!workflowState.signedPdfBase64) return;

    setError(null);
    setLoading(true);
    addLog("info", "Verifying signed PDF...");

    try {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Erreur de vérification: ${errorMessage}`);
      let logMsg = `Verification failed: ${errorMessage}`;
      if (err instanceof ApiRequestError && err.requestBody !== undefined) {
        logMsg += ` | Request body: ${JSON.stringify(err.requestBody)}`;
      }
      addLog("error", logMsg);
    } finally {
      setLoading(false);
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

  const renderCurrentStep = () => {
    switch (workflowState.step) {
      case "upload":
        return (
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
                    onChange={(e) =>
                      setSigningConfig((prev) => ({ ...prev, reason: e.target.value }))
                    }
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

            <div className="action-buttons">
              <button
                onClick={() => void handleGenerateDemo()}
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
                  onChange={(e) => void handleFileUpload(e)}
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
          </div>
        );

      case "prepare":
        return (
          <div className="workflow-section">
            <h2>⚙️ Étape 2: Préparation pour signature</h2>
            <p>Calcul du ByteRange et du condensé du message</p>

            <div className="action-buttons">
              <button
                onClick={() => void handlePrepare()}
                disabled={loading}
                className="btn btn-primary"
                type="button"
              >
                {loading ? "Préparation..." : "⚙️ Préparer pour signature"}
              </button>
            </div>
          </div>
        );

      case "presign":
        return (
          <div className="workflow-section">
            <h2>📝 Étape 3: Construction des attributs signés</h2>
            <p>Préparation des attributs CMS pour la signature externe</p>

            <div className="action-buttons">
              <button
                onClick={() => void handlePresign()}
                disabled={loading}
                className="btn btn-primary"
                type="button"
              >
                {loading ? "Construction..." : "📝 Construire attributs signés"}
              </button>
            </div>
          </div>
        );

      case "sign":
        return (
          <div className="workflow-section">
            <h2>🔐 Étape 4: Signature électronique</h2>
            <p>Choix de la méthode de signature et signature du document</p>

            {/* Signing Method Selection */}
            <div className="signing-method-section">
              <h3>Méthode de signature</h3>
              <div className="method-buttons">
                <button
                  onClick={() => setSigningMethod("cps")}
                  className={`btn ${signingMethod === "cps" ? "btn-primary" : "btn-secondary"}`}
                  type="button"
                >
                  💳 Carte CPS (Recommandé)
                </button>
                <button
                  onClick={() => setSigningMethod("mock")}
                  className={`btn ${signingMethod === "mock" ? "btn-primary" : "btn-secondary"}`}
                  type="button"
                >
                  🧪 Mock HSM (Test)
                </button>
              </div>
            </div>

            {/* CPS Configuration */}
            {signingMethod === "cps" && (
              <div className="cps-section">
                <div className="form-group">
                  <label htmlFor="pin">Code PIN CPS:</label>
                  <input
                    id="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="4-8 chiffres"
                    maxLength={8}
                  />
                  <small>Le PIN sera sauvegardé localement pour cette session</small>
                </div>

                <div className="action-buttons">
                  <button
                    onClick={() => void handleGetCPSReaders()}
                    disabled={loading || !pin || pin.length < 4}
                    className="btn btn-secondary"
                    type="button"
                  >
                    {loading ? "Recherche..." : "🔍 Détecter cartes CPS"}
                  </button>
                </div>

                {availableReaders.length > 0 && (
                  <div className="form-group">
                    <label htmlFor="reader">Lecteur CPS:</label>
                    <select
                      id="reader"
                      value={selectedReader}
                      onChange={(e) => setSelectedReader(e.target.value)}
                      className="form-input"
                    >
                      {availableReaders.map((reader: PcscReader, index) => (
                        <option key={index} value={reader.s_name}>
                          {reader.s_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="action-buttons">
              <button
                onClick={() => void handleSign()}
                disabled={
                  loading ||
                  (signingMethod === "cps" && (!pin || pin.length < 4 || !selectedReader))
                }
                className="btn btn-success"
                type="button"
              >
                {loading ? "Signature..." : "🔐 Signer le document"}
              </button>
            </div>
          </div>
        );

      case "finalize":
        return (
          <div className="workflow-section">
            <h2>📑 Étape 5: Finalisation et horodatage</h2>
            <p>Assemblage du CMS et intégration de l'horodatage (PAdES-B-T)</p>

            <div className="action-buttons">
              <button
                onClick={() => void handleFinalize()}
                disabled={loading}
                className="btn btn-primary"
                type="button"
              >
                {loading ? "Finalisation..." : "📑 Finaliser avec horodatage"}
              </button>
            </div>
          </div>
        );

      case "verify":
        return (
          <div className="workflow-section">
            <h2>✅ Étape 6: Vérification</h2>
            <p>Validation de la signature et de la conformité PAdES-B-T</p>

            <div className="action-buttons">
              <button
                onClick={() => void handleVerify()}
                disabled={loading}
                className="btn btn-success"
                type="button"
              >
                {loading ? "Vérification..." : "✅ Vérifier la signature"}
              </button>
            </div>
          </div>
        );

      case "completed":
        return (
          <div className="workflow-section success-section">
            <h2>🎉 Signature terminée !</h2>
            <p>Le PDF a été signé avec succès selon le standard PAdES-B-T</p>

            <div className="completion-actions">
              <button
                onClick={() => downloadPDF("signed")}
                className="btn btn-success"
                type="button"
              >
                💾 Télécharger PDF signé
              </button>
              <button onClick={resetWorkflow} className="btn btn-secondary" type="button">
                🔄 Nouveau document
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="pdf-workflow">
      {renderCurrentStep()}

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
              ✅ PDF: <strong>{pdfMetadata.name}</strong>
            </p>
            <p>
              📐 Taille: <strong>{(pdfMetadata.size / 1024).toFixed(1)} KB</strong>
            </p>
          </div>
          <div className="download-actions">
            <button
              onClick={() => downloadPDF("original")}
              className="btn btn-download"
              type="button"
            >
              💾 Original
            </button>
            {workflowState.signedPdfBase64 && (
              <button
                onClick={() => downloadPDF("signed")}
                className="btn btn-download"
                type="button"
              >
                💾 Signé
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF Preview */}
      {(workflowState.pdfBase64 || workflowState.signedPdfBase64) && (
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
