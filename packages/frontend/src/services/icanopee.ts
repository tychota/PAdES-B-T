/**
 * Icanopee CPS Card Integration Service (Frontend)
 *
 * Communicates directly with local Icanopee middleware running on
 * https://localhost.icanopee.net:9982 to access CPS cards.
 *
 * This service must run in the frontend because Icanopee middleware
 * is only accessible from localhost and connects to local CPS hardware.
 */

import { DEFAULT_CONFIG } from "@pades-poc/shared";

import type { LogEntry, CPSCardInfo, PcscReader, IcanopeeSession } from "@pades-poc/shared";

export interface IcanopeeServiceConfig {
  endpoint: string;
  timeoutSeconds: number;
}

const DEFAULT_ICANOPEE_CONFIG: IcanopeeServiceConfig = {
  endpoint: DEFAULT_CONFIG.ICANOPEE_ENDPOINT,
  timeoutSeconds: DEFAULT_CONFIG.ICANOPEE_TIMEOUT,
};

// --- Response Types and Type Guards ---

interface ApiResponseBase {
  s_status?: string;
  i_apiErrorCode?: number;
  i_apiErrorType?: number;
  error?: { message?: string };
}

interface DcParameterResponse extends ApiResponseBase {
  success?: boolean;
  dcParameter?: string;
}

interface RegisterDcParameterResponse extends ApiResponseBase {
  s_status?: string;
}

interface OpenSessionResponse extends ApiResponseBase {
  s_status?: string;
  s_sessionId?: string;
  s_serviceVersion?: string;
  i_isProduction?: number;
}

interface GetReadersResponse extends ApiResponseBase {
  s_status?: string;
  Readers?: PcscReader[];
}

interface ConnectToCardResponse extends ApiResponseBase {
  s_status?: string;
}

interface ReadCardResponse extends ApiResponseBase {
  s_status?: string;
  s_cpxSerialNumber?: string;
  s_cpxValidityDate?: string;
  i_cpxCardType?: number;
  s_profession?: string;
  s_professionDescription?: string;
  s_speciality?: string;
  s_specialityDescription?: string;
  s_name?: string;
  s_given?: string;
  s_internalId?: string;
  s_signatureCertificatePEM?: string;
  s_certificate?: string;
}

interface SignWithCardResponse extends ApiResponseBase {
  s_status?: string;
  s_signature?: string;
  s_signatureCertificate?: string;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function isDcParameterResponse(val: unknown): val is DcParameterResponse {
  return isObject(val) && ("success" in val || "dcParameter" in val);
}

function isRegisterDcParameterResponse(val: unknown): val is RegisterDcParameterResponse {
  return isObject(val) && "s_status" in val;
}

function isOpenSessionResponse(val: unknown): val is OpenSessionResponse {
  return isObject(val) && "s_status" in val && "s_sessionId" in val;
}

function isGetReadersResponse(val: unknown): val is GetReadersResponse {
  return isObject(val) && "s_status" in val && "Readers" in val;
}

function isConnectToCardResponse(val: unknown): val is ConnectToCardResponse {
  return isObject(val) && "s_status" in val;
}

function isReadCardResponse(val: unknown): val is ReadCardResponse {
  return isObject(val) && "s_status" in val;
}

function isSignWithCardResponse(val: unknown): val is SignWithCardResponse {
  return isObject(val) && "s_status" in val;
}

/**
 * Frontend service for CPS card operations via local Icanopee middleware
 */
export class IcanopeeService {
  private readonly config: IcanopeeServiceConfig;
  private currentSession?: IcanopeeSession;
  private dcParameter?: string;
  private dcParameterRegistered = false;

  constructor(config: Partial<IcanopeeServiceConfig> = {}) {
    this.config = { ...DEFAULT_ICANOPEE_CONFIG, ...config };
  }

  /**
   * Set logging callback for frontend integration
   */
  private log(
    level: LogEntry["level"],
    message: string,
    context?: Record<string, unknown>,
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): void {
    if (onLog) {
      onLog(level, message);
    }

    console.log(`[${level.toUpperCase()}] ${message}`, context || "");
  }

  /**
   * Load DC parameter from backend
   */
  async loadDcParameter(
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<void> {
    if (this.dcParameter) return;

    this.log("info", "Loading DC parameter from backend", {}, onLog);

    try {
      const response = await fetch("/api/icanopee/dc-parameter");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isDcParameterResponse(data) || !data.success || !data.dcParameter) {
        let errorMessage = "No DC parameter received";
        if (
          isObject(data) &&
          "error" in data &&
          isObject(data.error) &&
          typeof data.error.message === "string"
        ) {
          errorMessage = data.error.message;
        }
        throw new Error(errorMessage);
      }

      this.dcParameter = data.dcParameter.replace(/\s+/g, ""); // Normalize base64
      this.dcParameterRegistered = false; // Reset registration status

      this.log(
        "success",
        "DC parameter loaded from backend",
        { length: this.dcParameter.length },
        onLog,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const msg = typeof errorMessage === "string" ? errorMessage : String(errorMessage);
      this.log("error", `Failed to load DC parameter: ${msg}`, {}, onLog);
      throw new Error(`DC parameter loading failed: ${msg}`);
    }
  }

  /**
   * Register DC parameter with Icanopee
   */
  async registerDcParameter(
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<void> {
    await this.loadDcParameter(onLog);

    if (this.dcParameterRegistered) return;

    this.log("info", "Registering DC parameter with Icanopee", {}, onLog);

    try {
      // Check if already registered
      const checkResponse = await fetch(
        `${this.config.endpoint}/remotecommand/isDcParameterRegistered`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s_dcparameters64: this.dcParameter }),
        },
      );

      if (!checkResponse.ok) {
        throw new Error(`HTTP ${checkResponse.status}: ${checkResponse.statusText}`);
      }

      const checkData: unknown = await checkResponse.json();
      if (!isObject(checkData) || typeof checkData.i_registered !== "number") {
        throw new Error("Invalid response from isDcParameterRegistered");
      }
      if (checkData.i_registered === 1) {
        this.dcParameterRegistered = true;
        this.log("info", "DC parameter already registered with Icanopee", {}, onLog);
        return;
      }

      // Register DC parameter
      const registerResponse = await fetch(
        `${this.config.endpoint}/remotecommand/registerDcParameter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s_dcparameters64: this.dcParameter }),
        },
      );

      if (!registerResponse.ok) {
        throw new Error(`HTTP ${registerResponse.status}: ${registerResponse.statusText}`);
      }

      const registerData: unknown = await registerResponse.json();
      if (!isRegisterDcParameterResponse(registerData)) {
        throw new Error("Invalid response from registerDcParameter");
      }
      if (registerData.s_status === "OK") {
        this.dcParameterRegistered = true;
        this.log("success", "DC parameter registered successfully", {}, onLog);
      } else {
        throw new Error(`Registration failed: ${registerData.s_status ?? "Unknown"}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log("error", `DC parameter registration failed: ${errorMessage}`, {}, onLog);
      throw new Error(`DC parameter registration failed: ${errorMessage}`);
    }
  }

  /**
   * Open session with Icanopee
   */
  async openSession(
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<IcanopeeSession> {
    await this.registerDcParameter(onLog);

    this.log("info", "Opening Icanopee session", {}, onLog);

    try {
      const response = await fetch(`${this.config.endpoint}/api/hl_opensession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // s_commandName is not part of CPSSigningRequest, but is required by API
          s_commandName: "hl_openSession",
          s_dcparameters64: this.dcParameter,
          i_getDcparamInformations: 1,
          i_timeoutInSeconds: this.config.timeoutSeconds,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isOpenSessionResponse(data) || data.s_status !== "OK" || !data.s_sessionId) {
        throw new Error(
          isObject(data) && typeof data.s_status === "string"
            ? `Session creation failed: ${data.s_status}`
            : "No session ID",
        );
      }

      this.currentSession = {
        sessionId: data.s_sessionId,
        timeoutInSeconds: this.config.timeoutSeconds,
        serviceVersion: data.s_serviceVersion || "unknown",
        isProduction: data.i_isProduction === 1,
      };

      this.log(
        "success",
        "Icanopee session opened successfully",
        {
          sessionId: this.currentSession.sessionId.substring(0, 8) + "...",
          version: this.currentSession.serviceVersion,
          production: this.currentSession.isProduction,
        },
        onLog,
      );

      return this.currentSession;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log("error", `Failed to open Icanopee session: ${errorMessage}`, {}, onLog);
      throw new Error(`Session creation failed: ${errorMessage}`);
    }
  }

  /**
   * Get current session, creating one if needed
   */
  async ensureSession(
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<IcanopeeSession> {
    if (!this.currentSession) {
      return this.openSession(onLog);
    }
    return this.currentSession;
  }

  /**
   * Get available PC/SC readers
   */
  async getReaders(
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<PcscReader[]> {
    const session = await this.ensureSession(onLog);

    this.log(
      "info",
      "Getting PC/SC readers",
      { sessionId: session.sessionId.substring(0, 8) + "..." },
      onLog,
    );

    try {
      const response = await fetch(`${this.config.endpoint}/api/hl_getpcscreaders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s_commandName: "hl_getPcscReaders",
          s_sessionId: session.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isGetReadersResponse(data) || data.s_status !== "OK") {
        throw new Error(
          isObject(data) && typeof data.s_status === "string"
            ? `Get readers failed: ${data.s_status}`
            : "Invalid response from getReaders",
        );
      }

      const readers: PcscReader[] = Array.isArray(data.Readers) ? data.Readers : [];
      const cpsReaders = readers.filter((r) => r.i_slotType === 3);

      this.log(
        "success",
        `Found ${readers.length} PC/SC readers (${cpsReaders.length} CPS)`,
        { total: readers.length, cps: cpsReaders.length },
        onLog,
      );

      return readers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log("error", `Failed to get readers: ${errorMessage}`, {}, onLog);
      throw new Error(`Reader enumeration failed: ${errorMessage}`);
    }
  }

  /**
   * Connect to CPS card
   */
  async connectToCard(
    readerName: string,
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<void> {
    const session = await this.ensureSession(onLog);

    this.log("info", `Connecting to CPS card in ${readerName}`, {}, onLog);

    try {
      const response = await fetch(`${this.config.endpoint}/api/hl_getcpxcard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s_commandName: "hl_getCpxCard",
          s_sessionId: session.sessionId,
          s_readerName: readerName,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isConnectToCardResponse(data) || data.s_status !== "OK") {
        throw new Error(
          isObject(data) && typeof data.s_status === "string"
            ? `Connect to card failed: ${data.s_status}`
            : "Invalid response from connectToCard",
        );
      }

      this.log("success", "Connected to CPS card successfully", { readerName }, onLog);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log("error", `Failed to connect to card: ${errorMessage}`, { readerName }, onLog);
      throw new Error(`Card connection failed: ${errorMessage}`);
    }
  }

  /**
   * Read CPS card information and certificate
   */
  async readCard(
    readerName: string,
    pin: string,
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<CPSCardInfo & { certificate: string }> {
    const session = await this.ensureSession(onLog);

    this.log("info", "Reading CPS card information", { readerName }, onLog);

    try {
      const response = await fetch(`${this.config.endpoint}/api/hl_readcpxcard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s_commandName: "hl_readCpxCard",
          s_sessionId: session.sessionId,
          s_readerName: readerName,
          s_pinCode: pin,
          i_returnCertificates: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isReadCardResponse(data) || data.s_status !== "OK") {
        // Handle specific error codes
        if (isObject(data) && data.i_apiErrorCode === 7 && data.i_apiErrorType === 1) {
          throw new Error("WRONG_PINCODE");
        }
        throw new Error(
          isObject(data) && typeof data.s_status === "string"
            ? `Read card failed: ${data.s_status}`
            : "Invalid response from readCard",
        );
      }

      const cardInfo: CPSCardInfo & { certificate: string } = {
        serialNumber: typeof data.s_cpxSerialNumber === "string" ? data.s_cpxSerialNumber : "",
        validityDate: typeof data.s_cpxValidityDate === "string" ? data.s_cpxValidityDate : "",
        cardType: typeof data.i_cpxCardType === "number" ? data.i_cpxCardType : 0,
        profession: typeof data.s_profession === "string" ? data.s_profession : "",
        professionDescription:
          typeof data.s_professionDescription === "string" ? data.s_professionDescription : "",
        speciality: typeof data.s_speciality === "string" ? data.s_speciality : "",
        specialityDescription:
          typeof data.s_specialityDescription === "string" ? data.s_specialityDescription : "",
        holderName: typeof data.s_name === "string" ? data.s_name : "",
        holderGivenName: typeof data.s_given === "string" ? data.s_given : "",
        internalId: typeof data.s_internalId === "string" ? data.s_internalId : "",
        certificate:
          typeof data.s_signatureCertificatePEM === "string"
            ? data.s_signatureCertificatePEM
            : typeof data.s_certificate === "string"
              ? data.s_certificate
              : "",
      };

      this.log(
        "success",
        "CPS card read successfully",
        {
          readerName,
          profession: cardInfo.professionDescription,
          holderName: cardInfo.holderName,
          serialNumber: cardInfo.serialNumber,
        },
        onLog,
      );

      return cardInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log("error", `Failed to read CPS card: ${errorMessage}`, { readerName }, onLog);

      // Re-throw with specific error for PIN issues
      if (errorMessage === "WRONG_PINCODE") {
        throw new Error("WRONG_PINCODE");
      }
      throw new Error(`Card read failed: ${errorMessage}`);
    }
  }

  /**
   * Sign data with CPS card
   */
  async signWithCard(
    readerName: string,
    pin: string,
    dataToSign: string, // base64
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<{ signature: string; certificate: string }> {
    const session = await this.ensureSession(onLog);

    this.log(
      "info",
      "Signing data with CPS card",
      { readerName, dataSize: dataToSign.length },
      onLog,
    );

    try {
      // s_commandName is not part of CPSSigningRequest, so we use a plain object
      const requestBody: Record<string, unknown> = {
        s_commandName: "hl_signWithCpxCard",
        s_sessionId: session.sessionId,
        s_pinCode: pin,
        s_stringToSign: dataToSign,
        i_digestType: 1, // SHA-256
      };

      const response = await fetch(`${this.config.endpoint}/api/hl_signwithcpxcard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isSignWithCardResponse(data) || data.s_status !== "OK") {
        // Handle specific error codes
        if (isObject(data) && data.i_apiErrorCode === 7 && data.i_apiErrorType === 1) {
          throw new Error("WRONG_PINCODE");
        }
        throw new Error(
          isObject(data) && typeof data.s_status === "string"
            ? `Signing failed: ${data.s_status}${typeof data.i_apiErrorCode === "number" ? ` (${data.i_apiErrorCode})` : ""}`
            : "Invalid response from signWithCard",
        );
      }

      if (!data.s_signature || typeof data.s_signature !== "string") {
        throw new Error("No signature returned from CPS card");
      }

      this.log(
        "success",
        "Data signed successfully with CPS card",
        { readerName, signatureSize: data.s_signature.length },
        onLog,
      );

      return {
        signature: data.s_signature,
        certificate:
          typeof data.s_signatureCertificate === "string" ? data.s_signatureCertificate : "",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const msg = typeof errorMessage === "string" ? errorMessage : String(errorMessage);
      this.log("error", `CPS card signing failed: ${msg}`, { readerName }, onLog);

      // Re-throw with specific error for PIN issues
      if (msg === "WRONG_PINCODE") {
        throw new Error("WRONG_PINCODE");
      }
      throw new Error(`CPS signing failed: ${msg}`);
    }
  }

  /**
   * Complete signing workflow: connect, read, and sign
   */
  async completeSigningWorkflow(
    readerName: string,
    pin: string,
    dataToSign: string,
    onLog?: (level: LogEntry["level"], message: string) => void,
  ): Promise<{
    signature: string;
    certificate: string;
    cardInfo: CPSCardInfo;
  }> {
    this.log("info", "Starting complete CPS signing workflow", { readerName }, onLog);

    try {
      // Step 1: Connect to card
      await this.connectToCard(readerName, onLog);

      // Step 2: Read card info and certificate
      const cardData = await this.readCard(readerName, pin, onLog);

      // Step 3: Sign data
      const signingResult = await this.signWithCard(readerName, pin, dataToSign, onLog);

      this.log(
        "success",
        "Complete CPS signing workflow completed successfully",
        {
          readerName,
          profession: cardData.professionDescription,
          holderName: cardData.holderName,
        },
        onLog,
      );

      return {
        signature: signingResult.signature,
        certificate: signingResult.certificate || cardData.certificate,
        cardInfo: cardData,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log(
        "error",
        `Complete CPS signing workflow failed: ${errorMessage}`,
        { readerName },
        onLog,
      );
      throw error; // Re-throw to preserve error type
    }
  }

  /**
   * Check if Icanopee is accessible
   */
  async checkConnection(): Promise<{ accessible: boolean; version?: string; error?: string }> {
    try {
      // Simple connectivity test
      const response = await fetch(
        `${this.config.endpoint}/remotecommand/isDcParameterRegistered`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s_dcparameters64: "test" }),
          signal: AbortSignal.timeout(5000), // 5 second timeout
        },
      );

      return {
        accessible: true,
        version: response.headers.get("eSanteConnect-Version") || "unknown",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        accessible: false,
        error: errorMessage,
      };
    }
  }
}
