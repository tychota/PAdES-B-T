// packages/frontend/src/components/StepContent.tsx

import { FileInput, Stack, Text, Alert } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";

import { pdfFileAtom, workflowStateAtom } from "../store/atoms";
import { getStepIndex } from "../utils/workflow";

import { PdfActionsBar } from "./PDFActionBar";
import { PdfSummaryCard } from "./PDFSummaryCard";

const DEFAULT_WIDGET_RECT: [number, number, number, number] = [300, 50, 545, 150];

export function StepContent() {
  const workflowState = useAtomValue(workflowStateAtom);
  const [pdfFile, setPdfFile] = useAtom(pdfFileAtom);

  // Content for PDF Generation (upload OR generate)
  if (workflowState.step === "generate") {
    const hasOriginal = !!workflowState.pdfBase64;
    return (
      <Stack>
        <Text fw={500}>1. Choose Document</Text>

        <FileInput
          label="Upload PDF"
          placeholder="Select a PDF file to sign"
          leftSection={<IconUpload size={16} />}
          value={pdfFile}
          onChange={setPdfFile}
          accept="application/pdf"
        />

        <Alert color="blue" title="What happens now">
          <Text component="p" size="sm" mb="md">
            <strong>Document Selection Phase:</strong> This step loads the source e-prescription PDF
            that will receive a <strong>PAdES-compliant</strong> digital signature.
          </Text>

          <Text component="p" size="sm" mb="md">
            No cryptographic operations occur yet—we're simply preparing the document for the
            signing workflow according to <strong>ETSI EN 319 142</strong> (PAdES standard).
          </Text>

          <Text component="p" size="sm" mb="sm">
            <strong>Input:</strong>
            <br />• PDF document for digital signature
          </Text>

          <Text component="p" size="sm" mb="md">
            <strong>Output:</strong>
            <br />• Loaded PDF ready for signature preparation
            <br />• Document validation for PAdES compatibility
          </Text>

          <Text component="p" size="sm" c="dimmed">
            <em>Compliance target:</em> <strong>PAdES B-LTA</strong> profile for maximum long-term
            archival compliance, ensuring legal evidentiary value ("force probante") per French
            healthcare regulations.
          </Text>
        </Alert>

        {hasOriginal ? (
          <PdfSummaryCard
            base64={workflowState.pdfBase64}
            stepNumber={getStepIndex("generate") + 1}
            title="Original PDF"
          />
        ) : (
          <PdfActionsBar
            base64={workflowState.pdfBase64}
            stepNumber={getStepIndex("generate") + 1}
          />
        )}
      </Stack>
    );
  }

  // Content for PDF Preparation step
  if (workflowState.step === "preSign") {
    const hasPrepared = !!workflowState.preparedPdfBase64;
    return (
      <Stack>
        <Text fw={500}>2. Prepare for Signing</Text>

        <Alert color="blue" title="What happens now">
          <Text component="p" size="sm" mb="md">
            <strong>PDF Signature Preparation:</strong> We insert a{" "}
            <strong>signature placeholder</strong> within the PDF structure and establish the
            critical{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              /ByteRange
            </pre>{" "}
            array.
          </Text>

          <Text component="p" size="sm" mb="md">
            A <strong>SHA-256 messageDigest</strong> is computed over the protected byte ranges.
            This hash becomes part of the <strong>CMS SignedAttributes</strong> (RFC 5652), ensuring
            any document modification breaks verification.
          </Text>

          <Text component="p" size="sm" mb="sm">
            <strong>Input:</strong>
            <br />• Original PDF document
          </Text>

          <Text component="p" size="sm" mb="md">
            <strong>Output:</strong>
            <br />• Prepared PDF with signature placeholder
            <br />• ByteRange array:{" "}
            {workflowState.byteRange
              ? `[${workflowState.byteRange.join(", ")}]`
              : "[start₁, length₁, start₂, length₂]"}
            <br />• SHA-256 messageDigest:{" "}
            {workflowState.messageDigestB64
              ? `${workflowState.messageDigestB64.length} chars (base64)`
              : "pending calculation"}
          </Text>

          {!hasPrepared ? (
            <Text component="p" size="sm" c="dimmed">
              <em>Next step:</em> Click "Continue to Sign" to execute preparation. The resulting PDF
              preserves exact byte offsets required for incremental update compliance.
            </Text>
          ) : null}
        </Alert>

        {hasPrepared ? (
          <>
            <PdfSummaryCard
              base64={workflowState.preparedPdfBase64}
              stepNumber={getStepIndex("preSign") + 1}
              title="Prepared PDF (with placeholder)"
              highlightRect={DEFAULT_WIDGET_RECT}
            />
            <PdfActionsBar
              base64={workflowState.preparedPdfBase64}
              stepNumber={getStepIndex("preSign") + 1}
            />
            <Text size="sm" c="dimmed">
              ByteRange: {JSON.stringify(workflowState.byteRange)} • messageDigest size:{" "}
              {(workflowState.messageDigestB64?.length ?? 0).toString()} chars (base64)
            </Text>
          </>
        ) : (
          <PdfActionsBar
            base64={workflowState.preparedPdfBase64}
            stepNumber={getStepIndex("preSign") + 1}
          />
        )}
      </Stack>
    );
  }

  // Content for Signing Step
  if (workflowState.step === "sign") {
    const hasPrepared = !!workflowState.preparedPdfBase64;
    return (
      <Stack>
        <Text fw={500}>3. Choose Signing Method</Text>
        <Alert color="blue" title="What happens now">
          <Text component="p" size="sm" mb="md">
            <strong>CMS SignedAttributes Construction:</strong> We build the cryptographic container
            following <strong>RFC 5652</strong> with exactly three mandatory attributes:
          </Text>

          <Text component="div" size="sm" mb="md" style={{ marginLeft: "16px" }}>
            •{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              content-type
            </pre>{" "}
            → <code>id-data</code> (OID: 1.2.840.113549.1.7.1)
            <br />•{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              message-digest
            </pre>{" "}
            → SHA-256 hash from ByteRange
            <br />•{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              signing-certificate-v2
            </pre>{" "}
            → Hash of signer certificate (prevents substitution attacks)
          </Text>

          <Text component="p" size="sm" mb="sm">
            <strong>Input:</strong>
            <br />• Prepared PDF with ByteRange:{" "}
            {workflowState.byteRange ? `[${workflowState.byteRange.join(", ")}]` : "pending"}
            <br />• SHA-256 messageDigest:{" "}
            {workflowState.messageDigestB64
              ? `${workflowState.messageDigestB64.slice(0, 16)}...`
              : "pending"}
            <br />• Signer certificate from CPS/PKCS#11 device
          </Text>

          <Text component="p" size="sm" mb="md">
            <strong>Output:</strong>
            <br />• DER-encoded SignedAttributes:{" "}
            {workflowState.signedAttrsDerB64
              ? `${workflowState.signedAttrsDerB64.length} chars (base64)`
              : "pending generation"}
            <br />• RSA-PKCS#1 v1.5 signature via{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              CKM_SHA256_RSA_PKCS
            </pre>
          </Text>

          <Text component="p" size="sm" c="orange">
            <strong>PAdES Compliance:</strong> The{" "}
            <pre
              style={{
                display: "inline",
                background: "#f8f9fa",
                padding: "2px 4px",
                borderRadius: "3px",
              }}
            >
              signing-time
            </pre>{" "}
            attribute is <em>forbidden</em> in signed attributes per ETSI EN 319 142—trusted
            timestamps are added as unsigned attributes.
          </Text>
        </Alert>

        <Alert color="green" title="Ready to Sign">
          <Text component="p" size="sm">
            Your signing method is configured in the header. Click "Continue to Finalize" to proceed
            with signing using your selected method.
          </Text>
        </Alert>

        {hasPrepared ? (
          <>
            <PdfSummaryCard
              base64={workflowState.preparedPdfBase64}
              stepNumber={getStepIndex("sign") + 1}
              title="Ready-to-sign PDF"
              highlightRect={DEFAULT_WIDGET_RECT}
            />
            <PdfActionsBar
              base64={workflowState.preparedPdfBase64}
              stepNumber={getStepIndex("sign") + 1}
            />
            <Text size="sm" c="dimmed">
              SignedAttributes DER size: {(workflowState.signedAttrsDerB64?.length ?? 0).toString()}{" "}
              chars (base64)
            </Text>
          </>
        ) : null}
      </Stack>
    );
  }

  // Content for PDF Preparation step
  if (workflowState.step === "finalize") {
    return (
      <Stack>
        <Text fw={500}>4. Finalizing</Text>
        <Alert color="blue" title="What happens now">
          <Text component="p" size="sm" mb="md">
            <strong>CMS SignedData Assembly & PDF Integration:</strong> We construct the complete{" "}
            <strong>detached signature</strong> container with all cryptographic proof elements.
          </Text>

          <Text component="div" size="sm" mb="md" style={{ marginLeft: "16px" }}>
            <strong>Signature container includes:</strong>
            <br />• <strong>Signature value:</strong> RSA signature over DER-encoded
            SignedAttributes
            <br />• <strong>Certificate chain:</strong> Signer's certificate + intermediate CAs
            <br />• <strong>RFC 3161 Timestamp:</strong> TSA time-stamp token →{" "}
            <em>PAdES B-T compliance</em>
            <br />• <strong>Validation data (LTV):</strong> CRLs/OCSP responses in DSS →{" "}
            <em>PAdES B-LT/B-LTA</em>
          </Text>

          <Text component="p" size="sm" mb="sm">
            <strong>Input:</strong>
            <br />• SignedAttributes DER:{" "}
            {workflowState.signedAttrsDerB64
              ? `~${workflowState.signedAttrsDerB64.length} chars`
              : "from signing step"}
            <br />• RSA signature from CPS/PKCS#11 device
            <br />• Certificate chain and revocation data
          </Text>

          <Text component="p" size="sm" mb="md">
            <strong>Output:</strong>
            <br />• Complete CMS SignedData container (DER-encoded)
            <br />• Signed PDF with embedded cryptographic proof
            <br />• Preserved ByteRange:{" "}
            {workflowState.byteRange
              ? `[${workflowState.byteRange.join(", ")}]`
              : "from preparation"}
          </Text>

          <Text component="p" size="sm" c="green">
            <strong>Result:</strong> PAdES-compliant signed PDF ensuring long-term legal validity
            ("force probante") for French healthcare e-prescriptions.
          </Text>
        </Alert>
        <Alert color="green" title="TSA Configuration">
          <Text component="p" size="sm">
            Timestamp preference (PAdES B-B vs B-T) is configured in the header.
          </Text>
        </Alert>
        <Text size="sm" c="dimmed">
          Current inputs: SignedAttrs DER size ≈ {workflowState.signedAttrsDerB64?.length ?? 0}{" "}
          chars, signature will be embedded in CMS and injected into /Contents.
        </Text>
        <PdfActionsBar
          base64={workflowState.signedPdfBase64}
          stepNumber={getStepIndex("finalize") + 1}
        />
      </Stack>
    );
  }

  if (workflowState.step === "verify") {
    const hasSigned = !!workflowState.signedPdfBase64;
    return (
      <Stack>
        <Text fw={500}>5. Verify</Text>
        <Alert color="blue" title="What happens now">
          <Text component="p" size="sm" mb="md">
            <strong>Multi-Layer Signature Verification:</strong> Comprehensive cryptographic and
            compliance validation process.
          </Text>

          <Text component="div" size="sm" mb="md">
            <strong>Verification steps:</strong>
            <br />
            <strong>1. Document Integrity:</strong> Recompute SHA-256 over ByteRange → compare with
            messageDigest
            <br />
            <strong>2. Signature Validity:</strong> Verify RSA signature over SignedAttributes DER
            <br />
            <strong>3. Certificate Trust:</strong> Validate certificate chain + revocation status
            <br />
            <strong>4. Timestamp Verification:</strong> Validate RFC 3161 TSA token (if present)
          </Text>

          <Text component="p" size="sm" mb="sm">
            <strong>Input:</strong>
            <br />• Signed PDF with embedded CMS container
            <br />• ByteRange data:{" "}
            {workflowState.byteRange
              ? `[${workflowState.byteRange.join(", ")}]`
              : "from signed document"}
            <br />• Certificate validation data (CRLs/OCSP)
          </Text>

          <Text component="p" size="sm" mb="md">
            <strong>Output:</strong>
            <br />• Verification status: Valid/Invalid
            <br />• PAdES profile achieved: B-B (basic) or B-T (with timestamp)
            <br />• Individual check results for audit trail
          </Text>

          <Text component="p" size="sm" c="blue">
            <strong>Healthcare compliance:</strong> Successful verification confirms regulatory
            standards and provides full legal evidentiary value ("force probante") for pharmacy
            dispensation.
          </Text>
        </Alert>

        {hasSigned ? (
          <>
            <PdfSummaryCard
              base64={workflowState.signedPdfBase64}
              stepNumber={getStepIndex("verify") + 1}
              title="Signed PDF"
            />
            <PdfActionsBar
              base64={workflowState.signedPdfBase64}
              stepNumber={getStepIndex("verify") + 1}
            />
          </>
        ) : null}
      </Stack>
    );
  }

  // Default content for other steps
  return (
    <Stack>
      <Text c="dimmed" size="sm">
        Click the action button below to proceed.
      </Text>
    </Stack>
  );
}
