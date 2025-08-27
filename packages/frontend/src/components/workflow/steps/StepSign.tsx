import React, { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";

import { IcanopeeService } from "../../../services/icanopee";
import {
  signingMethodAtom,
  pinAtom,
  availableReadersAtom,
  selectedReaderAtom,
  loadingAtom,
  logsAtom,
} from "../../../store/atoms";

import type { LogEntry, PcscReader } from "@pades-poc/shared";

const STORAGE_KEY_PIN = "pades_cps_pin";

export const StepSign: React.FC = () => {
  const signingMethod = useAtomValue(signingMethodAtom);
  const pin = useAtomValue(pinAtom);
  const availableReaders = useAtomValue(availableReadersAtom);
  const selectedReader = useAtomValue(selectedReaderAtom);

  const setSigningMethod = useSetAtom(signingMethodAtom);
  const setPin = useSetAtom(pinAtom);
  const setAvailableReaders = useSetAtom(availableReadersAtom);
  const setSelectedReader = useSetAtom(selectedReaderAtom);
  const setLoading = useSetAtom(loadingAtom);
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

  // Load PIN from localStorage on mount
  useEffect(() => {
    const savedPin = localStorage.getItem(STORAGE_KEY_PIN);
    if (savedPin) {
      setPin(savedPin);
    }
  }, [setPin]);

  // Save PIN to localStorage when it changes
  useEffect(() => {
    if (pin.length >= 4) {
      localStorage.setItem(STORAGE_KEY_PIN, pin);
    }
  }, [pin]);

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
      addLog("error", `CPS reader detection failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="step-content">
      <div className="step-header">
        <h3>🔐 Signature électronique</h3>
        <p>Choisissez votre méthode de signature et configurez les paramètres</p>
      </div>

      {/* Signing Method Selection */}
      <div className="signing-method-section">
        <h4>Méthode de signature</h4>
        <div className="signing-method-cards">
          <div
            className={`signing-method-card ${
              signingMethod === "cps" ? "signing-method-card--active" : ""
            }`}
            onClick={() => setSigningMethod("cps")}
          >
            <div className="signing-method-card__icon">💳</div>
            <div className="signing-method-card__content">
              <h5>Carte CPS</h5>
              <p>Signature avec votre carte professionnelle de santé</p>
              <div className="signing-method-card__badge">Production</div>
            </div>
          </div>
          <div
            className={`signing-method-card ${
              signingMethod === "mock" ? "signing-method-card--active" : ""
            }`}
            onClick={() => setSigningMethod("mock")}
          >
            <div className="signing-method-card__icon">🧪</div>
            <div className="signing-method-card__content">
              <h5>Mock HSM</h5>
              <p>Signature de test avec certificat de démonstration</p>
              <div className="signing-method-card__badge signing-method-card__badge--test">
                Test
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CPS Configuration */}
      {signingMethod === "cps" && (
        <div className="cps-configuration">
          <h4>Configuration carte CPS</h4>

          <div className="cps-pin-section">
            <div className="form-group form-group--prominent">
              <label htmlFor="pin" className="form-label form-label--prominent">
                🔑 Code PIN CPS:
              </label>
              <input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Saisissez votre code PIN (4-8 chiffres)"
                maxLength={8}
                className="form-input form-input--prominent"
              />
              <div className="form-help">
                <span className="form-help__icon">💡</span>
                <span>Le PIN sera sauvegardé localement pour cette session</span>
                {pin && pin.length >= 4 && <span className="form-help__status">✅ PIN valide</span>}
              </div>
            </div>

            <button
              onClick={() => void handleGetCPSReaders()}
              disabled={!pin || pin.length < 4}
              className="btn btn-secondary"
              type="button"
            >
              🔍 Détecter les cartes CPS
            </button>
          </div>

          {availableReaders.length > 0 && (
            <div className="form-group">
              <label htmlFor="reader" className="form-label">
                📱 Lecteur de carte:
              </label>
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
              <div className="form-help">
                <span className="form-help__icon">✅</span>
                <span>{availableReaders.length} carte(s) CPS détectée(s)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mock HSM Info */}
      {signingMethod === "mock" && (
        <div className="mock-hsm-info">
          <div className="info-box">
            <div className="info-box__icon">🧪</div>
            <div className="info-box__content">
              <h5>Mode test activé</h5>
              <p>
                Utilisation d'un certificat de démonstration pour les tests. Cette méthode génère
                une signature valide mais ne doit pas être utilisée en production.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
