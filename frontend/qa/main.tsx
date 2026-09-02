import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ConsultationTemplateEditorPage } from "../src/screens/ConsultationTemplateEditorPage";
import { ConsultationPage } from "../src/screens/ConsultationPage";
import { PrivateLayout } from "../src/layouts/PrivateLayout";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route element={<PrivateLayout />}>
        <Route
          path="/app/consultation-templates/:consultationType"
          element={<ConsultationTemplateEditorPage />}
        />
        <Route
          path="/app/patients/:patientId/consultations/new"
          element={<ConsultationPage />}
        />
        <Route
          path="*"
          element={
            <div>
              <h1>Verificación local · sin datos reales</h1>
              <p className="my-4">
                Este servidor de pruebas no se conecta a Supabase ni guarda
                expedientes.
              </p>
              <Link
                className="nuth-button"
                to="/app/patients/fixture/consultations/new"
              >
                Abrir borrador de prueba
              </Link>
            </div>
          }
        />
      </Route>
    </Routes>
  </BrowserRouter>,
);
