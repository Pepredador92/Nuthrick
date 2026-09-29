export const supabase = {
 auth: { getSession: async () => ({data:{session:{access_token:'synthetic-preview'}}}) },
 rpc: async () => ({data:{total:34,days:30,pageviews:20,visitors:12,timezone:'America/Mexico_City',daily:Array.from({length:7},(_,i)=>({day:`2026-09-${23+i}`,pageviews:i%3+2,visitors:i%2+1}))},error:null}),
};
export async function listPatients(){return {rows:[{id:'10000000-0000-0000-0000-000000000001',full_name:'Paciente de demostración'}]};}
