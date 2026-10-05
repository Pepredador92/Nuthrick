import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PortalCardHeading({ icon: Icon, title, subtitle, tone = "teal", trailing }: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: "teal" | "blue" | "violet" | "amber";
  trailing?: ReactNode;
}) {
  return <header className={`portal-card-heading is-${tone}`}>
    <span className="portal-card-icon"><Icon size={19} aria-hidden="true" /></span>
    <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {trailing}
  </header>;
}
