# Claude Development Guidelines

## Required Pre-completion Checks

Before considering any task complete, Claude MUST run the following commands and ensure they pass:

### 1. ESLint (Required)
```bash
pnpm lint:check
```
- This command checks for linting issues without auto-fixing
- All linting errors must be resolved before task completion
- If issues are found, run `pnpm lint` to auto-fix where possible

### 2. Unit Tests (Required)
```bash
pnpm test
```
- All existing tests must continue to pass
- New functionality should include appropriate test coverage
- For coverage reports, use `pnpm test:coverage`

### 3. Type Checking (Required)
```bash
pnpm run build
```
- TypeScript compilation must succeed without errors
- All type issues must be resolved
- This command builds the entire project and validates TypeScript

## Development Workflow

1. Make your changes
2. Run `pnpm lint:check` - fix any linting issues
3. Run `pnpm run build` - fix any TypeScript errors
4. Run `pnpm test` - ensure all tests pass
5. Only mark task as complete when all checks pass

## Commit Message Guidelines

- Do NOT mention "Claude Code" or any AI assistance in commit messages
- Focus on technical changes and business value
- Keep commit messages professional and concise

## Project Structure Notes

This is a monorepo with packages in the `packages/` directory:
- Backend: `@pades-poc/backend` 
- Frontend: `@pades-poc/frontend`

Use `pnpm --filter <package-name> <command>` for package-specific operations.

## Build Commands

- Full build: `pnpm build`
- Development: `pnpm dev` (runs both backend and frontend)
- Individual package dev: `pnpm dev:backend` or `pnpm dev:frontend`