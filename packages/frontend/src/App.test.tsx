import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

import App from "./App";
import { ApiClient } from "./services/api";

// Mock the ApiClient
vi.mock("./services/api");
const MockedApiClient = vi.mocked(ApiClient);

describe("App Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the app title", () => {
    // Mock the API client instance and its methods
    const mockApiClient = {
      checkHealth: vi.fn().mockResolvedValue({
        success: true,
        status: "OK",
        service: "PAdES-B-T Signature Service",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      }),
    };

    MockedApiClient.mockImplementation(() => mockApiClient as any);

    render(<App />);

    expect(screen.getByText("PAdES-B-T ePrescription POC")).toBeInTheDocument();
    expect(screen.getByText(/ETSI EN 319 142-1 compliant signatures/)).toBeInTheDocument();
  });

  it("should check backend health status on mount", async () => {
    const mockHealthResponse = {
      success: true,
      status: "OK" as const,
      service: "PAdES-B-T Signature Service",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    };

    const mockApiClient = {
      checkHealth: vi.fn().mockResolvedValue(mockHealthResponse),
    };

    MockedApiClient.mockImplementation(() => mockApiClient as any);

    render(<App />);

    await waitFor(() => {
      expect(mockApiClient.checkHealth).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText("✅ PAdES-B-T Signature Service is running")).toBeInTheDocument();
    });
  });

  it("should handle API errors gracefully", async () => {
    const mockApiClient = {
      checkHealth: vi.fn().mockRejectedValue(new Error("Connection failed")),
    };

    MockedApiClient.mockImplementation(() => mockApiClient as any);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/❌ Connection failed/)).toBeInTheDocument();
    });
  });

  it("should display workflow steps", () => {
    const mockApiClient = {
      checkHealth: vi.fn().mockResolvedValue({}),
    };

    MockedApiClient.mockImplementation(() => mockApiClient as any);

    render(<App />);

    expect(screen.getByText("1. Generate/Upload PDF")).toBeInTheDocument();
    expect(screen.getByText("2. Prepare for Signing")).toBeInTheDocument();
    expect(screen.getByText("3. Sign with CPS/Mock HSM")).toBeInTheDocument();
    expect(screen.getByText("4. Finalize & Timestamp")).toBeInTheDocument();
    expect(screen.getByText("5. Verify Signature")).toBeInTheDocument();
  });
});
