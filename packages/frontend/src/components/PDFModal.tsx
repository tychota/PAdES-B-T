import { Modal } from "@mantine/core";

export function PdfModal({
  opened,
  onClose,
  base64,
}: {
  opened: boolean;
  onClose: () => void;
  base64: string;
}) {
  const url = base64 ? `data:application/pdf;base64,${base64}` : undefined;
  return (
    <Modal opened={opened} onClose={onClose} size="100%" title="PDF">
      {url ? <iframe src={url} style={{ width: "100%", height: "80vh", border: 0 }} /> : null}
    </Modal>
  );
}
