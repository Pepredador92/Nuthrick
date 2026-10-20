import { Check, ChevronDown, Circle, Clock3 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import "./ClinicalWorkspace.css";

export type ClinicalTaskStatus =
  | "pending"
  | "progress"
  | "complete"
  | "approved";

export function ClinicalStatusBadge(
  { status, children }: { status: ClinicalTaskStatus; children: ReactNode },
) {
  const Icon = status === "complete" || status === "approved"
    ? Check
    : status === "progress"
    ? Clock3
    : Circle;
  return (
    <span className="clinical-status-badge" data-status={status}>
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A task's presentation stays independent of the consultation's navigation and persistence. */
export function ClinicalTaskCard(
  {
    id,
    marker,
    title,
    description,
    status = "pending",
    statusLabel,
    open,
    defaultOpen = false,
    onToggle,
    children,
  }: {
    id?: string;
    marker: ReactNode;
    title: string;
    description: string;
    status?: ClinicalTaskStatus;
    statusLabel: string;
    open?: boolean;
    defaultOpen?: boolean;
    onToggle?: () => void;
    children: ReactNode;
  },
) {
  const generatedId = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const isOpen = open ?? expanded;
  const headingId = id ?? generatedId;
  return (
    <section
      className="clinical-task-card"
      data-status={status}
      aria-labelledby={headingId}
    >
      <button
        id={headingId}
        type="button"
        className="clinical-task-heading"
        aria-expanded={isOpen}
        aria-controls={`${headingId}-content`}
        onClick={() => {
          if (onToggle) onToggle();
          else setExpanded((value) => !value);
        }}
      >
        <span className="clinical-task-marker" aria-hidden="true">
          {status === "complete" || status === "approved"
            ? <Check size={18} />
            : marker}
        </span>
        <span className="clinical-task-copy">
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <ClinicalStatusBadge status={status}>{statusLabel}</ClinicalStatusBadge>
        <ChevronDown
          size={17}
          className="clinical-task-chevron"
          aria-hidden="true"
        />
      </button>
      <div
        id={`${headingId}-content`}
        className="clinical-task-body"
        hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  );
}
