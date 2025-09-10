# PAdES-B-T ePrescription POC

A Proof of Concept for generating PAdES-B-T compliant electronic prescriptions using TypeScript with Node.js and React, with integrated support for French CPS (Carte de Professionnel de Santé) cards via Icanopee middleware.

## 🎯 Features

- ✅ **PAdES-B-T Compliant**: Full ETSI EN 319 142-1 compliance with timestamping
- 🏥 **ePrescription Focus**: Designed for French healthcare electronic prescriptions
- 💳 **CPS Card Integration**: Support for French Health Professional cards via Icanopee
- 🧪 **Mock HSM**: Complete testing environment with simulated signing
- 🔒 **Three-Step External Signing**: Secure signature process with external device support
- 🎨 **Modern UI**: Clean React-based user interface
- 🧪 **Comprehensive Testing**: Unit and integration tests included
- 📝 **Full Logging**: Structured logging and audit trails

## 🏗️ Architecture

```
packages/
├── backend/          # Node.js/Express API server
├── frontend/         # React UI application
└── shared/           # Shared TypeScript types and utilities
```

## 📋 Prerequisites

- **Node.js**: ≥18.0.0
- **pnpm**: ≥10.0.0 (Install with `npm install -g pnpm`)

## 🚀 Quick Start

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install all workspace dependencies
pnpm install

# Start development servers (backend + frontend)
pnpm dev

# Alternative: Start services individually
pnpm dev:backend    # Backend only
pnpm dev:frontend   # Frontend only

# Run tests across all packages
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build all packages for production
pnpm build

# Clean all build artifacts
pnpm clean

# Lint code
pnpm lint
```

## 🔧 Development Commands

### Workspace-wide commands:

```bash
pnpm dev              # Start both backend and frontend
pnpm build            # Build all packages
pnpm test             # Run tests in all packages
pnpm clean            # Clean all packages
```

### Package-specific commands:

```bash
# Backend only
pnpm --filter @pades-poc/backend dev
pnpm --filter @pades-poc/backend build
pnpm --filter @pades-poc/backend test

# Frontend only
pnpm --filter @pades-poc/frontend dev
pnpm --filter @pades-poc/frontend build
pnpm --filter @pades-poc/frontend test

# Shared only
pnpm --filter @pades-poc/shared build
pnpm --filter @pades-poc/shared test
```

### Adding dependencies:

```bash
# Add to specific package
pnpm --filter @pades-poc/backend add express
pnpm --filter @pades-poc/frontend add react-router-dom

# Add dev dependency to root workspace
pnpm add -Dw prettier

# Add dependency to all packages
pnpm add -r lodash
```

## 🏃‍♂️ Getting Started

1. **Clone and install:**

```bash
git clone <repository-url>
cd pades-bt-eprescription-poc
pnpm install
```

2. **Start development:**

```bash
pnpm dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

3. **Run tests:**

```bash
pnpm test
```

## 📋 Standards Compliance

- **ETSI EN 319 142-1**: PAdES Baseline Profile with Timestamp
- **RFC 5652**: Cryptographic Message Syntax (CMS)
- **RFC 3161**: Time-Stamp Protocol
- **French ANS**: eIDAS-compliant ePrescription requirements

## 🔧 Technology Stack

- **Package Manager**: pnpm (workspace monorepo)
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Vite
- **Testing**: Vitest with coverage
- **Build**: TypeScript + Vite
- **Linting**: ESLint with TypeScript support

## 📁 Project Structure

```
├── packages/
│   ├── backend/              # Express API server
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/             # React application
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/               # Shared types & utilities
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml       # pnpm workspace configuration
├── package.json              # Root package with workspace scripts
└── tsconfig.json             # Root TypeScript configuration
```

## 🤝 Contributing

1. Ensure you have pnpm installed: `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Make your changes
4. Run tests: `pnpm test`
5. Build project: `pnpm build`
6. Submit pull request

## ⚠️ Known Issues

### Icanopee Sign API Encoding Issue ✅ **RESOLVED**

~~The Icanopee sign API has a poorly designed encoding handling that causes issues with document signing. This affects the CPS card integration and can result in corrupted signatures.~~

**✅ FIXED**: Updated integration to use the new `s_dataToSignInBase64` API that properly handles binary data encoding. The application now:

- Uses `s_dataToSignInBase64` instead of `s_stringToSign` for proper binary data handling
- Implements digest validation to ensure data integrity between server and CPS device
- Supports both signature and auth certificates returned by the API

**Reproduction Script**: [`scripts/icanopee_encoding_issue.sh`](scripts/icanopee_encoding_issue.sh) - Updated to demonstrate both old and new APIs

**Live Demonstration**: [ASCIINEMA Recording](https://asciinema.org/a/R7CbcX7WHfYR0qbjRibN2Nrz8)

The encoding issue has been resolved with the new API implementation and enhanced validation.

## 📝 License

MIT License - see LICENSE file for details.
