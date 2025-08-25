import { vi } from "vitest";

// Only set if not provided; your per-test vi.stubEnv still wins if you use it
if (!process.env.LOG_LEVEL) vi.stubEnv("LOG_LEVEL", "error");
if (!process.env.NODE_ENV) vi.stubEnv("NODE_ENV", "test");
