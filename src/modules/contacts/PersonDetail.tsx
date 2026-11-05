import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Archive, ArchiveRestore, Trash2, MoreHorizontal, ArrowRightLeft, Building2, History, Link2 as Linkedin } from 'lucide-react';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { people as peopleSvc } from '../../services/crm';
import { PageHeader, Timeline, timelineFor, UserChip, Money, useLookups } from '../../components/common';
import { QuickActions, TasksPanel, DealsPanel, ChangeLog, NotesPanel } from '../../components/detail';
import { Avatar, Badge, Button, Empty, Menu, Modal, Select, Tabs, TagChip, Notice, Field } from '../../components/ui';
import { PersonForm } from '../../components/forms';
import { CONTACT_TYPES, LIFECYCLE } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { fmtDate, fmtDateTime } from '../../lib/utils';

export default function PersonDetail() {
  const { id } = useParams(); const d = useTenant(); const nav = useNavigate(); const { can } = useSession(); const L = useLookups();
  const p = d.people.find(x => x.id === id);
  const [tab, setTab] = useState<'timeline' | 'data' | 'tasks' | 'deals' | 'meetings' | 'notes' | 'changes'>('timeline');
  const [edit, setEdit] = useState(false);
  const [transfer, setTransfer] = useState(false);
  if (!p) return <div className="card"><Empty title="Pessoa não encontrada" action={<Button onClick={() => nav('/people')}>Voltar</Button>} /></div>;
  const co = p.companyId ? L.companies.get(p.companyId) : undefined;
  const refs = { personId: p.id, companyId: p.companyId };
  const tl = timelineFor(d, { personId: p.id });
  const deals = d.deals.filter(x => x.personId === p.id);
  const meetings = d.events.filter(e => e.refs.personId === p.id).sort((a, b) => b.start.localeCompare(a.start));

  const archive = async () => {
    if (!(await confirm({ title: `Arquivar ${p.name}?`, body: <>Empresa: {co?.tradeName ?? 'nenhuma'} · {deals.length} oportunidade(s) · {tl.length} atividade(s).<br />O registro poderá ser restaurado em Arquivados.</>, danger: true, confirmLabel: 'Arquivar' }))) return;
    peopleSvc.archive(p.id); toast('success', 'Pessoa arquivada', undefined, { label: 'Desfazer', run: () => peopleSvc.archive(p.id, false) }); nav('/people');
  };
  const hardDelete = async () => {
    if (!can('hardDelete')) { toast('error', 'Sem permissão', 'Exclusão definitiva restrita a Proprietário/Administrador.'); return; }
    if (!(await confirm({ title: 'Excluir definitivamente?', body: `${deals.length} oportunidade(s) e ${tl.length} atividade(s) perderão o vínculo. Ação irreversível.`, typeToConfirm: p.name, danger: true, confirmLabel: 'Excluir para sempre' }))) return;
    peopleSvc.hardDelete(p.id); toast('success', 'Excluído definitivamente'); nav('/people');
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Contatos', to: '/people' }, ...(co ? [{ label: co.tradeName, to: `/companies/${co.id}` }] : []), { label: p.name }]}
        title={<span className="detail-head"><Avatar name={p.name} size="lg" /><span className="grow"><span style={{ display: 'block' }}>{p.name}</span>
          <span className="row wrap" style={{ gap: 6, marginTop: 6, fontSize: 13, fontWeight: 500 }}>
            <Badge tone={LIFECYCLE[p.lifecycle].tone}>{LIFECYCLE[p.lifecycle].label}</Badge>
            {co ? <Badge tone="accent">{p.jobTitle ?? 'Contato'} · {co.tradeName}</Badge> : <Badge>Pessoa física independente</Badge>}
            {p.decisionMaker && <Badge tone="success">Poder de decisão</Badge>}
            {p.archivedAt && <Badge tone="warning">Arquivado</Badge>}
            <span className="muted small row" style={{ gap: 6 }}>Responsável: <UserChip id={p.ownerId} /></span>
          </span></span></span>}
        actions={<>
          {p.archivedAt && <Button onClick={() => { peopleSvc.archive(p.id, false); toast('success', 'Restaurado'); }}><ArchiveRestore />Restaurar</Button>}
          {can('edit') && <Button onClick={() => setTransfer(true)}><ArrowRightLeft />{co ? 'Transferir' : 'Vincular a empresa'}</Button>}
          {can('edit') && <Button onClick={() => setEdit(true)}><Pencil />Editar</Button>}
          <Menu trigger={t => <Button {...t} icon aria-label="Mais ações"><MoreHorizontal /></Button>}>
            {!p.archivedAt && can('edit') && <button onClick={archive}><Archive />Arquivar</button>}
            <button className="danger" onClick={hardDelete}><Trash2 />Excluir definitivamente</button>
          </Menu>
        </>} />
      <div className="stack">
        {!p.archivedAt && <QuickActions refs={refs} phone={p.phone} whatsapp={p.whatsapp} email={p.email} />}
        <div className="split">
          <div className="card">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'timeline', label: 'Timeline', count: tl.length }, { value: 'data', label: 'Dados' }, { value: 'tasks', label: 'Tarefas' }, { value: 'deals', label: 'Oportunidades', count: deals.length }, { value: 'meetings', label: 'Reuniões', count: meetings.length }, { value: 'notes', label: 'Notas' }, { value: 'changes', label: 'Alterações' }]} />
            {tab === 'timeline' && <><Notice>Timeline individual: inclui interações feitas com {p.name.split(' ')[0]} em qualquer empresa{p.companyHistory.length > 1 ? ' (histórico preservado após transferências)' : ''}.</Notice><div style={{ height: 10 }} /><Timeline items={tl} /></>}
            {tab === 'data' && (
              <div className="grid g2">
                <dl className="kv">
                  <dt>E-mail</dt><dd>{p.email ?? '—'}</dd>{p.personalEmail && <><dt>E-mail pessoal</dt><dd>{p.personalEmail}</dd></>}
                  <dt>Telefone</dt><dd>{p.phone ?? '—'}</dd><dt>WhatsApp</dt><dd>{p.whatsapp ?? '—'}</dd>
                  {p.linkedin && <><dt>LinkedIn</dt><dd className="row" style={{ gap: 4 }}><Linkedin size={14} />{p.linkedin}</dd></>}
                  <dt>Preferência</dt><dd>{p.preference ?? '—'}</dd>
                  {p.cpf && <><dt>CPF</dt><dd>{p.cpf}</dd></>}{p.birthDate && <><dt>Nascimento</dt><dd>{fmtDate(p.birthDate)}</dd></>}
                  <dt>Endereço</dt><dd>{[p.address, p.city && `${p.city}/${p.state}`, p.cep].filter(Boolean).join(' · ') || '—'}</dd>
                </dl>
                <dl className="kv">
                  {co && <><dt>Empresa</dt><dd><Link to={`/companies/${co.id}`} style={{ textDecoration: 'underline' }}>{co.tradeName}</Link></dd><dt>Cargo</dt><dd>{p.jobTitle ?? '—'}</dd><dt>Departamento</dt><dd>{p.department ?? '—'}</dd>
                    <dt>Tipo de contato</dt><dd>{p.contactType ? CONTACT_TYPES[p.contactType] : '—'}</dd><dt>Influência</dt><dd>{'●'.repeat(p.influence ?? 0)}{'○'.repeat(5 - (p.influence ?? 0))}</dd><dt>Relacionamento</dt><dd>{p.relationship ?? '—'}</dd></>}
                  <dt>Origem</dt><dd>{p.source ?? '—'}</dd>{p.product && <><dt>Interesse</dt><dd>{p.product}</dd></>}
                  {p.value ? <><dt>Valor estimado</dt><dd><Money v={p.value} /></dd></> : null}
                  <dt>Próximo contato</dt><dd>{fmtDate(p.nextContactAt)}</dd><dt>Criado em</dt><dd>{fmtDate(p.createdAt)}</dd>
                </dl>
                {p.notes && <div style={{ gridColumn: '1/-1' }}><div className="label">Observações</div><p>{p.notes}</p></div>}
              </div>
            )}
            {tab === 'tasks' && <TasksPanel refs={refs} match={t => t.refs.personId === p.id} />}
            {tab === 'deals' && <DealsPanel deals={deals} refs={refs} />}
            {tab === 'meetings' && (meetings.length ? <div className="list">{meetings.map(e => <div key={e.id} className="list-item"><span className="flex1 small"><strong>{e.title}</strong><br /><span className="xs muted">{fmtDateTime(e.start)}</span></span><Badge tone={e.done ? 'neutral' : 'accent'}>{e.done ? 'Realizada' : 'Agendada'}</Badge></div>)}</div> : <Empty compact title="Sem reuniões" />)}
            {tab === 'notes' && <NotesPanel refs={refs} match={a => a.refs.personId === p.id} />}
            {tab === 'changes' && <ChangeLog entityId={p.id} />}
          </div>
          <div className="stack">
            <div className="card stack-sm">
              <span className="label"><History size={14} />Histórico de empresas</span>
              {p.companyHistory.length === 0 ? <span className="small muted">Pessoa física, sem vínculos.</span> :
                p.companyHistory.slice().reverse().map((h, i) => (
                  <Link key={i} to={`/companies/${h.companyId}`} className="list-item click"><span className="icon-bubble"><Building2 /></span><span className="flex1 small"><strong>{L.companies.get(h.companyId)?.tradeName ?? 'Empresa removida'}</strong><br /><span className="xs muted">{fmtDate(h.from)} → {h.to ? fmtDate(h.to) : 'atual'}</span></span>{!h.to && <Badge tone="success">Atual</Badge>}</Link>
                ))}
            </div>
            <div className="card stack-sm"><span className="label">Tags</span><div className="tags">{p.tags.length ? p.tags.map(t => <TagChip key={t} name={t} color={L.tagColor(t)} onRemove={can('edit') ? () => peopleSvc.update(p.id, { tags: p.tags.filter(x => x !== t) }) : undefined} />) : <span className="small muted">Sem tags</span>}</div></div>
          </div>
        </div>
      </div>
      {edit && <PersonForm open onClose={() => setEdit(false)} person={p} />}
      {transfer && <TransferModal personId={p.id} onClose={() => setTransfer(false)} />}
    </div>
  );
}

function TransferModal({ personId, onClose }: { personId: string; onClose: () => void }) {
  const d = useTenant(); const p = d.people.find(x => x.id === personId)!;
  const [to, setTo] = useState('');
  return (
    <Modal open onClose={onClose} title={p.companyId ? `Transferir ${p.name}` : `Vincular ${p.name} a uma empresa`} description="O histórico individual é preservado e a mudança fica registrada nas timelines."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={to === (p.companyId ?? '')} onClick={() => { peopleSvc.transfer(p.id, to || undefined); toast('success', 'Vínculo atualizado', 'Histórico individual preservado.'); onClose(); }}>Confirmar</Button></>}>
      <Field label="Nova empresa"><Select value={to} onChange={e => setTo(e.target.value)} placeholder="— Nenhuma (tornar pessoa física independente) —" options={d.companies.filter(c => c.id !== p.companyId && !c.archivedAt).map(c => ({ value: c.id, label: c.tradeName }))} /></Field>
    </Modal>
  );
}
