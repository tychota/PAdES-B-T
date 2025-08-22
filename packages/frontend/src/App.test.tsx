import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import App from "./App";
import { ApiClient } from "./services/api";

import type { HealthResponse } from "@pades-poc/shared";

// Mock the ApiClient
vi.mock("./services/api");
const MockedApiClient = vi.mocked(ApiClient);

// Create a proper mock implementation interface
interface MockApiClientInstance {
  checkHealth: ReturnType<typeof vi.fn>;
  generateDemoPDF: ReturnType<typeof vi.fn>;
  preparePDF: ReturnType<typeof vi.fn>;
  presignPDF: ReturnType<typeof vi.fn>;
  finalizePDF: ReturnType<typeof vi.fn>;
  verifyPDF: ReturnType<typeof vi.fn>;
  mockSign: ReturnType<typeof vi.fn>;
  getCPSReaders: ReturnType<typeof vi.fn>;
  signWithCPS: ReturnType<typeof vi.fn>;
}

describe("App Component", () => {
  let mockApiClient: MockApiClientInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock implementation with proper typing
    mockApiClient = {
      checkHealth: vi.fn(),
      generateDemoPDF: vi.fn(),
      preparePDF: vi.fn(),
      presignPDF: vi.fn(),
      finalizePDF: vi.fn(),
      verifyPDF: vi.fn(),
      mockSign: vi.fn(),
      getCPSReaders: vi.fn(),
      signWithCPS: vi.fn(),
    };

    MockedApiClient.mockImplementation(() => mockApiClient as unknown as ApiClient);
  });

  it("should render the app title", async () => {
    mockApiClient.checkHealth.mockResolvedValue({
      success: true,
      status: "OK",
      service: "PAdES-B-T Signature Service",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    } satisfies HealthResponse);

    await act(() => render(<App />));

    expect(screen.getByText("PAdES-B-T ePrescription POC")).toBeInTheDocument();
    expect(screen.getByText(/ETSI EN 319 142-1 compliant signatures/)).toBeInTheDocument();
  });

  it("should check backend health status on mount", async () => {
    const mockHealthResponse: HealthResponse = {
      success: true,
      status: "OK",
      service: "PAdES-B-T Signature Service",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    };

    mockApiClient.checkHealth.mockResolvedValue(mockHealthResponse);

    await act(() => render(<App />));

    await waitFor(() => {
      expect(mockApiClient.checkHealth).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText("✅ PAdES-B-T Signature Service is running")).toBeInTheDocument();
    });
  });

  it("should handle API errors gracefully", async () => {
    mockApiClient.checkHealth.mockRejectedValue(new Error("Connection failed"));

    await act(() => render(<App />));

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
    });
  });

  it("should display workflow steps", async () => {
    mockApiClient.checkHealth.mockResolvedValue({
      success: true,
      status: "OK",
      service: "Test Service",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    } satisfies HealthResponse);

    await act(() => render(<App />));

    expect(screen.getByText("1. Generate/Upload PDF")).toBeInTheDocument();
    expect(screen.getByText("2. Prepare for Signing")).toBeInTheDocument();
    expect(screen.getByText("3. Sign with CPS/Mock HSM")).toBeInTheDocument();
    expect(screen.getByText("4. Finalize & Timestamp")).toBeInTheDocument();
    expect(screen.getByText("5. Verify Signature")).toBeInTheDocument();
  });
});
