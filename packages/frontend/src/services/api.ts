import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";

import type {
  HealthResponse,
  PrepareRequest,
  PrepareResponse,
  PresignRequest,
  PresignResponse,
  FinalizeRequest,
  FinalizeResponse,
  VerificationRequest,
  VerificationResponse,
  GenerateDemoPDFRequest,
  GenerateDemoPDFResponse,
  MockSignResponse,
  PAdESError,
  LogEntry,
  DebugPdfObjectsResponse,
  DebugCmsRequest,
  DebugCmsResponse,
  PKCS11SlotsResponse,
  PKCS11CertificatesRequest,
  PKCS11CertificatesResponse,
  PKCS11SigningRequest,
  PKCS11SigningResponse,
} from "@pades-poc/shared";

interface ApiErrorResponse {
  error: PAdESError;
  logs?: LogEntry[];
}

export class ApiRequestError extends Error {
  public requestBody?: unknown;
  public logs?: LogEntry[];
  constructor(message: string, requestBody?: unknown, logs?: LogEntry[]) {
    super(message);
    this.name = "ApiRequestError";
    if (requestBody !== undefined) this.requestBody = requestBody;
    if (logs) this.logs = logs;
  }
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = "/api") {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    this.client.interceptors.request.use(
      (config) => {
        const method = config.method?.toUpperCase() ?? "UNKNOWN";
        const url = config.url ?? "unknown";
        console.log(`[API] ${method} ${url}`);
        return config;
      },
      (error: unknown) => {
        console.error("[API] Request error:", error);
        return Promise.reject(new Error("Request configuration failed"));
      },
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (this.isAxiosError(error) && error.response?.data) {
          const responseData = error.response.data as ApiErrorResponse;
          const apiError = responseData.error;
          const requestBody: unknown = error.config?.data;
          throw new ApiRequestError(
            `[${apiError.code}] ${apiError.message}`,
            requestBody,
            responseData.logs,
          );
        }
        if (this.isAxiosError(error) && error.config?.data !== undefined) {
          throw new ApiRequestError("API request failed", error.config.data as unknown);
        }
        throw new Error("API request failed");
      },
    );
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  async checkHealth(): Promise<HealthResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<HealthResponse & { logs?: LogEntry[] }> =
      await this.client.get("/health");
    return response.data;
  }

  async generateDemoPDF(
    request: GenerateDemoPDFRequest,
  ): Promise<GenerateDemoPDFResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<GenerateDemoPDFResponse & { logs?: LogEntry[] }> =
      await this.client.post("/pdf/generate", request);
    return response.data;
  }

  async preparePDF(request: PrepareRequest): Promise<PrepareResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<PrepareResponse & { logs?: LogEntry[] }> = await this.client.post(
      "/pdf/prepare",
      request,
    );
    return response.data;
  }

  async presignPDF(request: PresignRequest): Promise<PresignResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<PresignResponse & { logs?: LogEntry[] }> = await this.client.post(
      "/pdf/presign",
      request,
    );
    return response.data;
  }

  async finalizePDF(request: FinalizeRequest): Promise<FinalizeResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<FinalizeResponse & { logs?: LogEntry[] }> =
      await this.client.post("/pdf/finalize", request);
    return response.data;
  }

  async verifyPDF(
    request: VerificationRequest,
  ): Promise<VerificationResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<VerificationResponse & { logs?: LogEntry[] }> =
      await this.client.post("/pdf/verify", request);
    return response.data;
  }

  async mockSign(toBeSignedB64: string): Promise<MockSignResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<MockSignResponse & { logs?: LogEntry[] }> =
      await this.client.post("/mock/sign", { toBeSignedB64 });
    return response.data;
  }

  // NEW: fetch mock certificate/chain (optional, supports your new /mock/cert endpoint)
  async getMockCert(): Promise<{
    success: boolean;
    signerCertPem?: string;
    certificateChainPem?: string[];
  }> {
    const response: AxiosResponse<{
      success: boolean;
      signerCertPem?: string;
      certificateChainPem?: string[];
    }> = await this.client.get("/mock/cert");
    return response.data;
  }

  // NEW: Debug endpoints
  async debugPdfObjects(
    pdfBase64: string,
    onlySignatureObjects = true,
    collapseStreams = true,
  ): Promise<DebugPdfObjectsResponse> {
    const response: AxiosResponse<DebugPdfObjectsResponse> = await this.client.post(
      "/debug/pdf-objects",
      { pdfBase64, onlySignatureObjects, collapseStreams },
    );
    return response.data;
  }

  async debugCms(req: DebugCmsRequest): Promise<DebugCmsResponse> {
    const response: AxiosResponse<DebugCmsResponse> = await this.client.post("/debug/cms", req);
    return response.data;
  }

  // PKCS#11: Get available slots
  async getPKCS11Slots(): Promise<PKCS11SlotsResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<PKCS11SlotsResponse & { logs?: LogEntry[] }> = 
      await this.client.get("/pkcs11/slots");
    return response.data;
  }

  // PKCS#11: Get certificates from slot
  async getPKCS11Certificates(request: PKCS11CertificatesRequest): Promise<PKCS11CertificatesResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<PKCS11CertificatesResponse & { logs?: LogEntry[] }> = 
      await this.client.post("/pkcs11/certificates", request);
    return response.data;
  }

  // PKCS#11: Sign data
  async signWithPKCS11(request: PKCS11SigningRequest): Promise<PKCS11SigningResponse & { logs?: LogEntry[] }> {
    const response: AxiosResponse<PKCS11SigningResponse & { logs?: LogEntry[] }> = 
      await this.client.post("/pkcs11/sign", request);
    return response.data;
  }

  // Generic fetch method for custom endpoints
  async fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<unknown> {
    const method = options?.method ?? "GET";
    const config = {
      method: method.toLowerCase(),
      url,
      headers: options?.headers ?? {},
      data: options?.body ? JSON.parse(options.body) as unknown : undefined,
    };
    
    const response = await this.client.request(config);
    return response.data as unknown;
  }
}
