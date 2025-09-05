# PKCS#11 Setup Guide

This document explains how to set up the new PKCS#11 flow for proper CPS card signing, which replaces the problematic Icanopee string-based API with native binary PKCS#11 support.

## Overview

The PKCS#11 implementation provides:
- **Native binary signing**: Properly handles binary DER data instead of base64 strings
- **Standard PKCS#11 interface**: Uses pkcs11js for direct hardware token access
- **Better reliability**: Bypasses Icanopee middleware issues with string encoding
- **macOS cryptolib support**: Compatible with Apple's CryptoTokenKit framework

## Environment Setup

### 1. Install PKCS#11 Library

**On macOS:**
```bash
# For CPS cards via CryptoTokenKit (recommended)
export PKCS11_LIBRARY_PATH="/System/Library/Frameworks/CryptoTokenKit.framework/Libraries/libykcs11.dylib"

# Alternative: OpenSC (if installed via Homebrew)
# brew install opensc
# export PKCS11_LIBRARY_PATH="/usr/local/lib/pkcs11/opensc-pkcs11.so"
```

**On Linux:**
```bash
# Install OpenSC
sudo apt-get install opensc-pkcs11  # Ubuntu/Debian
# or
sudo yum install opensc  # RHEL/CentOS

export PKCS11_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu/pkcs11/opensc-pkcs11.so"
```

### 2. Backend Configuration

Add to your `.env` file:
```bash
# PKCS#11 library path (required)
PKCS11_LIBRARY_PATH="/System/Library/Frameworks/CryptoTokenKit.framework/Libraries/libykcs11.dylib"

# Optional: Enable debug logging
NODE_ENV=development
```

### 3. Start the Application

```bash
pnpm dev
```

## Usage

1. **Select PKCS#11 method**: In the frontend, choose "PKCS#11" from the signing method toggle
2. **Refresh slots**: Click "Refresh" to discover available hardware tokens
3. **Select slot**: Choose the slot containing your CPS card
4. **Enter PIN**: Enter your token PIN
5. **Get certificates**: Click "Get Certs" to list available certificates
6. **Select certificate**: Choose the certificate to use for signing
7. **Proceed with signing**: The workflow will use proper binary PKCS#11 signing

## Key Differences from Icanopee

| Aspect | Icanopee (CPS) | PKCS#11 |
|--------|----------------|---------|
| **Data handling** | String-based (base64) | Binary (proper DER) |
| **API** | Custom JSON API | Standard PKCS#11 |
| **Reliability** | String encoding issues | Native binary operations |
| **Performance** | HTTP middleware overhead | Direct hardware access |
| **Standards compliance** | Vendor-specific | Industry standard |

## Troubleshooting

### Common Issues

**"PKCS#11 library not found"**
- Verify the `PKCS11_LIBRARY_PATH` environment variable
- Check that the library file exists and is readable
- On macOS, ensure CryptoTokenKit is available

**"No slots found"**
- Ensure your CPS card is properly inserted
- Check that the card reader is connected
- Try refreshing the slots list

**"Login failed"**
- Verify your PIN is correct
- Ensure the token is not locked
- Check that the selected slot has a token present

**"No certificates found"**
- Confirm you've logged in with the correct PIN
- Verify the token contains valid certificates
- Check that certificates are not expired

### Debug Information

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will provide detailed PKCS#11 operation logs in the application logs panel.

## Architecture

```
Frontend UI
    ↓
Backend PKCS#11 Service
    ↓
pkcs11js (Node.js binding)
    ↓
PKCS#11 Library (cryptolib/OpenSC)
    ↓
Hardware Token (CPS Card)
```

The new flow ensures that:
1. **Binary data integrity**: DER(signedAttributes) is passed as Buffer, not string
2. **Native hashing**: Hardware performs SHA-256 hashing internally  
3. **Standard compliance**: Uses RFC 7292 PKCS#11 standard interface
4. **No middleware**: Direct communication with hardware token

## Benefits

- ✅ **Fixes Icanopee string encoding bug**: Binary data stays binary
- ✅ **Standard PKCS#11 compliance**: Industry-standard interface
- ✅ **Better error handling**: Clear PKCS#11 error codes
- ✅ **Performance**: No HTTP middleware overhead  
- ✅ **Reliability**: Direct hardware communication
- ✅ **Future-proof**: Standard interface works with any PKCS#11 token