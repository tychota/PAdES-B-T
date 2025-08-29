import { CodeHighlight } from "@mantine/code-highlight";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import React from "react";

type MetadataOutput = {
  info: unknown;
  metadata?: Record<string, unknown>;
  attachments?: unknown;
  error?: string;
} | null;

export function PdfMetadataPanel({ base64 }: { base64: string }) {
  const [meta, setMeta] = React.useState<MetadataOutput>(null);

  React.useEffect(() => {
    if (!base64) {
      setMeta(null);
      return;
    }
    const task = getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) });

    void task.promise
      .then(async (doc: PDFDocumentProxy) => {
        const md = (await doc.getMetadata()) as { info: unknown; metadata: unknown };
        const attachments = (await doc.getAttachments().catch(() => undefined)) as unknown;

        let metaMap: Record<string, unknown> | undefined;
        if (
          md.metadata &&
          typeof (md.metadata as { getAll?: () => unknown }).getAll === "function"
        ) {
          const all = (md.metadata as { getAll: () => unknown }).getAll();
          if (all && typeof all === "object") {
            metaMap = all as Record<string, unknown>;
          }
        }

        setMeta({
          info: md.info,
          metadata: metaMap,
          attachments,
        });
      })
      .catch((e: unknown) => {
        setMeta({ info: {}, error: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      void task.destroy();
    };
  }, [base64]);

  return <CodeHighlight language="json" code={JSON.stringify(meta, null, 2)} />;
}
