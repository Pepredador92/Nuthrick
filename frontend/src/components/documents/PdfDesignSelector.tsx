import { useId } from "react";
import type { PdfDesign } from "../../../../supabase/functions/agenda/document-design";
import "./PdfExport.css";
export type { PdfDesign } from "../../../../supabase/functions/agenda/document-design";

export function PdfDesignSelector(
  { value, onChange, disabled = false }: {
    value: PdfDesign;
    onChange: (value: PdfDesign) => void;
    disabled?: boolean;
  },
) {
  const name = useId();
  return (
    <fieldset className="pdf-design-selector" disabled={disabled}>
      <legend>Diseño del PDF</legend>
      <div className="pdf-design-options">
        {([{
          id: "current",
          title: "Actual",
          description: "Tarjetas, color y bloques visuales.",
        }, {
          id: "formal",
          title: "Tradicional formal",
          description:
            "Fondo blanco, tipografía clásica y secciones numeradas.",
        }] as const).map((option) => (
          <label key={option.id} data-selected={value === option.id}>
            <div
              className="pdf-design-sample"
              data-design={option.id}
              aria-hidden="true"
            >
              <div>
                <b>Consultorio</b>
                <i />
                <i />
                <hr />
                <strong>
                  {option.id === "formal"
                    ? "1. Consulta nutricional"
                    : "Consulta nutricional"}
                </strong>
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="pdf-design-choice">
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={value === option.id}
                onChange={() =>
                  onChange(option.id)}
              />
              <span>
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
            </div>
          </label>
        ))}
      </div>
      <p>Ambos incluyen el mismo contenido y los datos del nutriólogo.</p>
    </fieldset>
  );
}
