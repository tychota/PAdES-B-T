import { CodeHighlight } from "@mantine/code-highlight";
import * as asn1js from "asn1js";
import React from "react";

export function CmsPanel({
  signedAttrsDerB64,
  signatureB64,
}: {
  signedAttrsDerB64?: string;
  signatureB64?: string;
}) {
  const [info, setInfo] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    if (!signedAttrsDerB64 && !signatureB64) {
      setInfo(null);
      return;
    }

    const parse = () => {
      try {
        const input = signedAttrsDerB64 ?? "";
        const raw = Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
        const asn1 = asn1js.fromBER(raw.buffer);
        if (asn1.offset === -1) {
          setInfo({ error: "Invalid DER" });
          return;
        }
        const id = asn1.result.idBlock;
        setInfo({
          length: raw.length,
          tagClass: id.tagClass,
          tagNumber: id.tagNumber,
          isConstructed: id.isConstructed,
        });
      } catch (e) {
        setInfo({ error: e instanceof Error ? e.message : String(e) });
      }
    };
    parse();
  }, [signedAttrsDerB64, signatureB64]);

  return <CodeHighlight language="json" code={JSON.stringify(info, null, 2)} />;
}
