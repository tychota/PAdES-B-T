# Coding Standards

This document outlines the coding standards and conventions used in the PAdES-B-T ePrescription POC project.

## Import/Export Conventions

### File Extensions

- **Never include file extensions** for TypeScript/JavaScript imports within the project
- **Always use type imports** when importing only types

```typescript
// ✅ Good
import type { LogEntry } from "./types/common";
import { createLogger } from "./utils/logger";

// ❌ Bad
import type { LogEntry } from "./types/common.js";
import type { LogEntry } from "./types/common.ts";
```

### Import Order

Imports should be ordered as follows:

1. Node.js built-ins
2. External packages
3. Internal packages (workspace)
4. Parent directory imports
5. Sibling directory imports
6. Index imports
7. Type-only imports

```typescript
// ✅ Good
import fs from "fs";
import path from "path";

import express from "express";
import winston from "winston";

import type { LogEntry } from "@pades-poc/shared";

import { parentUtility } from "../utils";

import { siblingService } from "./sibling-service";

import type { LocalType } from "./types";
```

### Type Imports

Always use `type` keyword for type-only imports:

```typescript
// ✅ Good
import type { APIResponse, LogEntry } from "@pades-poc/shared";
import { createPAdESError } from "@pades-poc/shared";

// ❌ Bad
import { APIResponse, LogEntry, createPAdESError } from "@pades-poc/shared";
```

## TypeScript Standards

### Strict Mode

- All packages use TypeScript strict mode
- No `any` types allowed (use `unknown` instead)
- All functions must have explicit return types for public APIs

### Naming Conventions

- **Constants**: `UPPER_SNAKE_CASE`
- **Variables/Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Files**: `kebab-case.ts` or `camelCase.ts`

```typescript
// ✅ Good
const API_ENDPOINT = 'https://api.example.com';
const userService = new UserService();
interface UserProfile { ... }
type ResponseData = { ... };

// ❌ Bad
const api_endpoint = 'https://api.example.com';
const UserService = new UserService();
interface userProfile { ... }
```

## Code Organization

### Barrel Exports

Use index files for clean public APIs:

```typescript
// src/services/index.ts
export { UserService } from "./user-service";
export { LoggingService } from "./logging-service";
export type { ServiceConfig } from "./types";
```

### Error Handling

- Use custom error types with error codes
- Always include context in errors
- Log errors at the appropriate level

```typescript
// ✅ Good
throw createPAdESError(ERROR_CODES.PDF_INVALID, "PDF file is corrupted", {
  fileSize,
  expectedFormat: "PDF",
});

// ❌ Bad
throw new Error("Bad PDF");
```

## Linting and Formatting

### ESLint

Run ESLint to check and fix code issues:

```bash
# Check for issues
pnpm lint:check

# Fix automatically fixable issues
pnpm lint

# Run type checking
pnpm type-check
```

### Pre-commit Hooks

Consider using tools like `husky` and `lint-staged` for pre-commit validation:

- Run ESLint on staged files
- Run type checking
- Run relevant tests

## Package-Specific Standards

### Shared Package

- Export only what's needed by other packages
- Keep utility functions pure (no side effects)
- Document complex types with JSDoc comments

### Backend Package

- Use dependency injection for services
- Implement proper error middleware
- Log all API requests and responses
- Validate all inputs with proper error messages

### Frontend Package

- Use TypeScript strict mode
- Implement proper loading and error states
- Use consistent component patterns
- Handle async operations properly

## Testing Standards

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.spec.ts`
- Test utilities: `test-utils.ts`

### Test Organization

```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should handle success case', () => { ... });
    it('should handle error case', () => { ... });
    it('should validate inputs', () => { ... });
  });
});
```

## Documentation Standards

### JSDoc Comments

Use JSDoc for public APIs:

```typescript
/**
 * Creates a PAdES-compliant digital signature
 * @param pdf - Base64 encoded PDF document
 * @param config - Signing configuration options
 * @returns Promise resolving to signed PDF
 * @throws {PAdESError} When PDF is invalid or signing fails
 */
export async function signPDF(pdf: string, config: PDFSigningConfig): Promise<string> {
  // Implementation
}
```

### README Files

Each package should have a README with:

- Purpose and scope
- Installation instructions
- Usage examples
- API documentation
- Contributing guidelines
