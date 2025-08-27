import { useAtomValue } from "jotai";
import React from "react";

import { workflowStateAtom } from "../../store/atoms";

interface WorkflowStepInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const WORKFLOW_STEPS: WorkflowStepInfo[] = [
  {
    id: "upload",
    title: "PDF",
    description: "Generate or upload document",
    icon: "📄",
  },
  {
    id: "prepare",
    title: "Prepare",
    description: "Calculate ByteRange",
    icon: "⚙️",
  },
  {
    id: "presign",
    title: "Attributes",
    description: "Build signed attributes",
    icon: "📝",
  },
  {
    id: "sign",
    title: "Sign",
    description: "Sign with CPS/HSM",
    icon: "🔐",
  },
  {
    id: "finalize",
    title: "Finalize",
    description: "Add timestamp",
    icon: "📑",
  },
  {
    id: "verify",
    title: "Verify",
    description: "Validate signature",
    icon: "✅",
  },
];

export const WorkflowProgress: React.FC = () => {
  const workflowState = useAtomValue(workflowStateAtom);

  const getCurrentStepIndex = (): number => {
    return WORKFLOW_STEPS.findIndex((step) => step.id === workflowState.step);
  };

  const getStepStatus = (stepIndex: number): "completed" | "current" | "pending" => {
    const currentIndex = getCurrentStepIndex();
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "pending";
  };

  return (
    <div className="workflow-progress">
      <div className="workflow-progress__header">
        <h2>🔄 Workflow PAdES-B-T</h2>
        <p>Processus de signature électronique conforme ETSI EN 319 142-1</p>
      </div>

      <div className="workflow-progress__steps">
        {WORKFLOW_STEPS.map((step, index) => {
          const status = getStepStatus(index);
          return (
            <div key={step.id} className={`workflow-step workflow-step--${status}`}>
              <div className="workflow-step__indicator">
                <span className="workflow-step__number">{index + 1}</span>
                <span className="workflow-step__icon">{step.icon}</span>
              </div>
              <div className="workflow-step__content">
                <h3 className="workflow-step__title">{step.title}</h3>
                <p className="workflow-step__description">{step.description}</p>
                {status === "current" && (
                  <div className="workflow-step__status">
                    <span className="workflow-step__status-badge">En cours</span>
                  </div>
                )}
                {status === "completed" && (
                  <div className="workflow-step__status">
                    <span className="workflow-step__status-badge workflow-step__status-badge--completed">
                      ✅
                    </span>
                  </div>
                )}
              </div>
              {index < WORKFLOW_STEPS.length - 1 && (
                <div className={`workflow-step__connector workflow-step__connector--${status}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
