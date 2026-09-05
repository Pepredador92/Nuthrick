import type { Interpretation } from "@/src/features/interpretations/types";

export function InterpretationLabel({
  interpretation,
}: {
  interpretation?: Interpretation | null;
}) {
  if (!interpretation || interpretation.state === "no_reference") return null;
  return (
    <p className="mt-1 text-xs font-medium leading-5 text-[#52705f]">
      {interpretation.state === "classified"
        ? interpretation.rule?.label
        : interpretation.state === "missing_context"
          ? `Interpretación no disponible. ${interpretation.reason}`
          : interpretation.state === "requires_decision"
            ? "Requiere decisión metodológica"
            : "Sin clasificación disponible con la referencia actual"}
    </p>
  );
}

export function InterpretationDetails({
  interpretation,
  onViewMethod,
}: {
  interpretation?: Interpretation | null;
  onViewMethod: () => void;
}) {
  const reference = interpretation?.reference;
  const rule = interpretation?.rule;
  return (
    <details className="mt-2 text-xs leading-5 text-[#60766a]">
      <summary className="cursor-pointer font-semibold text-[#315e4f]">
        Ver detalles
      </summary>
      <div className="mt-3 min-w-0 space-y-2 break-words border-t border-[#e1e8e3] pt-3">
        <p className="font-semibold text-[#173d36]">Interpretación</p>
        <p>
          {interpretation
            ? interpretation.state === "classified"
              ? rule?.label
              : interpretation.reason
            : "Sin interpretación guardada. Este resultado conserva su registro original."}
        </p>
        {interpretation && (
          <p>
            Valor utilizado: {interpretation.value} {interpretation.unit}
          </p>
        )}
        {rule && (
          <>
            <p>
              Rango aplicado:{" "}
              {rule.lower !== null
                ? `${rule.lowerInclusive ? "≥" : ">"} ${rule.lower}`
                : "Sin límite inferior"}
              {rule.upper !== null
                ? ` y ${rule.upperInclusive ? "≤" : "<"} ${rule.upper}`
                : " · sin límite superior"}{" "}
              {interpretation?.unit}
            </p>
            <p>{rule.description}</p>
          </>
        )}
        {reference && (
          <>
            <p className="font-semibold">
              Referencia interpretativa: {reference.name}
            </p>
            <p>
              {reference.organization} · {reference.sourceVersion} · catálogo v
              {reference.version}
            </p>
            <a
              href={reference.url}
              target="_blank"
              rel="noreferrer"
              className="block underline underline-offset-2"
            >
              {reference.title}
            </a>
            <p>{reference.locator}</p>
            <p>Población: {reference.population}</p>
            <ul className="list-disc space-y-1 pl-4">
              {[...reference.notes, ...reference.limitations].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        )}
        {interpretation && (
          <>
            <p>
              Edad en la consulta:{" "}
              {interpretation.context.age ?? "Sin registrar"} · Sexo para
              ecuaciones:{" "}
              {interpretation.context.sex === "male"
                ? "Masculino"
                : interpretation.context.sex === "female"
                  ? "Femenino"
                  : "Sin registrar"}{" "}
              · Gestación:{" "}
              {interpretation.context.pregnant === true
                ? "Sí"
                : interpretation.context.pregnant === false
                  ? "No"
                  : "Sin registrar"}
            </p>
            {interpretation.context.bmi !== null &&
              interpretation.context.bmi !== undefined && (
                <p>
                  IMC utilizado para aplicabilidad: {interpretation.context.bmi}{" "}
                  kg/m²
                </p>
              )}
            <p>
              Fecha de interpretación:{" "}
              {new Date(interpretation.interpretedAt).toLocaleString("es-MX")}
            </p>
          </>
        )}
        <button
          type="button"
          className="font-semibold text-[#315e4f] underline underline-offset-2"
          onClick={onViewMethod}
        >
          Ver método de cálculo
        </button>
      </div>
    </details>
  );
}
