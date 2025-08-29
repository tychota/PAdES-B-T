import { WorkflowStep } from "../store/atoms";

export const PADES_WORKFLOW_STEPS = [
  { id: "generate", label: "Generate", description: "Create or upload PDF" },
  { id: "preSign", label: "Prepare", description: "Add placeholder" },
  { id: "sign", label: "Sign", description: "Use CPS/HSM" },
  { id: "finalize", label: "Finalize", description: "Embed & Timestamp" },
  { id: "verify", label: "Verify", description: "Validate signature" },
];

const stepOrder: WorkflowStep[] = [
  "generate",
  "preSign",
  "sign",
  "finalize",
  "verify",
  "completed",
];

export function getStepIndex(step: WorkflowStep): number {
  return stepOrder.indexOf(step);
}
