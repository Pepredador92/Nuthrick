import React from "react";
import { createRoot } from "react-dom/client";
import { CalculationCatalog } from "../../src/components/consultations/CalculationCatalog";
import { interpretResult } from "../../src/features/interpretations/engine";
import references from "../../src/features/interpretations/references.json";
import type { InterpretationReference } from "../../src/features/interpretations/types";
import type { CalculationEvaluation } from "../../src/features/calculations/engine";
import "./style.css";

// Synthetic values only. This harness imports the real result UI and interpretation engine.
const evaluations: CalculationEvaluation[] = [
  ["bmi","IMC","index",27.8,"kg/m²"],
  ["waist_hip_ratio","Índice cintura-cadera","index",0.92,"razón"],
  ["waist_height_ratio","Índice cintura-talla","index",0.52,"razón"],
  ["body_fat_jp7_siri","Jackson & Pollock 7 + Siri","body_fat",20.9,"%"],
  ["body_fat_jp3_siri","Jackson & Pollock 3 + Siri","body_fat",15.5,"%"],
  ["density_jackson_pollock_7","Jackson & Pollock 7","density",1.05117,"g/cm³"],
].map(([code,name,category,value,unit]) => ({
  item:{code:String(code),name:String(name),category:String(category),method_version:"1.0.0",status:"implemented",display_order:1,definition:{catalogVersion:1,resultKey:String(code),resultName:code === "density_jackson_pollock_7" ? "Densidad corporal" : String(name),methodName:String(name),summary:"Datos sintéticos para comprobar la presentación.",unit:String(unit),decimalPlaces:2,inputs:[],dependencies:[],references:[],limitations:"Ejemplo de verificación visual."}},
  state:"calculated",inputState:"complete",implementationState:"implemented",inputs:[],automaticInputs:[],measurementInputs:[],rawResult:Number(value),displayedResult:String(value),availableCount:0,requiredCount:0,availableMeasurementCount:0,requiredMeasurementCount:0,missingLabels:[],missingMeasurementIdsOutsideWorkspace:[],dependencyResults:{},dependencyLabels:[],dependencyStates:[],
}));
const interpretations=Object.fromEntries(evaluations.map((e)=>[e.item.code,interpretResult(e.item.code,e.rawResult!,e.item.definition.unit,{age:34,sex:"male",pregnant:false,bmi:27.8},references as InterpretationReference[],"synthetic")]));
createRoot(document.getElementById("root")!).render(<main style={{maxWidth:1100,margin:"auto",padding:16}}><CalculationCatalog evaluations={evaluations} interpretations={interpretations} adding={false} onAddMissing={()=>{}} /></main>);
