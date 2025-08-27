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
  BaseApiResponse,
  PAdESError,
} from "@pades-poc/shared";

interface ApiErrorResponse {
  error: PAdESError;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = "/api") {
    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 second timeout for signature operations
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor for logging
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

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (this.isAxiosError(error) && error.response?.data) {
          const responseData = error.response.data as ApiErrorResponse;
          const apiError = responseData.error;
          // Attach request body if available
          const requestBody = error.config?.data;
          const customError: any = new Error(`[${apiError.code}] ${apiError.message}`);
          if (requestBody !== undefined) {
            customError.requestBody = requestBody;
          }
          throw customError;
        }
        // Attach request body if available for generic errors
        if (this.isAxiosError(error) && error.config?.data !== undefined) {
          const customError: any = new Error("API request failed");
          customError.requestBody = error.config.data;
          throw customError;
        }
        throw new Error("API request failed");
      },
    );
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  // Health check
  async checkHealth(): Promise<HealthResponse> {
    const response: AxiosResponse<HealthResponse> = await this.client.get("/health");
    return response.data;
  }

  // Generate demo PDF
  async generateDemoPDF(request: GenerateDemoPDFRequest): Promise<GenerateDemoPDFResponse> {
    const response: AxiosResponse<GenerateDemoPDFResponse> = await this.client.post(
      "/pdf/generate",
      request,
    );
    return response.data;
  }

  // Step 1: Prepare PDF
  async preparePDF(request: PrepareRequest): Promise<PrepareResponse> {
    const response: AxiosResponse<PrepareResponse> = await this.client.post(
      "/pdf/prepare",
      request,
    );
    return response.data;
  }

  // Step 2: Pre-sign
  async presignPDF(request: PresignRequest): Promise<PresignResponse> {
    const response: AxiosResponse<PresignResponse> = await this.client.post(
      "/pdf/presign",
      request,
    );
    return response.data;
  }

  // Step 3: Finalize
  async finalizePDF(request: FinalizeRequest): Promise<FinalizeResponse> {
    const response: AxiosResponse<FinalizeResponse> = await this.client.post(
      "/pdf/finalize",
      request,
    );
    return response.data;
  }

  // Verify signed PDF
  async verifyPDF(request: VerificationRequest): Promise<VerificationResponse> {
    const response: AxiosResponse<VerificationResponse> = await this.client.post(
      "/pdf/verify",
      request,
    );
    return response.data;
  }

  // Mock HSM signing
  async mockSign(toBeSignedB64: string): Promise<MockSignResponse> {
    const response: AxiosResponse<MockSignResponse> = await this.client.post("/mock/sign", {
      toBeSignedB64,
    });
    return response.data;
  }

  // CPS card operations
  async getCPSReaders(): Promise<BaseApiResponse> {
    const response: AxiosResponse<BaseApiResponse> = await this.client.post("/cps/readers");
    return response.data;
  }

  async signWithCPS(data: Record<string, unknown>): Promise<BaseApiResponse> {
    const response: AxiosResponse<BaseApiResponse> = await this.client.post("/cps/sign", data);
    return response.data;
  }
}
