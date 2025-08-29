import {
  Button,
  Group,
  PasswordInput,
  Popover,
  Select,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";

import {
  availableReadersAtom,
  pinAtom,
  selectedReaderAtom,
  signingMethodAtom,
  useIcanopee,
} from "../store/atoms";

export function SigningMethodToggle() {
  const [signingMethod, setSigningMethod] = useAtom(signingMethodAtom);
  const [pin, setPin] = useAtom(pinAtom);
  const readers = useAtomValue(availableReadersAtom);
  const [selectedReader, setSelectedReader] = useAtom(selectedReaderAtom);
  const { getReaders, status, error } = useIcanopee();
  const [opened, setOpened] = useState(false);

  return (
    <Group gap="xs">
      <SegmentedControl
        size="xs"
        value={signingMethod}
        onChange={(v) => setSigningMethod(v as "mock" | "cps")}
        data={[
          { label: "Mock HSM", value: "mock" },
          { label: "CPS Card", value: "cps" },
        ]}
      />
      {signingMethod === "cps" && (
        <Popover
          opened={opened}
          onChange={setOpened}
          width={320}
          position="bottom-start"
          shadow="md"
        >
          <Popover.Target>
            <Button
              size="xs"
              variant="light"
              rightSection={<IconChevronDown size={14} />}
              onClick={() => setOpened((o) => !o)}
            >
              CPS Controls
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="xs" fw={600}>
                CPS Card
              </Text>
              {error ? (
                <Text size="xs" c="red">
                  {error}
                </Text>
              ) : null}
              <PasswordInput
                size="xs"
                label="PIN"
                placeholder="4–8 digits"
                value={pin}
                onChange={(e) => setPin(e.currentTarget.value)}
                maxLength={8}
              />
              <Group gap="xs" grow>
                <Select
                  size="xs"
                  label="Reader"
                  placeholder={status === "loading" ? "Searching..." : "Choose a reader"}
                  data={readers.map((r) => ({ value: r.s_name, label: r.s_name }))}
                  value={selectedReader}
                  onChange={setSelectedReader}
                  disabled={status === "loading"}
                />
                <Button size="xs" variant="light" onClick={() => void getReaders()}>
                  Refresh
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
    </Group>
  );
}
