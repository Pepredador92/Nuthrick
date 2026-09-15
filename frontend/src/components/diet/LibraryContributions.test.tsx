import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LibraryContributions } from './LibraryContributions';
import { libraryContributionAccess, listLibraryContributions, reviewLibraryContribution, withdrawLibraryContribution, type LibraryContribution } from '@/src/services/dietLibrary';
import { makeLibraryContent } from '@/src/features/diet-library/model';
import { weeklyFixture } from '../../../tests/fixtures/weeklyMenu';
vi.mock('@/src/services/dietLibrary',()=>({libraryContributionAccess:vi.fn(),listLibraryContributions:vi.fn(),reviewLibraryContribution:vi.fn(),withdrawLibraryContribution:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks(); const {menu,distribution}=weeklyFixture([1,1,1]);
  menu.week_plan={schema_version:1,days:[{day:'mon',assignments:menu.meal_options!.map(o=>({meal_time_id:o.meal_time_id,option_id:o.id,option_snapshot:o,fixed:false}))}]};
  vi.mocked(listLibraryContributions).mockResolvedValue([{id:'submission',source_id:'base',source_revision:1,name:'Base aportada',content:makeLibraryContent({target_calories:null,macro_distribution:null,exchange_prescription:null,meal_distribution:distribution,diet_menu:menu}),status:'pending',review_note:null}] as LibraryContribution[]);
  vi.mocked(libraryContributionAccess).mockResolvedValue(false);
  vi.mocked(reviewLibraryContribution).mockResolvedValue(undefined); vi.mocked(withdrawLibraryContribution).mockResolvedValue(undefined);
});
it('allows a contributor to withdraw but not review',async()=>{
 render(<LibraryContributions/>); fireEvent.click(await screen.findByRole('button',{name:/Base aportada/}));
 expect(screen.queryByRole('button',{name:'Aprobar y publicar copia'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Retirar aportación pendiente'}));
 await waitFor(()=>expect(withdrawLibraryContribution).toHaveBeenCalledWith('submission'));
});
it('requires review checklist and a reason for rejection',async()=>{
 vi.mocked(libraryContributionAccess).mockResolvedValue(true); render(<LibraryContributions/>);
 fireEvent.click(await screen.findByRole('button',{name:/Base aportada/}));
 const approve=screen.getByRole('button',{name:'Aprobar y publicar copia'}); expect(approve).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé privacidad/})); expect(approve).toBeEnabled();
 expect(screen.getByRole('button',{name:'Devolver con observaciones'})).toBeDisabled();
 fireEvent.click(approve); await waitFor(()=>expect(reviewLibraryContribution).toHaveBeenCalledWith('submission',true,'',true));
});
