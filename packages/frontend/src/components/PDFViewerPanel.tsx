import { Box, Title } from "@mantine/core";
import { Worker, Viewer, SpecialZoomLevel } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";

export function PdfViewerPanel({ pdfBase64 }: { pdfBase64: string }) {
  const defaultLayout = defaultLayoutPlugin();
  const fileUrl = `data:application/pdf;base64,${pdfBase64}`;

  return (
    <Box>
      <Title order={4} mb="md">
        PDF Viewer
      </Title>
      <Box
        h={600}
        style={{
          border: "1px solid var(--mantine-color-gray-3)",
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
        }}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            plugins={[defaultLayout]}
            defaultScale={SpecialZoomLevel.PageFit}
          />
        </Worker>
      </Box>
    </Box>
  );
}
