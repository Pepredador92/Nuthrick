import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { LegalAdminPage } from "./LegalAdminPage";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/src/lib/supabase",()=>({supabase:{rpc}}));
const doc={key:"terms",title:"Términos",body:"Texto revisado",preview_body:"Texto revisado",preview_hash:"hash",version:1,current_version:1,revision:2,review_status:"pending_review",effective_at:null,published_at:null,approved_at:null,approved_by:null,requires_acceptance:false,acceptances:0,history:[{version:1,status:"pending_review",effective_at:null}]};
const mount=()=>render(<MemoryRouter initialEntries={["/admin/legal/terms"]}><Routes><Route path="/admin/legal/:key" element={<LegalAdminPage/>}/></Routes></MemoryRouter>);
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue({data:doc,error:null});});
it("requires preview, date and exact confirmation before requesting approval",async()=>{
 mount();const button=await screen.findByRole("button",{name:"Aprobar v1"});expect(button).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Fecha efectiva"),{target:{value:"2026-10-01T09:00"}});expect(button).toBeDisabled();
 fireEvent.change(screen.getByLabelText(/Escribe: Confirmo/),{target:{value:"Confirmo que este documento fue revisado y aprobado."}});expect(button).toBeEnabled();
 expect(rpc).toHaveBeenCalledTimes(1);
 fireEvent.click(button);await waitFor(()=>expect(rpc).toHaveBeenCalledWith("legal_admin_api",expect.objectContaining({p_action:"approve",p_data:expect.objectContaining({version:1,revision:2,preview_hash:"hash",effective_at:expect.any(String)})})));
});
it("unresolved legal decisions prevent approval even with confirmation",async()=>{
 rpc.mockResolvedValue({data:{...doc,preview_body:"[PENDIENTE: DOMICILIO]"},error:null});mount();
 expect(await screen.findByText("[PENDIENTE: DOMICILIO]")).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Fecha efectiva"),{target:{value:"2026-10-01T09:00"}});
 fireEvent.change(screen.getByLabelText(/Escribe: Confirmo/),{target:{value:"Confirmo que este documento fue revisado y aprobado."}});
 expect(screen.getByRole("button",{name:"Aprobar v1"})).toBeDisabled();expect(rpc).toHaveBeenCalledTimes(1);
});
it("approved version offers a new version, no editing",async()=>{
 rpc.mockResolvedValue({data:{...doc,review_status:"approved",approved_at:"2026-09-25T12:00:00Z",approved_by:"admin"},error:null});mount();
 expect(await screen.findByRole("button",{name:"Crear v2"})).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Editar borrador"})).not.toBeInTheDocument();
});
