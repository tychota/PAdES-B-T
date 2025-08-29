import { CodeHighlight } from "@mantine/code-highlight";
import { Tabs } from "@mantine/core";
import { DiffEditor } from "@monaco-editor/react";

import { CmsPanel } from "./CMSPanel";
import { PdfMetadataPanel } from "./PDFMetadataPanel";

type WorkflowEntry = { workflowState?: unknown };

interface DebugState {
  step?: string;
  byteRange?: unknown;
  preparedPdfBase64?: string | null;
  messageDigestB64?: string | null;
  signedAttrsDerB64?: string | null;
  signatureB64?: string | null;
  signerCertPem?: string | null;
  signedPdfBase64?: string | null;
  verification?: unknown;
  pdfBase64?: string | null;
}

interface DebugInspectorProps {
  state: DebugState;
  history: {
    finalize?: WorkflowEntry;
    sign?: WorkflowEntry;
    [key: string]: WorkflowEntry | undefined;
  };
}

export function DebugInspector({ state, history }: DebugInspectorProps) {
  const latest = state;
  const prev = history["finalize"]?.workflowState ?? history["sign"]?.workflowState;

  return (
    <Tabs defaultValue="summary">
      <Tabs.List>
        <Tabs.Tab value="summary">Summary</Tabs.Tab>
        <Tabs.Tab value="pdf">PDF</Tabs.Tab>
        <Tabs.Tab value="cms">CMS</Tabs.Tab>
        <Tabs.Tab value="diff">Diff</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="summary" mt="sm">
        <CodeHighlight
          language="json"
          code={JSON.stringify(
            {
              step: latest.step,
              byteRange: latest.byteRange,
              prepared: !!latest.preparedPdfBase64,
              digest: !!latest.messageDigestB64,
              attrs: !!latest.signedAttrsDerB64,
              signature: !!latest.signatureB64,
              cert: !!latest.signerCertPem,
              signedPdf: !!latest.signedPdfBase64,
              verification: latest.verification,
            },
            null,
            2,
          )}
        />
      </Tabs.Panel>

      <Tabs.Panel value="pdf" mt="sm">
        <PdfMetadataPanel base64={latest.signedPdfBase64 ?? latest.pdfBase64 ?? ""} />
      </Tabs.Panel>

      <Tabs.Panel value="cms" mt="sm">
        <CmsPanel
          signedAttrsDerB64={latest.signedAttrsDerB64 ?? undefined}
          signatureB64={latest.signatureB64 ?? undefined}
        />
      </Tabs.Panel>

      <Tabs.Panel value="diff" mt="sm">
        <DiffEditor
          height="360px"
          language="json"
          original={JSON.stringify(prev ?? {}, null, 2)}
          modified={JSON.stringify(latest ?? {}, null, 2)}
          options={{ readOnly: true, renderSideBySide: true }}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
