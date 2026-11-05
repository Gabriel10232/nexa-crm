import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Archive, ArchiveRestore, Trash2, MoreHorizontal, UserPlus, UserMinus, Link2, Phone, MessageCircle, Globe } from 'lucide-react';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { companies as companySvc, people as peopleSvc } from '../../services/crm';
import { PageHeader, Timeline, timelineFor, UserChip, Money, useLookups } from '../../components/common';
import { QuickActions, TasksPanel, DealsPanel, ChangeLog, NotesPanel, FilesPanel } from '../../components/detail';
import { Avatar, Badge, Button, Empty, Menu, Modal, Select, Tabs, TagChip, Field } from '../../components/ui';
import { CompanyForm, PersonForm, LogActivityModal } from '../../components/forms';
import { CONTACT_TYPES, LIFECYCLE, PROPOSAL_STATUS } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { fmtDate, fmtDateTime, money, num } from '../../lib/utils';
import { proposalTotals } from '../../services/crm';

export default function CompanyDetail() {
  const { id } = useParams(); const d = useTenant(); const nav = useNavigate(); const { can } = useSession(); const L = useLookups();
  const c = d.companies.find(x => x.id === id);
  const [tab, setTab] = useState<'timeline' | 'people' | 'deals' | 'tasks' | 'meetings' | 'proposals' | 'files' | 'notes' | 'data' | 'changes'>('timeline');
  const [edit, setEdit] = useState(false);
  const [newPerson, setNewPerson] = useState(false);
  const [linkPerson, setLinkPerson] = useState(false);
  const [contactWith, setContactWith] = useState<string[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  if (!c) return <div className="card"><Empty title="Empresa não encontrada" action={<Button onClick={() => nav('/companies')}>Voltar</Button>} /></div>;
  const refs = { companyId: c.id };
  const people = d.people.filter(p => p.companyId === c.id && !p.archivedAt);
  const former = d.people.filter(p => p.companyId !== c.id && p.companyHistory.some(h => h.companyId === c.id));
  const tl = timelineFor(d, { companyId: c.id });
  const deals = d.deals.filter(x => x.companyId === c.id);
  const meetings = d.events.filter(e => e.refs.companyId === c.id).sort((a, b) => b.start.localeCompare(a.start));
  const proposals = d.proposals.filter(p => p.companyId === c.id);
  const files = deals.flatMap(x => x.files);

  const archive = async () => {
    if (!(await confirm({ title: `Arquivar ${c.tradeName}?`, body: <>{people.length} pessoa(s) vinculada(s), {deals.length} oportunidade(s), {tl.length} interação(ões). Nada é apagado; restaure em Arquivados.</>, danger: true, confirmLabel: 'Arquivar' }))) return;
    companySvc.archive(c.id); toast('success', 'Empresa arquivada', undefined, { label: 'Desfazer', run: () => companySvc.archive(c.id, false) }); nav('/companies');
  };
  const hardDelete = async () => {
    if (!can('hardDelete')) { toast('error', 'Sem permissão', 'Exclusão definitiva restrita a Proprietário/Administrador.'); return; }
    if (!(await confirm({ title: 'Excluir empresa definitivamente?', body: `As ${people.length} pessoas serão desvinculadas (mantidas como pessoas físicas). Ação irreversível.`, typeToConfirm: c.tradeName, danger: true, confirmLabel: 'Excluir para sempre' }))) return;
    companySvc.hardDelete(c.id); toast('success', 'Empresa excluída'); nav('/companies');
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Empresas', to: '/companies' }, { label: c.tradeName }]}
        title={<span className="detail-head"><Avatar name={c.tradeName} size="lg" square /><span className="grow"><span style={{ display: 'block' }}>{c.tradeName}</span>
          <span className="row wrap" style={{ gap: 6, marginTop: 6, fontSize: 13, fontWeight: 500 }}>
            <Badge tone={LIFECYCLE[c.category].tone}>{LIFECYCLE[c.category].label}</Badge><Badge>{c.segment}</Badge><Badge>{c.size}</Badge>
            <Badge tone={c.status === 'ativo' ? 'success' : c.status === 'inativo' ? 'neutral' : 'warning'}>{c.status === 'em_negociacao' ? 'Em negociação' : c.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge>
            {c.archivedAt && <Badge tone="warning">Arquivada</Badge>}
            <span className="muted small row" style={{ gap: 6 }}>Responsável: <UserChip id={c.ownerId} /></span>
          </span></span></span>}
        actions={<>
          {c.archivedAt && <Button onClick={() => { companySvc.archive(c.id, false); toast('success', 'Restaurada'); }}><ArchiveRestore />Restaurar</Button>}
          {can('edit') && <Button onClick={() => setEdit(true)}><Pencil />Editar</Button>}
          <Menu trigger={t => <Button {...t} icon aria-label="Mais ações"><MoreHorizontal /></Button>}>
            {!c.archivedAt && can('edit') && <button onClick={archive}><Archive />Arquivar</button>}
            <button className="danger" onClick={hardDelete}><Trash2 />Excluir definitivamente</button>
          </Menu>
        </>} />
      <div className="stack">
        {!c.archivedAt && <QuickActions refs={refs} phone={c.phone} whatsapp={c.whatsapp} email={c.email} />}
        <div className="grid g4">
          <div className="card"><div className="kpi"><span className="label">Pessoas</span><span className="value">{people.length}</span></div></div>
          <div className="card"><div className="kpi"><span className="label">Em negociação</span><span className="value"><Money v={deals.filter(x => x.status === 'open').reduce((a, x) => a + x.value, 0)} compact /></span></div></div>
          <div className="card"><div className="kpi"><span className="label">Receita ganha</span><span className="value"><Money v={deals.filter(x => x.status === 'won').reduce((a, x) => a + x.value, 0)} compact /></span></div></div>
          <div className="card"><div className="kpi"><span className="label">Interações</span><span className="value">{tl.length}</span></div></div>
        </div>
        <div className="card">
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'timeline', label: 'Timeline', count: tl.length }, { value: 'people', label: 'Pessoas', count: people.length }, { value: 'deals', label: 'Oportunidades', count: deals.length },
            { value: 'tasks', label: 'Tarefas' }, { value: 'meetings', label: 'Reuniões', count: meetings.length }, { value: 'proposals', label: 'Propostas', count: proposals.length },
            { value: 'files', label: 'Arquivos', count: files.length }, { value: 'notes', label: 'Notas' }, { value: 'data', label: 'Dados cadastrais' }, { value: 'changes', label: 'Alterações' },
          ]} />
          {tab === 'timeline' && <Timeline items={tl} />}
          {tab === 'people' && (
            <div className="stack-sm">
              <div className="row wrap">
                {can('create') && <Button size="sm" variant="primary" onClick={() => setNewPerson(true)}><UserPlus />Nova pessoa</Button>}
                {can('edit') && <Button size="sm" onClick={() => setLinkPerson(true)}><Link2 />Vincular existente</Button>}
                <span className="flex1" />
                {sel.length > 0 && <Button size="sm" onClick={() => setContactWith(sel)}><Phone />Registrar contato com {sel.length}</Button>}
                <Button size="sm" variant="ghost" onClick={() => setContactWith(people.map(p => p.id))} disabled={!people.length}>Contatar toda a empresa</Button>
              </div>
              {!people.length ? <Empty compact title="Nenhuma pessoa vinculada" text="Adicione decisores, compradores e influenciadores." /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th className="w-check"><input type="checkbox" aria-label="Selecionar todas" checked={sel.length === people.length} onChange={e => setSel(e.target.checked ? people.map(p => p.id) : [])} /></th><th>Pessoa</th><th>Tipo</th><th>Influência</th><th className="hide-sm">Contato</th><th /></tr></thead>
                  <tbody>{people.map(p => (
                    <tr key={p.id} className={sel.includes(p.id) ? 'selected' : ''}>
                      <td className="w-check"><input type="checkbox" aria-label={`Selecionar ${p.name}`} checked={sel.includes(p.id)} onChange={e => setSel(e.target.checked ? [...sel, p.id] : sel.filter(x => x !== p.id))} /></td>
                      <td><Link to={`/people/${p.id}`} className="cell-main"><Avatar name={p.name} /><div style={{ minWidth: 0 }}><div className="t">{p.name}{p.decisionMaker && <Badge tone="success">Decisor</Badge>}</div><div className="s">{p.jobTitle} · {p.department}</div></div></Link></td>
                      <td className="small">{p.contactType ? CONTACT_TYPES[p.contactType] : '—'}</td>
                      <td className="small" aria-label={`Influência ${p.influence} de 5`}>{'●'.repeat(p.influence ?? 0)}<span className="muted">{'●'.repeat(5 - (p.influence ?? 0))}</span></td>
                      <td className="small hide-sm">{p.email}<br /><span className="muted">{p.phone}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button size="xs" variant="ghost" icon onClick={() => setContactWith([p.id])} aria-label={`Registrar contato com ${p.name}`} title="Registrar contato"><MessageCircle /></Button>
                        {can('edit') && <Button size="xs" variant="ghost" icon aria-label={`Remover ${p.name} da empresa`} title="Remover da empresa" onClick={async () => { if (await confirm({ title: `Remover ${p.name} de ${c.tradeName}?`, body: 'A pessoa passa a ser independente. O histórico individual é preservado.', confirmLabel: 'Remover vínculo' })) { peopleSvc.transfer(p.id, undefined); toast('success', 'Vínculo removido'); } }}><UserMinus /></Button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
              {former.length > 0 && <div className="xs muted">Ex-colaboradores: {former.map(p => <Link key={p.id} to={`/people/${p.id}`} style={{ textDecoration: 'underline', marginRight: 8 }}>{p.name}</Link>)}</div>}
            </div>
          )}
          {tab === 'deals' && <DealsPanel deals={deals} refs={refs} />}
          {tab === 'tasks' && <TasksPanel refs={refs} match={t => t.refs.companyId === c.id} />}
          {tab === 'meetings' && (meetings.length ? <div className="list">{meetings.map(e => <div key={e.id} className="list-item"><span className="flex1 small"><strong>{e.title}</strong><br /><span className="xs muted">{fmtDateTime(e.start)}{e.refs.personId ? ` · com ${L.people.get(e.refs.personId)?.name}` : ''}</span></span><Badge tone={e.done ? 'neutral' : 'accent'}>{e.done ? 'Realizada' : 'Agendada'}</Badge></div>)}</div> : <Empty compact title="Sem reuniões" />)}
          {tab === 'proposals' && (proposals.length ? <div className="list">{proposals.map(p => <Link key={p.id} to={`/proposals/${p.id}`} className="list-item click"><span className="flex1 small"><strong>{p.number}</strong> · {p.title}</span><Badge tone={PROPOSAL_STATUS[p.status].tone}>{PROPOSAL_STATUS[p.status].label}</Badge><strong className="small"><Money v={proposalTotals(p).total} /></strong></Link>)}</div> : <Empty compact title="Sem propostas" />)}
          {tab === 'files' && <FilesPanel files={files} />}
          {tab === 'notes' && <NotesPanel refs={refs} match={a => a.refs.companyId === c.id && !a.refs.personId} />}
          {tab === 'data' && (
            <div className="grid g2">
              <dl className="kv"><dt>Razão social</dt><dd>{c.legalName}</dd><dt>CNPJ</dt><dd>{c.cnpj ?? '—'}</dd><dt>Segmento</dt><dd>{c.segment}</dd><dt>Porte</dt><dd>{c.size}</dd><dt>Funcionários</dt><dd>{c.employees ? num(c.employees) : '—'}</dd><dt>Faturamento</dt><dd>{c.revenue ? <Money v={c.revenue} compact /> : '—'}</dd><dt>Origem</dt><dd>{c.source ?? '—'}</dd></dl>
              <dl className="kv"><dt>Site</dt><dd>{c.website ? <span className="row" style={{ gap: 4 }}><Globe size={13} />{c.website}</span> : '—'}</dd><dt>E-mail</dt><dd>{c.email ?? '—'}</dd><dt>Telefone</dt><dd>{c.phone ?? '—'}</dd><dt>WhatsApp</dt><dd>{c.whatsapp ?? '—'}</dd><dt>Endereço</dt><dd>{[c.address, c.city && `${c.city}/${c.state}`, c.cep].filter(Boolean).join(' · ') || '—'}</dd><dt>Criada em</dt><dd>{fmtDate(c.createdAt)}</dd></dl>
              <div style={{ gridColumn: '1/-1' }} className="stack-sm"><span className="label">Tags</span><div className="tags">{c.tags.length ? c.tags.map(t => <TagChip key={t} name={t} color={L.tagColor(t)} />) : <span className="muted small">Sem tags</span>}</div>{c.notes && <><span className="label">Observações</span><p>{c.notes}</p></>}</div>
            </div>
          )}
          {tab === 'changes' && <ChangeLog entityId={c.id} />}
        </div>
      </div>
      {edit && <CompanyForm open onClose={() => setEdit(false)} company={c} />}
      {newPerson && <PersonForm open onClose={() => setNewPerson(false)} linked companyId={c.id} />}
      {linkPerson && <LinkExisting companyId={c.id} onClose={() => setLinkPerson(false)} />}
      {contactWith && contactWith.length > 0 && <LogActivityModal open onClose={() => setContactWith(null)} refs={{ companyId: c.id, personId: contactWith.length === 1 ? contactWith[0] : undefined }} people={contactWith} />}
    </div>
  );
}

function LinkExisting({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const d = useTenant(); const [pid, setPid] = useState('');
  const options = d.people.filter(p => p.companyId !== companyId && !p.archivedAt);
  const sel = d.people.find(p => p.id === pid);
  return (
    <Modal open onClose={onClose} title="Vincular pessoa existente" description="Se a pessoa já trabalha em outra empresa, ela será transferida e o histórico preservado."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!pid} onClick={() => { peopleSvc.transfer(pid, companyId); toast('success', 'Pessoa vinculada'); onClose(); }}>Vincular</Button></>}>
      <Field label="Pessoa" hint={sel?.companyId ? `Atualmente em ${d.companies.find(c => c.id === sel.companyId)?.tradeName} — será transferida.` : undefined}>
        <Select value={pid} onChange={e => setPid(e.target.value)} placeholder="Selecione…" options={options.map(p => ({ value: p.id, label: `${p.name}${p.companyId ? ` (${d.companies.find(c => c.id === p.companyId)?.tradeName})` : ' (pessoa física)'}` }))} />
      </Field>
    </Modal>
  );
}
