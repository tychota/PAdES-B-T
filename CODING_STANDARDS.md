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

### Type Safety Rules

- **Never use `any`**: Use proper types, `unknown`, or create specific interfaces
- **Handle undefined values**: Always check for undefined in template literals and object access
- **Proper error handling**: Always type error objects and use Error instances for rejections
- **Async/await**: Always handle promises properly, use `void` for fire-and-forget promises

```typescript
// ✅ Good
const method = config.method?.toUpperCase() ?? "UNKNOWN";
const url = config.url ?? "unknown";
console.log(`[API] ${method} ${url}`);

// Handle promises properly
useEffect(() => {
  void checkHealthStatus(); // Fire-and-forget
}, []);

// Or handle with proper async
const handleClick = (): void => {
  void performAsyncAction();
};

// Proper error handling
catch (error: unknown) {
  if (error instanceof Error) {
    throw new Error(`Failed: ${error.message}`);
  }
  throw new Error("Unknown error occurred");
}

// ❌ Bad
console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`); // Undefined in template
useEffect(async () => { ... }, []); // Anti-pattern
onClick={async () => { ... }} // Returns promise instead of void
throw error; // Non-Error rejection
const data: any = response.data; // Using any
```

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

## Testing Standards

### Mock Implementation

- Always properly type mocks with interfaces
- Use `vi.mocked()` for typed mocks
- Create mock interfaces that match the real implementation

```typescript
// ✅ Good
interface MockApiClientInstance {
  checkHealth: ReturnType<typeof vi.fn>;
  generatePDF: ReturnType<typeof vi.fn>;
}

const mockApiClient: MockApiClientInstance = {
  checkHealth: vi.fn(),
  generatePDF: vi.fn(),
};

MockedApiClient.mockImplementation(() => mockApiClient as unknown as ApiClient);

// Use satisfies for type-safe responses
mockApiClient.checkHealth.mockResolvedValue({
  success: true,
  status: "OK",
} satisfies HealthResponse);

// ❌ Bad
const mockApiClient = {
  checkHealth: vi.fn().mockResolvedValue({ ... } as any),
};
MockedApiClient.mockImplementation(() => mockApiClient as any);
```

### Test File Requirements

- All test files must have corresponding setup files if using globals
- Tests must handle async operations properly
- Mock all external dependencies

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

## Quality Assurance

### Pre-commit Requirements

Before committing code, always run:

```bash
# Type checking (must pass)
pnpm type-check

# Linting (must pass)
pnpm lint:check

# All tests (must pass)
pnpm test

# Build check (must pass)
pnpm build
```

### Linting and Formatting

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
- Always create test setup files when using testing globals

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

## Common Anti-Patterns to Avoid

1. **Using `any` type**: Always use proper types or `unknown`
2. **Undefined template expressions**: Check for undefined values
3. **Async useEffect**: Never make useEffect callback async
4. **Promise-returning event handlers**: Event handlers should return void
5. **Non-Error rejections**: Always reject with Error instances
6. **Untyped mocks**: Always properly type test mocks
7. **Missing test setup**: Create setup files for test globals
8. **Floating promises**: Always handle promises with void, catch, or await
