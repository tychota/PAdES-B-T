import React, { useState, useEffect, JSX } from "react";

import { PDFWorkflow } from "./components/PDFWorkflow";
import { ApiClient } from "./services/api";

import type { HealthResponse } from "@pades-poc/shared";

function App(): JSX.Element {
  const apiClient = new ApiClient();
  const [healthStatus, setHealthStatus] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void checkHealthStatus();
  }, []);

  const checkHealthStatus = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.checkHealth();
      setHealthStatus(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryConnection = (): void => {
    void checkHealthStatus();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>PAdES-B-T ePrescription POC</h1>
        <p>ETSI EN 319 142-1 compliant signatures for French healthcare ePrescriptions</p>
      </header>

      <main className="app-main">
        {/* Backend Status */}
        <div className="status-card">
          <h2>État du backend</h2>
          {loading && <p>Vérification de la connexion...</p>}
          {error && (
            <div className="error">
              <p>❌ Échec de la connexion: {error}</p>
              <button onClick={handleRetryConnection} type="button">
                Réessayer la connexion
              </button>
            </div>
          )}
          {healthStatus && (
            <div className="success">
              <p>✅ {healthStatus.service} is running</p>
              <div className="status-details">
                <span>Version: {healthStatus.version}</span>
                <span>Status: {healthStatus.status}</span>
                <span>
                  Dernière vérification: {new Date(healthStatus.timestamp).toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* PDF Workflow - Only show when backend is healthy */}
        {healthStatus && <PDFWorkflow apiClient={apiClient} />}

        {/* Next Steps Preview - Show when no healthy backend */}
        {!healthStatus && (
          <div className="workflow-card">
            <h2>Workflow de signature</h2>
            <p>
              Le workflow de signature PAdES-B-T sera disponible une fois que les services backend
              seront opérationnels.
            </p>
            <div className="workflow-steps">
              <div className="step">
                <h3>1. Générer/Charger PDF</h3>
                <p>Créer une ePrescription de démonstration ou charger un PDF existant</p>
              </div>
              <div className="step">
                <h3>2. Préparer pour signature</h3>
                <p>Calculer ByteRange et condensé du message</p>
              </div>
              <div className="step">
                <h3>3. Signer avec CPS/Mock HSM</h3>
                <p>Signature externe avec carte CPS ou Mock HSM</p>
              </div>
              <div className="step">
                <h3>4. Finaliser & Horodatage</h3>
                <p>Assembler le CMS avec horodatage (PAdES-B-T)</p>
              </div>
              <div className="step">
                <h3>5. Vérifier la signature</h3>
                <p>Valider l'intégrité cryptographique et la conformité</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>PAdES-B-T POC - Signatures électroniques conformes aux standards</p>
      </footer>
    </div>
  );
}

export default App;
