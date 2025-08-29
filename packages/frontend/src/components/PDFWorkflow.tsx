// packages/frontend/src/components/PDFWorkflow.tsx
import { Grid, Stepper, Paper, Stack, Text } from "@mantine/core";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { logsAtom, pdfBase64Atom, workflowStateAtom } from "../store/atoms";
import { PADES_WORKFLOW_STEPS, getStepIndex } from "../utils/workflow";

import { LogPanel } from "./LogPanel";
import { PdfViewerPanel } from "./PDFViewerPanel";
import { StepContent } from "./StepContent";
import { WorkflowActions } from "./WorkflowActions";

export function PDFWorkflow() {
  const [workflowState, setWorkflowState] = useAtom(workflowStateAtom);
  const pdfBase64 = useAtomValue(pdfBase64Atom);
  const setLogs = useSetAtom(logsAtom);

  const activeStep = getStepIndex(workflowState.step);

  const resetWorkflow = () => {
    setWorkflowState({ step: "generate", pdfBase64: null, signedPdfBase64: null });
    setLogs([]);
  };

  return (
    <Stack gap="xl">
      <Paper shadow="sm" p="lg" withBorder>
        <Stepper active={activeStep} size="sm">
          {PADES_WORKFLOW_STEPS.map((step) => (
            <Stepper.Step key={step.id} label={step.label} description={step.description} />
          ))}
          <Stepper.Completed>
            <Text ta="center">Workflow Completed!</Text>
          </Stepper.Completed>
        </Stepper>
      </Paper>

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            <Paper shadow="sm" p="lg" withBorder>
              <StepContent />
            </Paper>
            <Paper shadow="sm" p="lg" withBorder>
              <WorkflowActions onReset={resetWorkflow} />
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper shadow="sm" p="lg" withBorder>
            <LogPanel />
          </Paper>
        </Grid.Col>
      </Grid>

      {pdfBase64 && (
        <Paper shadow="sm" p="lg" withBorder>
          <PdfViewerPanel pdfBase64={pdfBase64} />
        </Paper>
      )}
    </Stack>
  );
}
