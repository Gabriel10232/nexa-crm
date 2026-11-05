import React from 'react';
import type { Lead, TenantData } from '../../types';
import { leads as leadSvc } from '../../services/crm';
import { confirm, prompt, toast } from '../../store/ui';
import { LEAD_STATUS } from '../../config/labels';

function impact(d: TenantData, l: Lead) {
  const deals = d.deals.filter(x => x.leadId === l.id || (l.converted?.dealId && x.id === l.converted.dealId));
  const acts = d.activities.filter(a => a.refs.leadId === l.id).length;
  return (
    <div className="stack-sm">
      <div className="kv">
        <dt>Registro</dt><dd><strong>{l.name}</strong></dd>
        <dt>Empresa</dt><dd>{l.companyName ?? '—'}</dd>
        <dt>Oportunidades</dt><dd>{deals.length ? deals.map(x => x.name).join(', ') : 'Nenhuma vinculada'}</dd>
        <dt>Histórico</dt><dd>{acts} atividade(s)</dd>
      </div>
    </div>
  );
}

export async function archiveLeads(d: TenantData, ids: string[]) {
  const list = d.leads.filter(l => ids.includes(l.id));
  const ok = await confirm({
    title: list.length === 1 ? `Excluir o lead "${list[0].name}"?` : `Excluir ${list.length} leads?`,
    body: <div className="stack-sm">
      {list.length === 1 && impact(d, list[0])}
      <p>Exclusão segura: o registro vai para <strong>Arquivados</strong> e pode ser restaurado a qualquer momento. Oportunidades e histórico são mantidos.</p>
    </div>,
    confirmLabel: 'Mover para arquivados', danger: true,
  });
  if (!ok) return false;
  leadSvc.archive(ids);
  toast('success', `${ids.length} lead(s) arquivado(s)`, undefined, { label: 'Desfazer', run: () => leadSvc.restore(ids) });
  return true;
}

export async function hardDeleteLead(d: TenantData, l: Lead) {
  const ok = await confirm({
    title: 'Excluir definitivamente?',
    body: <div className="stack-sm">{impact(d, l)}<p style={{ color: 'var(--danger)' }}>Esta ação não pode ser desfeita. O lead e seu histórico exclusivo serão apagados permanentemente.</p></div>,
    confirmLabel: 'Excluir para sempre', danger: true, typeToConfirm: l.name,
  });
  if (!ok) return false;
  leadSvc.hardDelete([l.id]);
  toast('success', 'Lead excluído definitivamente');
  return true;
}

export async function markLost(l: Lead, reasons: string[]) {
  const r = await prompt({ title: `Marcar "${l.name}" como perdido`, label: 'Motivo da perda', options: reasons, required: true });
  if (!r) return;
  leadSvc.update(l.id, { status: 'perdido', lostReason: r });
  toast('info', 'Lead marcado como perdido', `Motivo: ${r}`);
}

export const statusOptions = Object.entries(LEAD_STATUS).map(([k, x]) => ({ value: k, label: x.label }));
