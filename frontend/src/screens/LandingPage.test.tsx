import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

function mount() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>);
}

describe("LandingPage", () => {
  it("communicates the finished-consultation positioning through its only H1", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Termina cada consulta con el trabajo hecho." })).toBeInTheDocument();
    expect(screen.getAllByText("Hasta el mejor nutriólogo tiene sus trucos.", { selector: "p" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/empieza gratis|gratis para siempre|plan gratuito/i)).not.toBeInTheDocument();
  });

  it("keeps the initial pricing in reusable plan cards without implying subscriptions exist", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Nuthrick Essential" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nuthrick Pro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nuthrick Complete" })).toBeInTheDocument();
    expect(screen.getByText("Mejor valor")).toBeInTheDocument();
    expect(screen.getByText(/no activan suscripciones, permisos ni límites/i)).toBeInTheDocument();
  });

  it("labels vision features as upcoming instead of exposing unavailable functionality", () => {
    mount();
    expect(screen.getByText("Función en desarrollo")).toBeInTheDocument();
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThanOrEqual(2);
  });
});
