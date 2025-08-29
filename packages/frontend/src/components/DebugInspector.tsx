import { Tabs } from "@mantine/core";

import { CmsInspector } from "./inspectors/CmsInspector";
import { PdfObjectInspector } from "./inspectors/PdfObjectInspector";

export function DebugInspector() {
  return (
    <Tabs defaultValue="pdf">
      <Tabs.List>
        <Tabs.Tab value="pdf">PDF Objects</Tabs.Tab>
        <Tabs.Tab value="cms">CMS (SignedData)</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="pdf" mt="sm">
        <PdfObjectInspector />
      </Tabs.Panel>
      <Tabs.Panel value="cms" mt="sm">
        <CmsInspector />
      </Tabs.Panel>
    </Tabs>
  );
}
