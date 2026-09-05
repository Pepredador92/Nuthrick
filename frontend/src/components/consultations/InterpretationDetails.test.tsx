import { fireEvent, render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import {
  InterpretationDetails,
  InterpretationLabel,
} from "./InterpretationDetails";
import { interpretResult } from "@/src/features/interpretations/engine";
import references from "@/src/features/interpretations/references.json";
import type { InterpretationReference } from "@/src/features/interpretations/types";

it("shows a discrete label and the exact reference, raw value and range on demand", () => {
  const interpretation = interpretResult(
    "bmi",
    24.96,
    "kg/m²",
    { age: 34, sex: "male", pregnant: false, bmi: 24.96 },
    references as InterpretationReference[],
    "c",
  );
  const method = vi.fn();
  render(
    <>
      <InterpretationLabel interpretation={interpretation} />
      <InterpretationDetails
        interpretation={interpretation}
        onViewMethod={method}
      />
    </>,
  );
  expect(screen.getAllByText("Peso normal")).toHaveLength(2);
  fireEvent.click(screen.getByText("Ver detalles"));
  expect(screen.getByText(/Valor utilizado: 24.96/)).toBeVisible();
  expect(screen.getByText(/≥ 18.5 y < 25/)).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute("href", references[0].url);
  fireEvent.click(
    screen.getByRole("button", { name: "Ver método de cálculo" }),
  );
  expect(method).toHaveBeenCalledOnce();
});
it("keeps unreferenced results free of classification labels", () => {
  const r = interpretResult(
    "body_fat_jp7_siri",
    20,
    "%",
    {},
    references as InterpretationReference[],
    "c",
  );
  const { container } = render(<InterpretationLabel interpretation={r} />);
  expect(container).toBeEmptyDOMElement();
});

it("shows the raw and half-unit values for a Heath-Carter descriptor", () => {
  const interpretation = interpretResult(
    "somatotype_endomorphy",
    2.75,
    "componente",
    { age: 34, sex: "male", pregnant: false, bmi: 24 },
    references as InterpretationReference[],
    "c",
  );
  render(
    <InterpretationDetails interpretation={interpretation} onViewMethod={vi.fn()} />,
  );
  fireEvent.click(screen.getByText("Ver detalles"));
  expect(screen.getByText(/Valor utilizado: 2.75 componente/)).toBeVisible();
  expect(
    screen.getByText(/Valor interpretado después del redondeo metodológico: 3 componente/),
  ).toBeVisible();
  expect(screen.getByText("Endomorfia moderada")).toBeVisible();
});

it("groups the somatotype category and component traces under one detail", () => {
  const context = {
    age: 34,
    sex: "male",
    pregnant: false,
    bmi: 24,
    somatotypeCategory: "endomorphic-mesomorph",
  };
  const category = interpretResult(
    "somatochart_coordinates",
    -2,
    "coordenadas",
    context,
    references as InterpretationReference[],
    "c",
  );
  const component = interpretResult(
    "somatotype_mesomorphy",
    5,
    "componente",
    context,
    references as InterpretationReference[],
    "c",
  );
  render(
    <InterpretationDetails
      interpretation={category}
      related={[
        { key: "mesomorphy", label: "Mesomorfia", interpretation: component },
      ]}
      onViewMethod={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Ver detalles"));
  expect(screen.getByText("Mesomorfo endomórfico")).toBeVisible();
  expect(screen.getByText("Interpretación · Mesomorfia")).toBeVisible();
  expect(screen.getByText("Mesomorfia moderada")).toBeVisible();
});
