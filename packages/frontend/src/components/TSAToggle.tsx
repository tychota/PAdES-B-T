import { SegmentedControl, Group, Badge } from "@mantine/core";
import { useAtom } from "jotai";

import { includeTimestampAtom } from "../store/atoms";

export function TSAToggle() {
  const [includeTimestamp, setIncludeTimestamp] = useAtom(includeTimestampAtom);

  return (
    <Group gap="xs" align="center">
      <SegmentedControl
        size="xs"
        value={includeTimestamp ? "bt" : "bb"}
        onChange={(value) => setIncludeTimestamp(value === "bt")}
        data={[
          { label: "PAdES B-B", value: "bb" },
          { label: "PAdES B-T", value: "bt" },
        ]}
      />
      <Badge size="xs" variant="light" color={includeTimestamp ? "blue" : "gray"}>
        {includeTimestamp ? "With Timestamp" : "No Timestamp"}
      </Badge>
    </Group>
  );
}
