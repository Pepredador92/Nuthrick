import { supabase } from '@/src/lib/supabase';
import { isSupplementProduct, type SupplementCatalogItem, type SupplementProduct } from '../../../supabase/functions/_shared/supplements';
export type SupplementInput = Omit<SupplementProduct,'id'|'source_url'|'label_url'|'verified_at'>;
export async function listSupplements(): Promise<SupplementCatalogItem[]> {
  const all: SupplementCatalogItem[] = [];
  for (let offset = 0; ; offset += 250) {
    const {data,error} = await supabase.from('supplement_products').select('*').eq('active',true).order('id').range(offset,offset+249);
    if (error) throw new Error('No pudimos cargar la biblioteca de suplementos.');
    all.push(...data as SupplementCatalogItem[]);
    if (data.length < 250) return all;
  }
}
export async function saveCustomSupplement(input: SupplementInput, id?: string): Promise<SupplementCatalogItem> {
  if (!isSupplementProduct({...input,id:id ?? 'new',source_url:null,label_url:null,verified_at:null})) throw new Error('Revisa la porción y los valores nutricionales.');
  const {data:auth,error:authError} = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Inicia sesión nuevamente.');
  const payload = {...input,owner_id:auth.user.id,source_url:null,label_url:null,verified_at:null};
  const query = id ? supabase.from('supplement_products').update(payload).eq('id',id).eq('owner_id',auth.user.id) : supabase.from('supplement_products').insert(payload);
  const {data,error} = await query.select('*').single();
  if (error) throw new Error('No pudimos guardar el suplemento.');
  return data as SupplementCatalogItem;
}
export async function archiveCustomSupplement(id: string) {
  const {data,error} = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Inicia sesión nuevamente.');
  const result = await supabase.from('supplement_products').update({active:false}).eq('id',id).eq('owner_id',data.user.id).select('id').single();
  if (result.error) throw new Error('No pudimos quitar el suplemento de tu biblioteca.');
}
