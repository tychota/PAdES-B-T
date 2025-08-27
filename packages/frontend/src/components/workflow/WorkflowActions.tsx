import { useAtomValue } from "jotai";
import React from "react";

import { workflowStateAtom, canProceedAtom, loadingAtom } from "../../store/atoms";

interface WorkflowActionsProps {
  onNext: () => void;
  onReset: () => void;
}

const STEP_TITLES = {
  prepare: "Prepare",
  presign: "Build Attributes",
  sign: "Sign Document",
  finalize: "Add Timestamp",
  verify: "Verify Signature",
};

export const WorkflowActions: React.FC<WorkflowActionsProps> = ({ onNext, onReset }) => {
  const workflowState = useAtomValue(workflowStateAtom);
  const canProceed = useAtomValue(canProceedAtom);
  const loading = useAtomValue(loadingAtom);

  if (workflowState.step === "upload" || workflowState.step === "completed") {
    return null;
  }

  const nextStepTitle = STEP_TITLES[workflowState.step];

  return (
    <div className="workflow-actions">
      <div className="workflow-actions__content">
        <button onClick={onReset} className="btn btn-secondary" type="button" disabled={loading}>
          🔄 Recommencer
        </button>

        <div className="workflow-actions__primary">
          <button
            onClick={onNext}
            disabled={loading || !canProceed}
            className="btn btn-primary btn-large"
            type="button"
          >
            {loading ? <span>⏳ Traitement en cours...</span> : <span>{nextStepTitle} →</span>}
          </button>
        </div>
      </div>
    </div>
  );
};
