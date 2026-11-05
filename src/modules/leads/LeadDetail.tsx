import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Pencil, Archive, ArchiveRestore, Trash2, Copy, MoreHorizontal, RotateCcw, XCircle, Flag, Tag, UserCheck, Building2, User } from 'lucide-react';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { leads as leadSvc } from '../../services/crm';
import { PageHeader, Timeline, timelineFor, UserChip, Money, useLookups } from '../../components/common';
import { QuickActions, TasksPanel, DealsPanel, ChangeLog, NotesPanel } from '../../components/detail';
import { Avatar, Badge, Button, Empty, Menu, Tabs, TagChip, Notice, Progress } from '../../components/ui';
import { LeadForm, ConvertLeadModal, DuplicateAlert } from '../../components/forms';
import { LEAD_STATUS, TEMPERATURE } from '../../config/labels';
import { findDuplicates } from '../../services/crm';
import { prompt, toast } from '../../store/ui';
import { fmtDate, relTime, daysBetween } from '../../lib/utils';
import { archiveLeads, hardDeleteLead, markLost, statusOptions } from './actions';

export default function LeadDetail() {
  const { id } = useParams(); const d = useTenant(); const nav = useNavigate(); const { can } = useSession(); const L = useLookups();
  const l = d.leads.find(x => x.id === id);
  const [tab, setTab] = useState<'overview' | 'timeline' | 'tasks' | 'deals' | 'notes' | 'changes'>('overview');
  const [edit, setEdit] = useState(false);
  const [convert, setConvert] = useState(false);
  const [ignoreDup, setIgnoreDup] = useState(false);
  if (!l) return <div className="card"><Empty title="Lead não encontrado" text="Ele pode ter sido excluído definitivamente." action={<Button onClick={() => nav('/leads')}>Voltar para leads</Button>} /></div>;
  const refs = { leadId: l.id };
  const tl = timelineFor(d, { leadId: l.id, personId: l.converted?.personId, dealId: l.converted?.dealId });
  const deals = d.deals.filter(x => x.leadId === l.id || x.id === l.converted?.dealId);
  const dups = ignoreDup ? [] : findDuplicates(d, { name: l.name, email: l.email, phone: l.phone, cpf: l.cpf, cnpj: l.cnpj }, l.id).filter(h => h.id !== l.personId && h.id !== l.companyId && h.id !== l.converted?.personId && h.id !== l.converted?.companyId);
  const closed = ['convertido', 'perdido', 'desqualificado'].includes(l.status);

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Leads', to: '/leads' }, { label: l.name }]} title={
        <span className="detail-head"><Avatar name={l.name} size="lg" /><span className="grow"><span style={{ display: 'block' }}>{l.name}</span>
          <span className="row wrap" style={{ gap: 6, marginTop: 6, fontSize: 13 }}>
            <Badge tone={LEAD_STATUS[l.status].tone} dot>{LEAD_STATUS[l.status].label}</Badge>
            <Badge tone={TEMPERATURE[l.temperature].tone}>{TEMPERATURE[l.temperature].label}</Badge>
            <Badge>{l.kind === 'business' ? 'Lead empresarial' : 'Lead individual'}</Badge>
            {l.archivedAt && <Badge tone="warning">Arquivado</Badge>}
            <span className="muted small row" style={{ gap: 6, fontWeight: 500 }}>Responsável: <UserChip id={l.ownerId} /></span>
          </span></span></span>}
        actions={<>
          {l.archivedAt ? <Button onClick={() => { leadSvc.restore([l.id]); toast('success', 'Lead restaurado'); }}><ArchiveRestore />Restaurar</Button>
            : !closed && can('edit') && <Button variant="primary" onClick={() => setConvert(true)}><ArrowRightLeft />Converter</Button>}
          {can('edit') && <Button onClick={() => setEdit(true)}><Pencil />Editar</Button>}
          <Menu width={240} trigger={p => <Button {...p} icon aria-label="Mais ações"><MoreHorizontal /></Button>}>
            {can('edit') && <>
              <div className="menu-label">Alterar status</div>
              {statusOptions.filter(s => s.value !== 'perdido' && s.value !== 'convertido').map(s => <button key={s.value} onClick={() => leadSvc.update(l.id, { status: s.value as typeof l.status })}><Flag />{s.label}</button>)}
              <button onClick={() => markLost(l, d.org.lostReasons)}><XCircle />Marcar como perdido</button>
              {['perdido', 'desqualificado'].includes(l.status) && <button onClick={() => { leadSvc.reopen(l.id); toast('success', 'Lead reaberto'); }}><RotateCcw />Reabrir lead</button>}
              <hr />
              <button onClick={async () => { const u = await prompt({ title: 'Transferir responsável', label: 'Novo responsável', options: d.users.filter(x => x.active).map(x => x.name), required: true }); const usr = d.users.find(x => x.name === u); if (usr) { leadSvc.update(l.id, { ownerId: usr.id, teamId: usr.teamId }); toast('success', `Transferido para ${usr.name}`); } }}><UserCheck />Alterar responsável</button>
              <button onClick={async () => { const t = await prompt({ title: 'Adicionar tag', label: 'Tag', options: d.tags.map(x => x.name), required: true }); if (t && !l.tags.includes(t)) leadSvc.update(l.id, { tags: [...l.tags, t] }); }}><Tag />Adicionar tag</button>
              <button onClick={() => { const c = leadSvc.clone(l.id); if (c) { toast('success', 'Lead clonado'); nav(`/leads/${c.id}`); } }}><Copy />Clonar lead</button>
            </>}
            <hr />
            {!l.archivedAt && can('edit') && <button onClick={async () => { if (await archiveLeads(d, [l.id])) nav('/leads'); }}><Archive />Arquivar</button>}
            {can('hardDelete') ? <button className="danger" onClick={async () => { if (await hardDeleteLead(d, l)) nav('/leads'); }}><Trash2 />Excluir definitivamente</button>
              : <button className="danger" onClick={() => toast('error', 'Sem permissão', 'Exclusão definitiva é restrita a Proprietário e Administrador.')}><Trash2 />Excluir definitivamente</button>}
          </Menu>
        </>} />

      <div className="stack">
        {dups.length > 0 && <DuplicateAlert hits={dups} onIgnore={() => setIgnoreDup(true)} onMerge={h => { leadSvc.merge(l.id, h.id); toast('success', 'Leads mesclados'); }} />}
        {l.status === 'convertido' && l.converted && <Notice tone="success">Lead convertido {relTime(l.convertedAt)}.{' '}
          {l.converted.personId && <Link to={`/people/${l.converted.personId}`} style={{ textDecoration: 'underline' }}>Ver pessoa</Link>}{' '}
          {l.converted.companyId && <Link to={`/companies/${l.converted.companyId}`} style={{ textDecoration: 'underline' }}>Ver empresa</Link>}{' '}
          {l.converted.dealId && <Link to={`/opportunities/${l.converted.dealId}`} style={{ textDecoration: 'underline' }}>Ver oportunidade</Link>}</Notice>}
        {l.lostReason && <Notice tone="danger">Motivo da perda: <strong>{l.lostReason}</strong></Notice>}
        {!l.archivedAt && <QuickActions refs={refs} phone={l.phone} whatsapp={l.whatsapp} email={l.email} onDeal={() => setConvert(true)} />}

        <div className="split">
          <div className="card">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Visão geral' }, { value: 'timeline', label: 'Timeline', count: tl.length }, { value: 'tasks', label: 'Tarefas' }, { value: 'deals', label: 'Oportunidades', count: deals.length }, { value: 'notes', label: 'Notas' }, { value: 'changes', label: 'Alterações' }]} />
            {tab === 'overview' && (
              <div className="grid g2">
                <dl className="kv">
                  <dt>Empresa</dt><dd>{l.companyId ? <Link to={`/companies/${l.companyId}`} style={{ textDecoration: 'underline' }}>{l.companyName}</Link> : l.companyName ?? '—'}</dd>
                  <dt>Cargo</dt><dd>{l.jobTitle ?? '—'}</dd>
                  <dt>E-mail</dt><dd>{l.email ?? '—'}</dd>
                  <dt>Telefone</dt><dd>{l.phone ?? '—'}</dd>
                  <dt>WhatsApp</dt><dd>{l.whatsapp ?? '—'}</dd>
                  <dt>Cidade</dt><dd>{l.city ? `${l.city}/${l.state}` : '—'}</dd>
                  <dt>Site</dt><dd>{l.website ?? '—'}</dd>
                  <dt>{l.kind === 'business' ? 'CNPJ' : 'CPF'}</dt><dd>{(l.kind === 'business' ? l.cnpj : l.cpf) ?? '—'}</dd>
                </dl>
                <dl className="kv">
                  <dt>Origem</dt><dd>{l.source}</dd>
                  <dt>Campanha</dt><dd>{l.campaign ?? '—'}</dd>
                  <dt>Produto</dt><dd>{l.product ?? '—'}</dd>
                  <dt>Valor estimado</dt><dd><Money v={l.value} /></dd>
                  <dt>Equipe</dt><dd>{d.teams.find(t => t.id === l.teamId)?.name}</dd>
                  <dt>Entrada</dt><dd>{fmtDate(l.createdAt)}</dd>
                  <dt>Último contato</dt><dd>{relTime(l.lastContactAt)}</dd>
                  <dt>Próximo contato</dt><dd style={{ color: l.nextContactAt && new Date(l.nextContactAt) < new Date() ? 'var(--danger)' : undefined }}>{fmtDate(l.nextContactAt)}</dd>
                </dl>
                {l.notes && <div className="full" style={{ gridColumn: '1/-1' }}><div className="label">Observações</div><p style={{ whiteSpace: 'pre-wrap' }}>{l.notes}</p></div>}
                {d.customFields.filter(c => c.entity === 'lead').length > 0 && <dl className="kv" style={{ gridColumn: '1/-1' }}>{d.customFields.filter(c => c.entity === 'lead').map(c => <React.Fragment key={c.id}><dt>{c.label}</dt><dd>{l.custom?.[c.id] || '—'}</dd></React.Fragment>)}</dl>}
              </div>
            )}
            {tab === 'timeline' && <Timeline items={tl} />}
            {tab === 'tasks' && <TasksPanel refs={refs} match={t => t.refs.leadId === l.id} />}
            {tab === 'deals' && (deals.length ? <DealsPanel deals={deals} refs={{ personId: l.converted?.personId, companyId: l.companyId }} /> : <Empty compact title="Sem oportunidades" text="Converta o lead para abrir uma oportunidade no pipeline." action={!closed && <Button variant="primary" onClick={() => setConvert(true)}><ArrowRightLeft />Converter em oportunidade</Button>} />)}
            {tab === 'notes' && <NotesPanel refs={refs} match={a => a.refs.leadId === l.id} />}
            {tab === 'changes' && <ChangeLog entityId={l.id} />}
          </div>
          <div className="stack">
            <div className="card stack-sm">
              <div className="row between"><span className="label">Pontuação</span><strong className="num">{l.score}/100</strong></div>
              <Progress value={l.score} tone={l.score > 70 ? 'ok' : l.score < 35 ? 'warn' : undefined} />
              <span className="xs muted">{l.score > 70 ? 'Alta propensão — priorize o contato.' : l.score < 35 ? 'Baixo engajamento — nutrir antes de abordar.' : 'Engajamento moderado.'}</span>
            </div>
            <div className="card stack-sm">
              <span className="label">Relacionamentos</span>
              {l.companyId ? <Link to={`/companies/${l.companyId}`} className="list-item click"><span className="icon-bubble"><Building2 /></span><span className="small">{L.companies.get(l.companyId)?.tradeName}</span></Link> : <span className="small muted">Não vinculado a empresa existente.</span>}
              {(l.personId || l.converted?.personId) && <Link to={`/people/${l.personId ?? l.converted?.personId}`} className="list-item click"><span className="icon-bubble"><User /></span><span className="small">{L.people.get(l.personId ?? l.converted?.personId ?? '')?.name}</span></Link>}
            </div>
            <div className="card stack-sm"><span className="label">Tags</span><div className="tags">{l.tags.length ? l.tags.map(t => <TagChip key={t} name={t} color={L.tagColor(t)} onRemove={can('edit') ? () => leadSvc.update(l.id, { tags: l.tags.filter(x => x !== t) }) : undefined} />) : <span className="small muted">Sem tags</span>}</div></div>
            <div className="card stack-sm"><span className="label">Sem contato há</span><strong className="num" style={{ fontSize: 24 }}>{daysBetween(l.lastContactAt ?? l.createdAt)} dias</strong></div>
          </div>
        </div>
      </div>
      {edit && <LeadForm open onClose={() => setEdit(false)} lead={l} />}
      {convert && <ConvertLeadModal open onClose={() => setConvert(false)} lead={l} />}
    </div>
  );
}
