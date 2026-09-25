import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { LegalPage } from "./LegalPage";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/src/lib/supabase",()=>({supabase:{rpc}}));
it("public route shows no draft or invented version",async()=>{
 rpc.mockResolvedValue({data:null,error:null});render(<MemoryRouter><LegalPage type="privacy"/></MemoryRouter>);
 expect(await screen.findByText(/todavía no hay una versión aprobada/)).toBeInTheDocument();expect(screen.queryByText(/Versión 1/)).not.toBeInTheDocument();
});
it("approved content is rendered as escaped text",async()=>{
 rpc.mockResolvedValue({data:{title:"Términos",body:'## Servicio\nTexto <script>malicious()</script>',version:2,review_status:"approved",effective_at:"2026-09-25T12:00:00Z"},error:null});
 const {container}=render(<MemoryRouter><LegalPage type="terms"/></MemoryRouter>);
 expect(await screen.findByText(/Texto <script>/)).toBeInTheDocument();expect(container.querySelector("script")).toBeNull(); expect(screen.getByRole("heading", {name:"Servicio"})).toBeInTheDocument();
});
