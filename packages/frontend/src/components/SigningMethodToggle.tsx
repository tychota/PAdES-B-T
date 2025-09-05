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
import { useState, useEffect } from "react";

import {
  availableReadersAtom,
  pinAtom,
  selectedReaderAtom,
  signingMethodAtom,
  useIcanopee,
  pkcs11SlotsAtom,
  selectedSlotAtom,
  pkcs11CertificatesAtom,
  selectedCertificateAtom,
  usePKCS11,
} from "../store/atoms";

import type { PKCS11CertificateInfo, PKCS11SlotInfo } from "@pades-poc/shared";


export function SigningMethodToggle() {
  const [signingMethod, setSigningMethod] = useAtom(signingMethodAtom);
  const [pin, setPin] = useAtom(pinAtom);

  // CPS (Icanopee) state
  const readers = useAtomValue(availableReadersAtom);
  const [selectedReader, setSelectedReader] = useAtom(selectedReaderAtom);
  const { getReaders, status, error } = useIcanopee();

  // PKCS#11 state
  const slots = useAtomValue(pkcs11SlotsAtom);
  const [selectedSlot, setSelectedSlot] = useAtom(selectedSlotAtom);
  const certificates = useAtomValue(pkcs11CertificatesAtom);
  const [selectedCertificate, setSelectedCertificate] = useAtom(selectedCertificateAtom);
  const { getSlots, getCertificates, status: pkcs11Status, error: pkcs11Error } = usePKCS11();

  const [opened, setOpened] = useState(false);

  // Auto-load data when method changes
  useEffect(() => {
    if (signingMethod === "cps" && readers.length === 0 && status === "idle") {
      void getReaders();
    } else if (signingMethod === "pkcs11" && slots.length === 0 && pkcs11Status === "idle") {
      void getSlots();
    }
  }, [signingMethod, readers.length, slots.length, getReaders, getSlots, status, pkcs11Status]);

  // Auto-select single reader
  useEffect(() => {
    if (signingMethod === "cps" && readers.length === 1 && !selectedReader) {
      setSelectedReader(readers[0].s_name);
    }
  }, [signingMethod, readers, selectedReader, setSelectedReader]);

  // Auto-select single slot
  useEffect(() => {
    if (signingMethod === "pkcs11" && slots.length === 1 && selectedSlot === null) {
      setSelectedSlot(slots[0].slotId);
    }
  }, [signingMethod, slots, selectedSlot, setSelectedSlot]);

  // Auto-load certificates when slot and pin are available
  useEffect(() => {
    if (signingMethod === "pkcs11" && selectedSlot !== null && pin.length >= 4 && certificates.length === 0 && pkcs11Status === "idle") {
      void getCertificates(selectedSlot, pin);
    }
  }, [signingMethod, selectedSlot, pin, certificates.length, getCertificates, pkcs11Status]);

  // Auto-select single certificate
  useEffect(() => {
    if (signingMethod === "pkcs11" && certificates.length === 1 && !selectedCertificate) {
      setSelectedCertificate(certificates[0].label);
    }
  }, [signingMethod, certificates, selectedCertificate, setSelectedCertificate]);

  return (
    <Group gap="xs">
      <SegmentedControl
        size="xs"
        value={signingMethod}
        onChange={(v) => setSigningMethod(v as "mock" | "cps" | "pkcs11")}
        data={[
          { label: "Mock HSM", value: "mock" },
          { label: "CPS - ICanopee", value: "cps" },
          { label: "CPS - Raw PKCS#11", value: "pkcs11" },
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
              <Select
                size="xs"
                label="Reader"
                placeholder={status === "loading" ? "Searching..." : "Choose a reader"}
                data={readers.map((r) => ({ value: r.s_name, label: r.s_name }))}
                value={selectedReader}
                onChange={setSelectedReader}
                disabled={status === "loading"}
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
      {signingMethod === "pkcs11" && (
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
              PKCS#11 Controls
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="xs" fw={600}>
                PKCS#11 Hardware Token
              </Text>
              {pkcs11Error ? (
                <Text size="xs" c="red">
                  {pkcs11Error}
                </Text>
              ) : null}
              <PasswordInput
                size="xs"
                label="PIN"
                placeholder="Token PIN"
                value={pin}
                onChange={(e) => setPin(e.currentTarget.value)}
                maxLength={12}
              />
              <Select
                size="xs"
                label="Slot"
                placeholder={pkcs11Status === "loading" ? "Loading..." : "Choose a slot"}
                data={slots
                  .filter((slotItem: PKCS11SlotInfo) => slotItem.slotId !== null && slotItem.slotId !== undefined)
                  .map((slotItem: PKCS11SlotInfo) => ({
                    value: slotItem.slotId.toString(),
                    label: `${slotItem.slotId}: ${slotItem.description}${slotItem.tokenInfo ? ` (${slotItem.tokenInfo.label})` : ""}`,
                  }))}
                value={selectedSlot?.toString() || null}
                onChange={(value) => {
                  const slotId = value ? parseInt(value, 10) : null;
                  setSelectedSlot(slotId);
                  // Clear certificates when slot changes
                  setSelectedCertificate(null);
                }}
                disabled={pkcs11Status === "loading"}
              />
              {selectedSlot !== null && (
                <Select
                  size="xs"
                  label="Certificate"
                  placeholder={pkcs11Status === "loading" ? "Loading..." : certificates.length === 0 && pin.length >= 4 ? "No certificates found" : "Enter PIN to load certificates"}
                  data={certificates.map((certItem: PKCS11CertificateInfo) => ({
                    value: certItem.label,
                    label: `${certItem.label} (${certItem.subject.split(",")[0] || "Unknown"})`,
                  }))}
                  value={selectedCertificate}
                  onChange={setSelectedCertificate}
                  disabled={pkcs11Status === "loading" || (certificates.length === 0 && pin.length < 4)}
                />
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
    </Group>
  );
}
