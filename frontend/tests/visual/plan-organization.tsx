import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PlanOrganization } from "@/src/components/diet/PlanOrganization";
import type { NutritionPlan } from "@/src/types/domain";
import "../../app/globals.css";
const rows=[{id:"free",title:"Plan libre de mantenimiento"},{id:"assigned",title:"Plan con un nombre amplio para comprobar el ajuste de texto",patient_id:"qa",patient_name:"Paciente ficticio con nombre largo"},{id:"published",title:"Plan publicado",current_version_id:"v",published_version_number:2},{id:"archived",title:"Plan archivado",status:"archived"}].map(p=>({status:"draft",updated_at:"2026-09-21",draft_revision:1,...p}) as NutritionPlan);
function Preview(){const [plans,setPlans]=useState(rows);return <MemoryRouter><main className="p-3"><PlanOrganization plans={plans} onChange={setPlans} onCreate={()=>{}}/></main></MemoryRouter>;}
createRoot(document.getElementById("root")!).render(location.search ? <Preview/> : <main style={{display:"flex",gap:24,padding:16}}><section><h1>390 px · móvil</h1><iframe title="Vista móvil" src="?embedded" style={{width:390,height:900,border:"1px solid #ddd"}}/></section><section><h2>900 px · escritorio</h2><iframe title="Vista escritorio" src="?embedded" style={{width:900,height:900,border:"1px solid #ddd"}}/></section></main>);
