// packages/frontend/src/components/StepContent.tsx

import {
  FileInput,
  Stack,
  Text,
  Alert,
} from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";

import {
  pdfFileAtom,
  workflowStateAtom,
} from "../store/atoms";
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
          <Text component="p" size="sm">
            This step selects the source PDF to be signed. No cryptographic operation is performed
            yet. In the next step, the system will insert a signature placeholder and determine the
            exact ByteRange (the signed bytes) for integrity protection.
          </Text>
          <Text component="p" size="sm">
            If you upload an existing PDF, it will be used as-is. If you generate a demo PDF, a
            clean one-page document with a designated signature area is created for testing.
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
          <Text component="p" size="sm">
            We insert a signature placeholder and compute the ByteRange—the exact segments of the
            file that are protected by the signature. We also calculate a SHA‑256 messageDigest over
            these bytes. The document must not change after this step, or the verification will
            fail.
          </Text>
          <Text component="p" size="sm">
            Inputs: the original PDF. Outputs: the prepared PDF (with placeholder), a ByteRange
            array, and a messageDigest. These will be used to assemble the SignedAttributes in the
            next step.
          </Text>
          {!hasPrepared ? (
            <Text component="p" size="sm" c="dimmed">
              Click “Continue to Sign” to run the preparation. Once ready, you can preview or
              download the prepared PDF below.
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
          <Text component="p" size="sm">
            We construct the CMS SignedAttributes that will be signed: contentType (id-data),
            messageDigest (over the ByteRange), and signingCertificateV2 (hash of your certificate).
            These DER-encoded attributes are the only data sent to your signing device (CPS or Mock)
            to produce the signature.
          </Text>
          <Text component="p" size="sm">
            Inputs: prepared PDF, byteRange, and your certificate. Outputs: SignedAttributes (DER)
            and a signature value (RSA‑PKCS#1 v1.5). PAdES baseline forbids “signingTime” in signed
            attributes; trusted time is added as a separate unsigned timestamp at the finalize step.
          </Text>
        </Alert>

        <Alert color="green" title="Ready to Sign">
          <Text component="p" size="sm">
            Your signing method is configured in the header. Click "Continue to Finalize" to proceed with signing using your selected method.
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
          <Text size="sm">
            We assemble a CMS SignedData container that references the entire PDF via a detached
            signature. It contains:
          </Text>
          <ul>
            <li>
              Signature value computed over the DER-encoded SignedAttributes (contentType,
              messageDigest, signingCertificateV2).
            </li>
            <li>Signer’s certificate and optionally intermediates.</li>
            <li>
              Optionally, a signature-time-stamp token (RFC 3161) over the signature value for PAdES
              B-T.
            </li>
          </ul>
          <Text size="sm">
            We then inject the CMS into /Contents and preserve the exact /ByteRange previously
            computed. Changing any signed byte would break messageDigest verification.
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
          <Text component="p" size="sm">
            The verifier recomputes the ByteRange digest and compares it against the messageDigest
            in the SignedAttributes, then verifies the RSA signature over the SignedAttributes DER.
            It also validates the certificate chain and checks the timestamp token if present (B‑T).
          </Text>
          <Text component="p" size="sm">
            The result includes a PAdES baseline compliance summary indicating B‑B or B‑T level and
            individual check statuses.
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
      <Text fw={500}>Processing Step: {workflowState.step}</Text>
      <Text c="dimmed" size="sm">
        This is an automated step. Click the action button below to proceed.
      </Text>
    </Stack>
  );
}
