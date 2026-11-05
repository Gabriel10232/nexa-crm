import type { Deal, TenantData } from '../../types';
import { deals as dealSvc } from '../../services/crm';
import { prompt, toast } from '../../store/ui';

/** Moves a deal, asking for the loss reason when needed and reporting automations. */
export async function moveDeal(d: TenantData, deal: Deal, stageId: string) {
  const pipe = d.pipelines.find(p => p.id === deal.pipelineId)!;
  const st = pipe.stages.find(s => s.id === stageId)!;
  let reason: string | undefined;
  if (st.kind === 'lost') {
    const r = await prompt({ title: `Marcar "${deal.name}" como perdida`, label: 'Motivo da perda (obrigatório)', options: d.org.lostReasons, required: true });
    if (!r) return false;
    reason = r;
  }
  const runs = dealSvc.move(deal.id, stageId, reason);
  const auto = runs.length ? `${runs.length} automação(ões): ${runs.map(r => d.automations.find(a => a.id === r.automationId)?.name).filter(Boolean).join(', ')}` : undefined;
  if (st.kind === 'won') toast('success', '🎉 Venda ganha!', auto ?? `${deal.name} foi marcada como ganha.`);
  else toast(st.kind === 'lost' ? 'info' : 'success', `Movida para ${st.name}`, auto);
  return true;
}
