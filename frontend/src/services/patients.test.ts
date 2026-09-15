import {beforeEach,describe,expect,it,vi} from 'vitest';
import {listConsultations} from './patients';
import {supabase} from '@/src/lib/supabase';
vi.mock('@/src/lib/supabase',()=>({supabase:{from:vi.fn()}}));
beforeEach(()=>vi.clearAllMocks());
describe('consultation history visibility',()=>{
 it('filters logically removed consultations in the shared source of history and recent consultations',async()=>{
  const query={select:vi.fn(),eq:vi.fn(),is:vi.fn(),order:vi.fn().mockResolvedValue({data:[{id:'visible'}],error:null})};
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.is.mockReturnValue(query);
  vi.mocked(supabase.from).mockReturnValue(query as never);
  expect(await listConsultations('patient')).toEqual([{id:'visible'}]);
  expect(supabase.from).toHaveBeenCalledWith('consultations');
  expect(query.eq).toHaveBeenCalledWith('patient_id','patient');
  expect(query.is).toHaveBeenCalledWith('deleted_at',null);
 });
});
