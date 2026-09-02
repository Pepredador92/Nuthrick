import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionField } from "./QuestionField";
import { initialInterview } from "@/src/features/consultations/interviewTemplate";
import type { Question } from "@/src/features/consultations/questionnaire";

const get = (key: string) =>
  initialInterview.sections
    .flatMap((s) => s.questions)
    .find((q) => q.question_key === key)!;
function Harness({ question }: { question: Question }) {
  const [value, setValue] = useState<unknown>();
  return (
    <QuestionField question={question} value={value} onChange={setValue} />
  );
}

describe("quick interview inputs", () => {
  it("shows selected symptoms and prevents contradictory none selection", () => {
    render(<Harness question={get("general_symptoms")} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Fatiga" }));
    expect(screen.getByRole("checkbox", { name: "Fatiga" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ninguno referido" }));
    expect(screen.getByRole("checkbox", { name: "Fatiga" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Ninguno referido" }),
    ).toBeChecked();
  });
  it("renders labeled medicine fields, retains earlier rows and optional details", () => {
    render(<Harness question={get("medication_list_v2")} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar medicamento" }),
    );
    fireEvent.change(screen.getByLabelText("Nombre del producto *"), {
      target: { value: "Producto de prueba" },
    });
    fireEvent.change(screen.getByLabelText("Frecuencia"), {
      target: { value: "Diario" },
    });
    expect(
      screen.getByText("Completar detalles (opcional)"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar medicamento" }),
    );
    expect(screen.getAllByLabelText("Nombre del producto *")).toHaveLength(2);
    expect(screen.getAllByLabelText("Nombre del producto *")[0]).toHaveValue(
      "Producto de prueba",
    );
  });
  it("records frequency independently for each group with no selected default", () => {
    render(<Harness question={get("food_frequency_v2")} />);
    const vegetables = screen.getByLabelText("Verduras");
    expect(vegetables).toHaveValue("");
    fireEvent.change(vegetables, { target: { value: "Diario" } });
    expect(vegetables).toHaveValue("Diario");
    expect(screen.getByLabelText("Frutas")).toHaveValue("");
    expect(
      within(vegetables).getByRole("option", { name: "Nunca" }),
    ).toBeInTheDocument();
  });
  it("keeps older saved options visible instead of losing the answer", () => {
    render(
      <QuestionField
        question={get("main_reason")}
        value="Un motivo anterior"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("Un motivo anterior");
    expect(
      screen.getByRole("option", {
        name: "Un motivo anterior (guardado anteriormente)",
      }),
    ).toBeInTheDocument();
  });
});
