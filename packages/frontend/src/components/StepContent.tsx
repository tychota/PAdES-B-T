// packages/frontend/src/components/StepContent.tsx

import {
  FileInput,
  SegmentedControl,
  PasswordInput,
  Select,
  Stack,
  Text,
  Alert,
} from "@mantine/core";
import { IconAlertCircle, IconUpload } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";

import {
  availableReadersAtom,
  pdfFileAtom,
  pinAtom,
  selectedReaderAtom,
  signingMethodAtom,
  workflowStateAtom,
  useIcanopee,
} from "../store/atoms";

export function StepContent() {
  const workflowState = useAtomValue(workflowStateAtom);
  const [signingMethod, setSigningMethod] = useAtom(signingMethodAtom);
  const [pin, setPin] = useAtom(pinAtom);
  const [readers] = useAtom(availableReadersAtom);
  const [selectedReader, setSelectedReader] = useAtom(selectedReaderAtom);
  const [pdfFile, setPdfFile] = useAtom(pdfFileAtom);

  const { getReaders, status, error } = useIcanopee();

  useEffect(() => {
    if (signingMethod === "cps" && readers.length === 0 && status === "idle") {
      void getReaders();
    }
  }, [signingMethod, readers.length, getReaders, status]);

  // Content for PDF Generation (upload OR generate)
  if (workflowState.step === "generate") {
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
        <Text size="sm" c="dimmed">
          Alternatively, generate a demo PDF using the action button below.
        </Text>
      </Stack>
    );
  }

  // Content for PDF Preparation step
  if (workflowState.step === "preSign") {
    return (
      <Stack>
        <Text fw={500}>2. Prepare for Signing</Text>
        <Alert color="blue" title="What happens now">
          We will insert a signature placeholder, compute the ByteRange and the SHA‑256 message
          digest required for signing. Click Continue to proceed.
        </Alert>
      </Stack>
    );
  }

  // Content for Signing Step
  if (workflowState.step === "sign") {
    return (
      <Stack>
        <Text fw={500}>2. Choose Signing Method</Text>
        <SegmentedControl
          fullWidth
          value={signingMethod}
          onChange={(value) => setSigningMethod(value as "mock" | "cps")}
          data={[
            { label: "Mock HSM (Test)", value: "mock" },
            { label: "CPS Card", value: "cps" },
          ]}
        />

        {signingMethod === "cps" && (
          <Stack mt="md">
            {error && (
              <Alert color="red" title="Icanopee Error" icon={<IconAlertCircle />}>
                {error}
              </Alert>
            )}
            <PasswordInput
              label="CPS Card PIN"
              placeholder="Enter your 4-8 digit PIN"
              value={pin}
              onChange={(event) => setPin(event.currentTarget.value)}
              maxLength={8}
            />
            <Select
              label="Select Card Reader"
              placeholder={status === "loading" ? "Searching..." : "Choose a reader"}
              data={readers.map((r) => ({ value: r.s_name, label: r.s_name }))}
              value={selectedReader}
              onChange={setSelectedReader}
              disabled={status === "loading" || readers.length === 0}
            />
          </Stack>
        )}
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
