import { Card, Group, Stack, Text } from "@mantine/core";
import { getDocument } from "pdfjs-dist";
import React from "react";

import { stepFilename } from "../utils/filename";

// IMPORTANT: ensure pdfjs worker is configured somewhere (e.g., PdfViewerPanel)
// You already use @react-pdf-viewer, which sets its own worker. For pdfjs-dist direct usage,
// you can rely on that CDN worker or set pdfjsLib.GlobalWorkerOptions.workerSrc if needed.

type Rect = [number, number, number, number];

export function PdfSummaryCard({
  base64,
  stepNumber,
  title = "Current PDF",
  highlightRect,
}: {
  base64?: string | null;
  stepNumber: number;
  title?: string;
  highlightRect?: Rect; // [x1, y1, x2, y2] in PDF user space (bottom-left origin)
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [info, setInfo] = React.useState<{ sizeKB?: string; pageCount?: number } | null>(null);

  React.useEffect(() => {
    if (!base64 || !ref.current) {
      setInfo(null);
      return;
    }

    const container = ref.current;
    container.innerHTML = ""; // clear previous canvas

    const render = async () => {
      try {
        const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const doc = await getDocument({ data }).promise;
        const page = await doc.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const maxWidth = 180; // small, consistent thumbnail
        const scale = maxWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        container.appendChild(canvas);

        // Draw highlight rectangle if provided (convert bottom-left coords to top-left canvas)
        if (highlightRect) {
          const [x1, y1, x2, y2] = highlightRect;
          const px = x1 * scale;
          const pyTop = (viewport.height - y2) * scale;
          const w = (x2 - x1) * scale;
          const h = (y2 - y1) * scale;

          const overlay = document.createElement("div");
          overlay.style.position = "absolute";
          overlay.style.left = `${px}px`;
          overlay.style.top = `${pyTop}px`;
          overlay.style.width = `${w}px`;
          overlay.style.height = `${h}px`;
          overlay.style.border = "2px solid var(--mantine-color-blue-6)";
          overlay.style.boxSizing = "border-box";
          container.style.position = "relative";
          container.appendChild(overlay);
        }

        setInfo({
          sizeKB: `${(data.byteLength / 1024).toFixed(1)} KB`,
          pageCount: doc.numPages,
        });
      } catch {
        setInfo(null);
      }
    };

    void render();
  }, [base64, highlightRect]);

  const filename = stepFilename(stepNumber);

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Text fw={600}>{title}</Text>
        <Group justify="space-between">
          <Text size="sm">{filename}</Text>
          <Text size="sm" c="dimmed">
            {info?.sizeKB ?? "-"} • {info?.pageCount ?? "-"} page(s)
          </Text>
        </Group>
        <div
          ref={ref}
          style={{
            width: 180,
            height: 240,
            background: "var(--mantine-color-gray-1)",
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "4px",
            overflow: "hidden",
            position: "relative",
          }}
        />
      </Stack>
    </Card>
  );
}
