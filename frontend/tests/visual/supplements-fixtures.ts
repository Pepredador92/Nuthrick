import {supplementProduct} from '../fixtures/supplements';
import type {SupplementCatalogItem} from '../../../supabase/functions/_shared/supplements';
let products:SupplementCatalogItem[]=[supplementProduct];
export const listSupplements=async()=>products;
export const saveCustomSupplement=async(input:object,id?:string)=>{const p={...supplementProduct,...input,id:id??crypto.randomUUID(),owner_id:'demo'};products=[p,...products.filter(x=>x.id!==p.id)];return p;};
export const archiveCustomSupplement=async(id:string)=>{products=products.filter(p=>p.id!==id);};
