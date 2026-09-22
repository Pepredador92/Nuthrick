import React, {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DietMenuStep} from '../../src/components/diet/DietMenuStep';
import {DietWorkshopAI} from '../../src/components/diet/DietWorkshopAI';
import {uxFixture} from '../fixtures/dietCopilotUX';
import '../../app/globals.css';

function Harness(){
  const state=new URLSearchParams(location.search).get('state')??'normal';
  const fixture=useMemo(()=>{
    const f=uxFixture(state==='replace'?'replace':state==='needs_adjustment'?'needs_adjustment':state==='invalid'?'invalid':'valid');
    f.input.source.plan.id=`visual-phase4b-${state}`;
    sessionStorage.removeItem(`workshop-ai-pending:${f.input.source.plan.id}`);
    return f;
  },[state]);
  const [plan,setPlan]=useState(fixture.input.source.plan),[epoch,setEpoch]=useState(0);
  const transport=useMemo(()=>state==='loading'?{...fixture.transport,generate:async()=>new Promise<never>(()=>{})}:fixture.transport,[fixture,state]);
  useEffect(()=>{
    // Reproduce states by operating the real component, never bypassing its guards.
    let live=true;
    const click=async(text:string)=>{for(let i=0;i<100&&live;i++){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);if(b){b.click();return;}await new Promise(r=>setTimeout(r,30));}};
    void(async()=>{if(state==='normal')return;await click('Crear propuesta con IA');
      if(state==='context'){await click('Revisar contexto');return;}if(state==='initial')return;
      await click('Generar propuesta');if(['replace','applied'].includes(state)){
        for(let i=0;i<100&&live;i++){const c=document.querySelector<HTMLInputElement>('dialog input[type=checkbox]');if(c){c.click();break;}await new Promise(r=>setTimeout(r,30));}
        await click('Aplicar al borrador');
      }
    })();return()=>{live=false;};
  },[state]);
  return <main className="mx-auto max-w-[1440px] p-3 sm:p-8"><p className="mb-4 text-xs">Prueba local · Datos ficticios · Sin llamadas a OpenAI</p>
    <DietMenuStep key={epoch} plan={plan} catalog={fixture.input.source.catalog} onSave={async menu=>setPlan(p=>({...p,diet_menu:menu}))} onGoToMeals={()=>undefined}
      headerActions={<DietWorkshopAI plan={plan} transport={transport} before={async()=>plan} onApplied={p=>{setPlan(p);setEpoch(v=>v+1);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-diet-ai-entry]')?.focus());}}/>}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
