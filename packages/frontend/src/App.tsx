import React, { useState, useEffect, JSX } from "react";

import { ApiClient } from "./services/api";

import type { HealthResponse } from "@pades-poc/shared";

const apiClient = new ApiClient();

function App(): JSX.Element {
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
      const errorMessage = err instanceof Error ? err.message : "Failed to connect to backend";
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
        <div className="status-card">
          <h2>Backend Status</h2>
          {loading && <p>Checking connection...</p>}
          {error && (
            <div className="error">
              <p>❌ Connection failed: {error}</p>
              <button onClick={handleRetryConnection} type="button">
                Retry Connection
              </button>
            </div>
          )}
          {healthStatus && (
            <div className="success">
              <p>✅ {healthStatus.service} is running</p>
              <p>Version: {healthStatus.version}</p>
              <p>Status: {healthStatus.status}</p>
              <p>Last checked: {new Date(healthStatus.timestamp).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="workflow-card">
          <h2>Signing Workflow</h2>
          <p>
            PAdES-B-T signature workflow will be available here once the backend services are
            implemented.
          </p>
          <div className="workflow-steps">
            <div className="step">
              <h3>1. Generate/Upload PDF</h3>
              <p>Create demo ePrescription or upload existing PDF</p>
            </div>
            <div className="step">
              <h3>2. Prepare for Signing</h3>
              <p>Calculate ByteRange and message digest</p>
            </div>
            <div className="step">
              <h3>3. Sign with CPS/Mock HSM</h3>
              <p>External signature using CPS card or mock HSM</p>
            </div>
            <div className="step">
              <h3>4. Finalize & Timestamp</h3>
              <p>Assemble CMS with timestamp (PAdES-B-T)</p>
            </div>
            <div className="step">
              <h3>5. Verify Signature</h3>
              <p>Validate cryptographic integrity and compliance</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>PAdES-B-T POC - Standards compliant electronic signatures</p>
      </footer>
    </div>
  );
}

export default App;
