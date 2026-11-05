import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArchiveRestore, Trash2, Archive as ArchiveIcon } from 'lucide-react';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { leads as leadSvc, people as peopleSvc, companies as companySvc, deals as dealSvc } from '../../services/crm';
import { PageHeader } from '../../components/common';
import { Badge, Button, Empty, Tabs, Notice } from '../../components/ui';
import { confirm, toast } from '../../store/ui';
import { relTime } from '../../lib/utils';

export default function ArchivePage() {
  const d = useTenant(); const { can } = useSession();
  const [tab, setTab] = useState<'leads' | 'people' | 'companies' | 'deals'>('leads');
  const sets = {
    leads: d.leads.filter(x => x.archivedAt).map(x => ({ id: x.id, name: x.name, sub: x.companyName ?? 'Pessoa física', at: x.archivedAt!, to: `/leads/${x.id}`, restore: () => leadSvc.restore([x.id]), del: () => leadSvc.hardDelete([x.id]) })),
    people: d.people.filter(x => x.archivedAt).map(x => ({ id: x.id, name: x.name, sub: x.jobTitle ?? '', at: x.archivedAt!, to: `/people/${x.id}`, restore: () => peopleSvc.archive(x.id, false), del: () => peopleSvc.hardDelete(x.id) })),
    companies: d.companies.filter(x => x.archivedAt).map(x => ({ id: x.id, name: x.tradeName, sub: x.segment, at: x.archivedAt!, to: `/companies/${x.id}`, restore: () => companySvc.archive(x.id, false), del: () => companySvc.hardDelete(x.id) })),
    deals: d.deals.filter(x => x.archivedAt).map(x => ({ id: x.id, name: x.name, sub: x.product, at: x.archivedAt!, to: `/opportunities/${x.id}`, restore: () => dealSvc.archive(x.id, false), del: () => dealSvc.hardDelete(x.id) })),
  };
  const rows = sets[tab];
  return (
    <div>
      <PageHeader title="Arquivados" desc="Área de recuperação: registros excluídos com segurança (soft delete) podem ser restaurados." crumbs={[{ label: 'Início', to: '/' }, { label: 'Arquivados' }]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'leads', label: 'Leads', count: sets.leads.length }, { value: 'people', label: 'Pessoas', count: sets.people.length }, { value: 'companies', label: 'Empresas', count: sets.companies.length }, { value: 'deals', label: 'Oportunidades', count: sets.deals.length }]} />
      {!can('hardDelete') && <div style={{ marginBottom: 12 }}><Notice>Exclusão definitiva disponível apenas para Proprietário e Administrador.</Notice></div>}
      <div className="card">
        {rows.length === 0 ? <Empty icon={<ArchiveIcon size={22} />} title="Nada arquivado aqui" text="Itens excluídos aparecem nesta área e podem ser restaurados a qualquer momento." /> : (
          <div className="list">{rows.map(r => (
            <div key={r.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <div className="flex1 small"><Link to={r.to} className="strong">{r.name}</Link><div className="xs muted">{r.sub}</div></div>
              <Badge tone="warning">Arquivado {relTime(r.at)}</Badge>
              <Button size="xs" disabled={!can('edit')} onClick={() => { r.restore(); toast('success', `${r.name} restaurado`); }}><ArchiveRestore />Restaurar</Button>
              {can('hardDelete') && <Button size="xs" variant="danger" onClick={async () => { if (await confirm({ title: 'Excluir definitivamente?', body: 'Esta ação não pode ser desfeita.', typeToConfirm: r.name, danger: true, confirmLabel: 'Excluir para sempre' })) { r.del(); toast('success', 'Excluído definitivamente'); } }}><Trash2 />Excluir</Button>}
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
