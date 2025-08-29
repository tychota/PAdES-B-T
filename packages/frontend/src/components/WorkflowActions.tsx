// packages/frontend/src/components/WorkflowActions.tsx
import { Button, Group } from "@mantine/core";
import { useAtomValue } from "jotai";

import { canProceedAtom, loadingAtom, useWorkflowActions, workflowStateAtom } from "../store/atoms";
import { getStepIndex, PADES_WORKFLOW_STEPS } from "../utils/workflow";

interface WorkflowActionsProps {
  onReset: () => void;
}

export function WorkflowActions({ onReset }: WorkflowActionsProps) {
  const workflowState = useAtomValue(workflowStateAtom);
  const loading = useAtomValue(loadingAtom);
  const canProceed = useAtomValue(canProceedAtom);
  const { generateDemoPDF, runCurrentStep } = useWorkflowActions();
  const activeStep = getStepIndex(workflowState.step);

  const nextStepLabel =
    activeStep + 1 < PADES_WORKFLOW_STEPS.length
      ? PADES_WORKFLOW_STEPS[activeStep + 1].label
      : "Finish";

  if (workflowState.step === "completed") {
    return (
      <Button onClick={onReset} fullWidth>
        Start New Workflow
      </Button>
    );
  }

  return (
    <Group grow>
      {workflowState.step === "generate" && (
        <Button variant="default" onClick={() => void generateDemoPDF()} loading={loading}>
          Generate Demo PDF
        </Button>
      )}

      <Button onClick={() => void runCurrentStep()} loading={loading} disabled={!canProceed}>
        {loading ? "Processing..." : `Continue to ${nextStepLabel}`}
      </Button>

      <Button color="red" variant="light" onClick={onReset} disabled={loading}>
        Reset Workflow
      </Button>
    </Group>
  );
}
