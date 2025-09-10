import { Button, Group, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtomValue, useSetAtom } from "jotai";

import { ApiClient } from "../../services/api";
import { pdfBase64Atom, debugCmsDataAtom, debugLoadingAtom, logsAtom } from "../../store/atoms";

import type { LogEntry } from "@pades-poc/shared";

export function CmsInspector() {
  const pdf = useAtomValue(pdfBase64Atom);
  const summary = useAtomValue(debugCmsDataAtom);
  const isLoading = useAtomValue(debugLoadingAtom);
  const setSummary = useSetAtom(debugCmsDataAtom);
  const setLoading = useSetAtom(debugLoadingAtom);
  const setLogs = useSetAtom(logsAtom);

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
      // Make the API call and handle the response

      const response = await api.debugCms({ pdfBase64: pdf });

      // Extract data using type assertions to work around TypeScript issues
      const responseData = response as unknown as {
        success?: boolean;
        summary?: {
          signedDataVersion: number;
          digestAlgorithms: string[];
          eContentType: string;
          certificateCount: number;
          signerSubject?: string;
          hasTimestamp: boolean;
          signedAttributeOids: string[];
        };
        logs?: LogEntry[];
        error?: { message?: string };
      };

      if (responseData.success && responseData.summary) {
        setSummary(responseData.summary);
        if (responseData.logs) {
          addLogs(responseData.logs);
        }
      } else {
        const errorMessage = responseData.error?.message ?? "Failed to parse CMS.";
        handleError(new Error(errorMessage), "parse CMS");
        setSummary(null);
      }
    } catch (err) {
      handleError(err, "parse CMS");
      setSummary(null);
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
          Parse CMS
        </Button>
      </Group>
      {!summary ? (
        <Text c="dimmed" size="sm">
          No data yet.
        </Text>
      ) : (
        <Textarea
          value={JSON.stringify(summary, null, 2)}
          minRows={16}
          autosize
          readOnly
          styles={{ input: { fontFamily: "ui-monospace" } }}
        />
      )}
    </>
  );
}
