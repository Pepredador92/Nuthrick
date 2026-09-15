import React from "react";
import { createRoot } from "react-dom/client";
import { DietLibrary } from "@/src/components/diet/DietLibrary";
import { plan } from "./library-service";
import "../../app/globals.css";
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-6xl p-3 sm:p-8">
    <p className="mb-4 text-sm">
      Prueba visual · datos ficticios · sin conexión a pacientes
    </p>
    <DietLibrary
      plan={plan}
      suggestions
      capture={async () => plan}
      onApply={async () => {}}
    />
  </main>,
);
