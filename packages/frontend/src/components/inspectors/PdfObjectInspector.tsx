import { Button, Group, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import { ApiClient } from "../../services/api";
import { pdfBase64Atom, debugPdfObjectsAtom, debugLoadingAtom, logsAtom } from "../../store/atoms";

import type { LogEntry } from "@pades-poc/shared";

export function PdfObjectInspector() {
  const pdf = useAtomValue(pdfBase64Atom);
  const text = useAtomValue(debugPdfObjectsAtom);
  const isLoading = useAtomValue(debugLoadingAtom);
  const setText = useSetAtom(debugPdfObjectsAtom);
  const setLoading = useSetAtom(debugLoadingAtom);
  const setLogs = useSetAtom(logsAtom);

  useEffect(() => {
    setText("");
  }, [pdf, setText]);

  const addLogs = (newLogs: LogEntry[]) => {
    if (newLogs.length > 0) {
      setLogs((prev) => [...prev, ...newLogs]);
    }
  };

  const handleError = (err: unknown, operation: string) => {
    const message = err instanceof Error ? err.message : `Failed to ${operation}.`;
    notifications.show({ title: "Error", message, color: "red" });
    addLogs([{ timestamp: new Date().toISOString(), level: "error", source: "frontend", message }]);
  };

  const run = async (): Promise<void> => {
    if (!pdf) return;
    setLoading(true);
    const api = new ApiClient();
    try {
      const response = await api.debugPdfObjects(pdf, true);

      // Extract data using type assertions to work around TypeScript issues
      const responseData = response as unknown as {
        success?: boolean;
        objectsText?: string;
        logs?: LogEntry[];
        error?: { message?: string };
      };

      if (responseData.success && responseData.objectsText) {
        setText(responseData.objectsText);
        if (responseData.logs) {
          addLogs(responseData.logs);
        }
      } else {
        const errorMessage = responseData.error?.message ?? "Failed to dump PDF objects.";
        setText(errorMessage);
      }
    } catch (err) {
      handleError(err, "dump PDF objects");
      setText("Failed to dump PDF objects.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Group mb="xs">
        <Button
          size="xs"
          variant="light"
          onClick={() => void run()}
          disabled={!pdf}
          loading={isLoading}
        >
          Dump signature objects
        </Button>
      </Group>
      <Textarea
        value={text}
        minRows={16}
        autosize
        readOnly
        styles={{
          input: {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre",
          },
        }}
      />
    </>
  );
}
