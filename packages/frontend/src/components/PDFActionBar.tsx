import { Button, Group, Tooltip } from "@mantine/core";
import { useState } from "react";

import { stepFilename } from "../utils/filename";

import { PdfModal } from "./PDFModal";

export function PdfActionsBar({
  base64,
  stepNumber,
}: {
  base64?: string | null;
  stepNumber: number;
}) {
  const [opened, setOpened] = useState(false);
  const hasPdf = !!base64;

  const download = () => {
    if (!base64) return;
    const a = document.createElement("a");
    a.href = `data:application/pdf;base64,${base64}`;
    a.download = stepFilename(stepNumber);
    a.click();
  };

  return (
    <Group justify="flex-end">
      <Tooltip label="Save PDF to your computer">
        <Button size="xs" variant="default" onClick={download} disabled={!hasPdf}>
          Download
        </Button>
      </Tooltip>
      <Button size="xs" onClick={() => setOpened(true)} disabled={!hasPdf}>
        View
      </Button>
      <PdfModal opened={opened} onClose={() => setOpened(false)} base64={base64 || ""} />
    </Group>
  );
}
