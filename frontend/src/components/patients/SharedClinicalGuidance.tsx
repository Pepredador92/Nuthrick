import { ListChecks, Target } from "lucide-react";
import {
  type ClinicalGuidance,
  clinicalRouteLabels,
  clinicalSourceKey,
  type SharedObjective,
  sharedObjectiveLabels,
  type SharedStrategy,
  sharedStrategyLabels,
} from "../../../../supabase/functions/_shared/clinical-guidance";
import "./SharedClinicalGuidance.css";

function DetailFields(
  { labels, value, omit = [] }: {
    labels: Record<string, string>;
    value: Record<string, unknown>;
    omit?: string[];
  },
) {
  return (
    <dl className="shared-guidance-fields">
      {Object.entries(labels).filter(([key]) =>
        !omit.includes(key) && typeof value[key] === "string" &&
        String(value[key]).trim()
      ).map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{String(value[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
export function SharedObjectiveCard({ goal }: { goal: SharedObjective }) {
  return (
    <article className="shared-guidance-item is-goal">
      <h3>{goal.outcome}</h3>
      <DetailFields
        labels={sharedObjectiveLabels}
        value={goal}
        omit={["outcome", "indicator", "baseline", "monitoring", "feasibility"]}
      />
      <details>
        <summary>Ver cómo revisaremos el avance</summary>
        <DetailFields
          labels={sharedObjectiveLabels}
          value={goal}
          omit={["outcome", "target", "timeframe"]}
        />
      </details>
    </article>
  );
}
export function SharedStrategyCard({ strategy }: { strategy: SharedStrategy }) {
  return (
    <article className="shared-guidance-item">
      <h3>{strategy.title}</h3>
      <p className="shared-guidance-action">{strategy.action}</p>
      <DetailFields
        labels={sharedStrategyLabels}
        value={strategy}
        omit={Object.keys(sharedStrategyLabels).filter((key) =>
          !["frequency", "reviewAt"].includes(key)
        )}
      />
      <details>
        <summary>Ver cómo ponerlo en práctica</summary>
        <DetailFields
          labels={sharedStrategyLabels}
          value={strategy}
          omit={["title", "action", "frequency", "reviewAt"]}
        />
        {clinicalRouteLabels[strategy.route] && (
          <p className="shared-guidance-route">
            Vía: {clinicalRouteLabels[strategy.route]}
          </p>
        )}
      </details>
    </article>
  );
}
export function SharedClinicalGuidance(
  { content }: { content: ClinicalGuidance },
) {
  return (
    <>
      {Boolean(content.objectives?.length) && (
        <section className="portal-card shared-guidance-group">
          <header>
            <Target size={20} />
            <h2>Mis objetivos acordados</h2>
          </header>
          <div className="shared-guidance-list">
            {content.objectives!.map((goal) => (
              <SharedObjectiveCard
                key={clinicalSourceKey(goal.source)}
                goal={goal}
              />
            ))}
          </div>
        </section>
      )}
      {Boolean(content.strategies?.length) && (
        <section className="portal-card shared-guidance-group">
          <header>
            <ListChecks size={20} />
            <h2>Mis estrategias de intervención</h2>
          </header>
          <p className="shared-guidance-intro">
            Las acciones que acordamos para llevar tus objetivos a la práctica.
          </p>
          <div className="shared-guidance-list">
            {content.strategies!.map((strategy) => (
              <SharedStrategyCard
                key={clinicalSourceKey(strategy.source)}
                strategy={strategy}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
