import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

import { padesBackendLogger, logPAdES } from "../logger";

// Type definitions for OpenAPI specification
interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

interface OpenApiSpec {
  openapi: string;
  info: OpenApiInfo;
  paths: Record<string, unknown>;
  components: Record<string, unknown>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const router = Router();

// Type guard function to check if an object is a valid OpenAPI spec
const isValidOpenApiSpec = (obj: unknown): obj is OpenApiSpec => {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  if (
    typeof candidate.openapi !== "string" ||
    !candidate.info ||
    typeof candidate.info !== "object" ||
    candidate.info === null ||
    typeof candidate.paths !== "object" ||
    candidate.paths === null ||
    typeof candidate.components !== "object" ||
    candidate.components === null
  ) {
    return false;
  }

  const info = candidate.info as Record<string, unknown>;
  return typeof info.title === "string";
};

const loadOpenApiSpec = (): OpenApiSpec => {
  try {
    const yamlPath = join(__dirname, "../openapi/openapi.yaml");
    const yamlContent = readFileSync(yamlPath, "utf8");
    const parsedSpec = parseYaml(yamlContent) as unknown;

    if (isValidOpenApiSpec(parsedSpec)) {
      const logEntry = padesBackendLogger.createLogEntry(
        "success",
        "backend",
        "OpenAPI spec loaded successfully",
        { specVersion: parsedSpec.openapi, title: parsedSpec.info.title },
      );
      logPAdES(logEntry);

      return parsedSpec;
    } else {
      throw new Error("Invalid OpenAPI specification structure");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const logEntry = padesBackendLogger.createLogEntry(
      "error",
      "backend",
      `Failed to load OpenAPI spec: ${errorMsg}`,
    );
    logPAdES(logEntry);

    return {
      openapi: "3.1.0",
      info: {
        title: "PAdES-B-T API (Spec Load Error)",
        version: "1.0.0",
        description: `Failed to load OpenAPI specification: ${errorMsg}`,
      },
      paths: {},
      components: {},
    };
  }
};

const openApiSpec = loadOpenApiSpec();

const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    displayRequestDuration: true,
    docExpansion: "list",
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
  customCss: `
      .swagger-ui .topbar { 
        display: none; 
      }
      .swagger-ui .info .title {
        color: #2c5282;
      }
      .swagger-ui .info .description p {
        color: #4a5568;
      }
    `,
  customSiteTitle: "PAdES-B-T API Documentation",
};

router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(openApiSpec, swaggerOptions));

router.get("/openapi.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(openApiSpec);
});

router.get("/openapi.yaml", (_req, res) => {
  const yamlPath = join(__dirname, "../openapi/openapi.yaml");
  res.setHeader("Content-Type", "text/yaml");
  res.sendFile(yamlPath);
});

const logEntry = padesBackendLogger.createLogEntry(
  "info",
  "backend",
  "Swagger UI documentation available at /api/docs",
);
logPAdES(logEntry);
