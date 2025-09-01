import cors from "cors";
import dotenv from "dotenv";
import express from "express";

// Load environment variables
dotenv.config();

import { logPAdES, padesBackendLogger } from "./logger";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { router as apiRouter } from "./routes/api";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use("/api", apiRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  const startupEntry = padesBackendLogger.createLogEntry(
    "success",
    "backend",
    `🚀 PAdES-B-T Backend server running on http://localhost:${PORT.toString()}`,
    { port: PORT, environment: process.env.NODE_ENV || "development" },
  );
  logPAdES(startupEntry);

  const environmentEntry = padesBackendLogger.createLogEntry(
    "info",
    "backend",
    `📋 Environment: ${process.env.NODE_ENV || "development"}`,
  );
  logPAdES(environmentEntry);
});

export default app;
