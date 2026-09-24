import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminLayout } from "../../src/features/admin/AdminLayout";
import {
  AdminHome,
  ProfessionalsPage,
  PlansPage,
  PlanEditorPage,
  CreditsPage,
} from "../../src/features/admin/AdminPages";
import { ProfessionalPage } from "../../src/features/admin/ProfessionalPage";
import { CommercialPlansPage } from "../../src/features/admin/CommercialPlansPage";
import { CodesPage } from "../../src/features/admin/CodesPage";
import "../../app/globals.css";
const view = new URLSearchParams(location.search).get("view") ?? "";
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/admin" + view]}>
    <Routes>
      <Route path="/admin/commercial-plans" element={<CommercialPlansPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="professionals" element={<ProfessionalsPage />} />
        <Route
          path="professionals/:professionalId"
          element={<ProfessionalPage />}
        />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/:planId" element={<PlanEditorPage />} />
        <Route path="access" element={<ProfessionalsPage accessMode />} />
        <Route path="access/codes" element={<CodesPage />} />
        <Route path="credits" element={<CreditsPage />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
