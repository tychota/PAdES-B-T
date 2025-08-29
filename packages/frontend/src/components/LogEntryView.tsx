import { Paper, Group, Badge, Text } from "@mantine/core";
import { LogEntry, LogLevel } from "@pades-poc/shared";

const levelColor: Record<LogLevel, string> = {
  error: "red",
  warning: "yellow",
  success: "green",
  info: "blue",
  debug: "gray",
};

export function LogEntryView({ log }: { log: LogEntry }) {
  return (
    <Paper withBorder p="xs" radius="sm" mb="xs">
      <Group>
        <Badge color={levelColor[log.level]} size="sm" variant="light">
          {log.level.toUpperCase()}
        </Badge>
        <Text size="xs" c="dimmed">
          {new Date(log.timestamp).toLocaleTimeString("fr-FR")}
        </Text>
        <Text size="sm" fw={500}>
          [{log.source.toUpperCase()}]
        </Text>
        <Text size="sm">{log.message}</Text>
      </Group>
    </Paper>
  );
}
