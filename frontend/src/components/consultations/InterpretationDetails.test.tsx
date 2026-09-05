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
