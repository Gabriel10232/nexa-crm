import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Upload, FormInput, Shuffle, GitMerge, Target, Tag, UserCheck, Flag, Archive, CheckSquare, ChevronDown, Trash2 } from 'lucide-react';
import type { Lead } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { leads as leadSvc, tasks as taskSvc, findDuplicates } from '../../services/crm';
import { nextSeller } from '../../services/automation';
import { PageHeader, UserChip, Money, useLookups } from '../../components/common';
import { RecordList, FilterDef } from '../../components/RecordList';
import { Avatar, Badge, Button, Column, Empty, Menu, Modal, Field, Input, Select, Notice, Tabs, TagChip } from '../../components/ui';
import { LeadForm } from '../../components/forms';
import { LEAD_STATUS, TEMPERATURE, UF } from '../../config/labels';
import { prompt, toast, confirm } from '../../store/ui';
import { fmtDate, relTime, parseCSV, isEmail, normalize, daysBetween } from '../../lib/utils';
import { archiveLeads, statusOptions } from './actions';

export default function Leads() {
  const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'active' | 'open' | 'qualified' | 'converted' | 'lost'>('active');
  const [form, setForm] = useState<{ kind: 'individual' | 'business' } | null>(null);
  const [importing, setImporting] = useState(false);
  const [capture, setCapture] = useState(false);
  const [merging, setMerging] = useState(false);

  const base = useMemo(() => scoped(d, user, d.leads).filter(l => !l.archivedAt), [d, user]);
  const rows = base.filter(l => tab === 'active' ? true : tab === 'open' ? ['novo', 'em_contato', 'aguardando'].includes(l.status) : tab === 'qualified' ? ['qualificado', 'reuniao', 'proposta'].includes(l.status) : tab === 'converted' ? l.status === 'convertido' : ['perdido', 'desqualificado'].includes(l.status));
  const count = (fn: (l: Lead) => boolean) => base.filter(fn).length;

  const columns: Column<Lead>[] = [
    { key: 'name', label: 'Lead', hideable: false, sort: l => l.name, render: l => <div className="cell-main"><Avatar name={l.name} /><div style={{ minWidth: 0 }}><div className="t ellipsis">{l.name}</div><div className="s ellipsis">{l.kind === 'business' ? `${l.jobTitle ?? 'Contato'} · ${l.companyName ?? ''}` : 'Pessoa física'}</div></div></div> },
    { key: 'status', label: 'Status', sort: l => l.status, render: l => <Badge tone={LEAD_STATUS[l.status].tone} dot>{LEAD_STATUS[l.status].label}</Badge> },
    { key: 'temperature', label: 'Temp.', sort: l => ['frio', 'morno', 'quente'].indexOf(l.temperature), render: l => <Badge tone={TEMPERATURE[l.temperature].tone}>{TEMPERATURE[l.temperature].label}</Badge> },
    { key: 'value', label: 'Valor', align: 'right', sort: l => l.value, render: l => <Money v={l.value} /> },
    { key: 'score', label: 'Score', sort: l => l.score, render: l => <span className="num strong" style={{ color: l.score > 70 ? 'var(--success)' : l.score < 35 ? 'var(--text2)' : undefined }}>{l.score}</span> },
    { key: 'source', label: 'Origem', sort: l => l.source, render: l => <span className="small">{l.source}</span> },
    { key: 'owner', label: 'Responsável', sort: l => L.users.get(l.ownerId)?.name, render: l => <UserChip id={l.ownerId} /> },
    { key: 'lastContact', label: 'Último contato', sort: l => l.lastContactAt ?? '', render: l => <span className="small" style={{ color: daysBetween(l.lastContactAt ?? l.createdAt) > 7 ? 'var(--warning)' : undefined }}>{relTime(l.lastContactAt)}</span> },
    { key: 'next', label: 'Próximo contato', sort: l => l.nextContactAt ?? '', render: l => <span className="small" style={{ color: l.nextContactAt && new Date(l.nextContactAt) < new Date() ? 'var(--danger)' : undefined }}>{fmtDate(l.nextContactAt, { day: '2-digit', month: 'short' })}</span> },
    { key: 'city', label: 'Cidade', sort: l => l.city, render: l => <span className="small">{l.city ? `${l.city}/${l.state}` : '—'}</span> },
    { key: 'tags', label: 'Tags', render: l => <div className="tags">{l.tags.slice(0, 2).map(t => <TagChip key={t} name={t} color={L.tagColor(t)} />)}</div> },
    { key: 'created', label: 'Entrada', sort: l => l.createdAt, render: l => <span className="small muted">{fmtDate(l.createdAt, { day: '2-digit', month: 'short' })}</span> },
    { key: 'campaign', label: 'Campanha', sort: l => l.campaign, render: l => <span className="small">{l.campaign ?? '—'}</span> },
  ];

  const filters: FilterDef<Lead>[] = [
    { key: 'kind', label: 'Tipo de registro', kind: 'select', options: [{ value: 'individual', label: 'Pessoa física' }, { value: 'business', label: 'Empresa' }], get: l => l.kind },
    { key: 'status', label: 'Status', kind: 'select', options: statusOptions, get: l => l.status },
    { key: 'temperature', label: 'Temperatura', kind: 'select', options: Object.entries(TEMPERATURE).map(([k, x]) => ({ value: k, label: x.label })), get: l => l.temperature },
    { key: 'ownerId', label: 'Responsável', kind: 'select', options: d.users.map(u => ({ value: u.id, label: u.name })), get: l => l.ownerId },
    { key: 'source', label: 'Origem', kind: 'select', options: d.org.sources.map(s => ({ value: s, label: s })), get: l => l.source },
    { key: 'tag', label: 'Tag', kind: 'tag', options: d.tags.map(t => ({ value: t.name, label: t.name })), get: l => l.tags },
    { key: 'companyId', label: 'Empresa vinculada', kind: 'select', options: d.companies.map(c => ({ value: c.id, label: c.tradeName })), get: l => l.companyId },
    { key: 'state', label: 'Estado', kind: 'select', options: UF.map(u => ({ value: u, label: u })), get: l => l.state },
    { key: 'city', label: 'Cidade', kind: 'select', options: Array.from(new Set(d.leads.map(l => l.city).filter(Boolean))).map(c => ({ value: c!, label: c! })), get: l => l.city },
    { key: 'jobTitle', label: 'Cargo', kind: 'select', options: Array.from(new Set(d.leads.map(l => l.jobTitle).filter(Boolean))).map(c => ({ value: c!, label: c! })), get: l => l.jobTitle },
    { key: 'minValue', label: 'Valor mínimo', kind: 'min', get: l => l.value },
    { key: 'maxValue', label: 'Valor máximo', kind: 'max', get: l => l.value },
    { key: 'createdFrom', label: 'Criado a partir de', kind: 'dateFrom', get: l => l.createdAt },
    { key: 'createdTo', label: 'Criado até', kind: 'dateTo', get: l => l.createdAt },
    { key: 'lastFrom', label: 'Último contato desde', kind: 'dateFrom', get: l => l.lastContactAt },
    { key: 'nextTo', label: 'Próximo contato até', kind: 'dateTo', get: l => l.nextContactAt },
    { key: 'noContactDays', label: 'Sem contato há (dias)', kind: 'daysSince', get: l => l.lastContactAt ?? l.createdAt },
  ];

  const initialQuery = sp.get('status') ? { status: sp.get('status')! } : undefined;

  const bulk = (ids: string[], clear: () => void) => {
    if (!can('edit')) return <span className="xs muted">Seu perfil é somente leitura</span>;
    return <>
      <Menu trigger={p => <Button size="xs" {...p}><Flag />Status<ChevronDown /></Button>}>
        {statusOptions.map(s => <button key={s.value} onClick={() => { leadSvc.bulk(ids, { status: s.value as Lead['status'] }, `Status alterado para ${s.label}`); toast('success', `${ids.length} lead(s) → ${s.label}`); clear(); }}>{s.label}</button>)}
      </Menu>
      <Button size="xs" onClick={async () => { const t = await prompt({ title: 'Adicionar tag em massa', label: 'Tag', options: d.tags.map(t => t.name), required: true }); if (t) { leadSvc.bulk(ids, l => ({ tags: Array.from(new Set([...l.tags, t])) }), `Tag ${t} adicionada`); toast('success', `Tag "${t}" adicionada a ${ids.length} lead(s)`); clear(); } }}><Tag />Tag</Button>
      <Menu trigger={p => <Button size="xs" {...p}><UserCheck />Atribuir<ChevronDown /></Button>}>
        {d.users.filter(u => u.active).map(u => <button key={u.id} onClick={() => { leadSvc.bulk(ids, { ownerId: u.id, teamId: u.teamId }, `Transferido para ${u.name}`); toast('success', `${ids.length} lead(s) atribuído(s) a ${u.name}`); clear(); }}><Avatar name={u.name} color={u.color} size="sm" />{u.name}</button>)}
      </Menu>
      <Button size="xs" onClick={() => { distribute(ids); clear(); }}><Shuffle />Distribuir</Button>
      <Button size="xs" onClick={() => { ids.forEach(id => { const l = d.leads.find(x => x.id === id)!; taskSvc.save({ title: `Follow-up com ${l.name}`, type: 'followup', due: new Date(Date.now() + 864e5).toISOString(), ownerId: l.ownerId, refs: { leadId: id } }); }); toast('success', `${ids.length} tarefa(s) criada(s)`); clear(); }}><CheckSquare />Tarefas</Button>
      {can('delete') || can('edit') ? <Button size="xs" variant="danger" onClick={async () => { if (await archiveLeads(d, ids)) clear(); }}><Archive />Excluir</Button> : null}
      {can('hardDelete') && <Button size="xs" variant="danger" onClick={async () => { const n = `${ids.length} leads`; if (await confirm({ title: `Excluir definitivamente ${n}?`, body: 'Ação irreversível. Digite a confirmação abaixo.', typeToConfirm: n, danger: true, confirmLabel: 'Excluir para sempre' })) { leadSvc.hardDelete(ids); toast('success', `${n} excluídos definitivamente`); clear(); } }}><Trash2 /></Button>}
    </>;
  };

  const distribute = (ids?: string[]) => {
    const target = ids ?? base.filter(l => l.status === 'novo').map(l => l.id);
    if (!target.length) { toast('info', 'Nenhum lead novo para distribuir'); return; }
    const changed = leadSvc.distribute(target);
    toast('success', 'Distribuição concluída', `Regra: ${d.org.distribution === 'round_robin' ? 'rodízio por carga' : d.org.distribution}. ${changed} lead(s) reatribuído(s).`);
  };

  return (
    <div>
      <PageHeader title="Central de leads" desc="Capture, qualifique e converta. Clique em um lead para ver histórico, ações rápidas e conversão." crumbs={[{ label: 'Início', to: '/' }, { label: 'Leads' }]}
        actions={<>
          <Menu width={230} trigger={p => <Button {...p}>Mais ações<ChevronDown /></Button>}>
            <button onClick={() => setImporting(true)} disabled={!can('create')}><Upload />Importar CSV</button>
            <button onClick={() => setCapture(true)} disabled={!can('create')}><FormInput />Formulário de captura</button>
            <button onClick={() => distribute()} disabled={!can('edit')}><Shuffle />Distribuir leads novos</button>
            <button onClick={() => setMerging(true)} disabled={!can('edit')}><GitMerge />Mesclar duplicados</button>
          </Menu>
          {can('create') && <Menu trigger={p => <Button variant="primary" {...p}><Plus />Novo lead<ChevronDown /></Button>}>
            <button onClick={() => setForm({ kind: 'business' })}>Lead empresarial</button>
            <button onClick={() => setForm({ kind: 'individual' })}>Lead individual (pessoa física)</button>
          </Menu>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'active', label: 'Todos', count: base.length },
        { value: 'open', label: 'Em aberto', count: count(l => ['novo', 'em_contato', 'aguardando'].includes(l.status)) },
        { value: 'qualified', label: 'Qualificados', count: count(l => ['qualificado', 'reuniao', 'proposta'].includes(l.status)) },
        { value: 'converted', label: 'Convertidos', count: count(l => l.status === 'convertido') },
        { value: 'lost', label: 'Perdidos', count: count(l => ['perdido', 'desqualificado'].includes(l.status)) },
      ]} />
      <RecordList entity="leads" rows={rows} columns={columns} filters={filters} initialQuery={initialQuery}
        defaultCols={['name', 'status', 'temperature', 'value', 'score', 'source', 'owner', 'lastContact', 'next']}
        search={l => [l.name, l.companyName, l.email, l.phone, l.whatsapp, l.city, l.state, l.jobTitle, l.cpf, l.cnpj, l.source, l.campaign, l.product, l.notes, ...l.tags]}
        onOpen={l => nav(`/leads/${l.id}`)} bulk={bulk}
        exportRow={l => ({ nome: l.name, tipo: l.kind === 'business' ? 'Empresa' : 'Pessoa física', empresa: l.companyName, cargo: l.jobTitle, email: l.email, telefone: l.phone, whatsapp: l.whatsapp, cidade: l.city, uf: l.state, origem: l.source, campanha: l.campaign, produto: l.product, valor: can('financial') ? l.value : '', temperatura: l.temperature, status: LEAD_STATUS[l.status].label, responsavel: L.users.get(l.ownerId)?.name, tags: l.tags.join('|'), entrada: l.createdAt, score: l.score })}
        card={l => <>
          <div className="row"><Avatar name={l.name} /><div style={{ minWidth: 0 }}><div className="strong ellipsis">{l.name}</div><div className="xs muted ellipsis">{l.companyName ?? 'Pessoa física'}</div></div></div>
          <div className="row wrap" style={{ gap: 6 }}><Badge tone={LEAD_STATUS[l.status].tone} dot>{LEAD_STATUS[l.status].label}</Badge><Badge tone={TEMPERATURE[l.temperature].tone}>{TEMPERATURE[l.temperature].label}</Badge></div>
          <div className="row between small"><span className="muted">{l.source}</span><strong><Money v={l.value} /></strong></div>
          <div className="row between xs muted"><UserChip id={l.ownerId} /><span>Score {l.score}</span></div>
        </>}
        empty={<div className="card"><Empty icon={<Target size={22} />} title="Nenhum lead aqui ainda" text="Crie manualmente, importe uma planilha CSV ou receba leads de um formulário." action={<div className="row"><Button onClick={() => setImporting(true)}><Upload />Importar CSV</Button><Button variant="primary" onClick={() => setForm({ kind: 'business' })}><Plus />Criar lead</Button></div>} /></div>}
      />
      {form && <LeadForm open onClose={() => setForm(null)} kind={form.kind} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {capture && <CaptureFormModal onClose={() => setCapture(false)} />}
      {merging && <MergeModal onClose={() => setMerging(false)} />}
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const d = useTenant(); const { user } = useSession();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [err, setErr] = useState('');
  const [skipDup, setSkipDup] = useState(true);
  const [ownerMode, setOwnerMode] = useState<'me' | 'distribute'>('distribute');
  const sample = 'nome;empresa;email;telefone;cidade;uf;origem;valor\nCarla Mendes;Alfa Serviços;carla@alfa.example;(11) 90000-1111;São Paulo;SP;Site;12000\nJoão Pires;;joao@email.example;(41) 90000-2222;Curitiba;PR;Indicação;3000';
  const onFile = async (f?: File) => {
    if (!f) return; setErr('');
    if (!/\.csv$/i.test(f.name)) { setErr('Envie um arquivo .csv'); return; }
    const parsed = parseCSV(await f.text());
    if (!parsed.length) { setErr('Arquivo vazio ou sem cabeçalho.'); return; }
    if (!('nome' in parsed[0] || 'name' in parsed[0])) { setErr('A coluna "nome" é obrigatória no cabeçalho.'); return; }
    setRows(parsed);
  };
  const analysed = rows.map(r => {
    const name = r.nome || r.name || ''; const email = r.email || r['e-mail'] || '';
    const dup = findDuplicates(d, { name, email, phone: r.telefone }).length > 0;
    const invalid = !name.trim() ? 'Nome vazio' : !isEmail(email) ? 'E-mail inválido' : '';
    return { r, name, email, dup, invalid };
  });
  const run = () => {
    let n = 0; const created: string[] = [];
    analysed.forEach(a => {
      if (a.invalid || (skipDup && a.dup)) return;
      const owner = user;
      const { lead } = leadSvc.create({ kind: a.r.empresa ? 'business' : 'individual', name: a.name.trim(), companyName: a.r.empresa || undefined, email: a.email || undefined, phone: a.r.telefone || undefined, city: a.r.cidade || undefined, state: (a.r.uf || '').toUpperCase() || undefined, source: a.r.origem || 'Importação', value: Number(a.r.valor) || 0, temperature: 'morno', ownerId: owner.id, teamId: owner.teamId, status: 'novo', tags: ['Importado'] });
      created.push(lead.id); n++;
    });
    if (ownerMode === 'distribute') leadSvc.distribute(created);
    else leadSvc.bulk(created, { ownerId: user.id, teamId: user.teamId }, 'Atribuído na importação');
    toast('success', `${n} lead(s) importado(s)`, `${analysed.length - n} ignorado(s) por duplicidade ou erro.`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Importar leads por CSV" description="Separador ; ou , — colunas: nome (obrigatória), empresa, email, telefone, cidade, uf, origem, valor."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!rows.length} onClick={run}><Upload />Importar {analysed.filter(a => !a.invalid && !(skipDup && a.dup)).length}</Button></>}>
      <div className="stack">
        <div className="row wrap">
          <label className="btn primary"><Upload />Selecionar arquivo<input type="file" accept=".csv,text/csv" hidden onChange={e => onFile(e.target.files?.[0])} /></label>
          <Button variant="ghost" onClick={() => { setRows(parseCSV(sample)); setErr(''); }}>Usar arquivo de exemplo</Button>
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
        {rows.length > 0 && <>
          <div className="row wrap" style={{ gap: 18 }}>
            <label className="check"><input type="checkbox" checked={skipDup} onChange={e => setSkipDup(e.target.checked)} />Ignorar possíveis duplicados</label>
            <Select value={ownerMode} onChange={e => setOwnerMode(e.target.value as 'me')} options={[{ value: 'distribute', label: 'Distribuir automaticamente' }, { value: 'me', label: 'Atribuir a mim' }]} style={{ width: 240 }} aria-label="Responsável" />
          </div>
          <div className="table-wrap card" style={{ padding: 0, maxHeight: 300 }}>
            <table className="table"><thead><tr><th>Nome</th><th>Empresa</th><th>E-mail</th><th>Situação</th></tr></thead>
              <tbody>{analysed.map((a, i) => <tr key={i}><td>{a.name || '—'}</td><td>{a.r.empresa || '—'}</td><td className="small">{a.email || '—'}</td><td>{a.invalid ? <Badge tone="danger">{a.invalid}</Badge> : a.dup ? <Badge tone="warning">Possível duplicado</Badge> : <Badge tone="success">OK</Badge>}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </div>
    </Modal>
  );
}

function CaptureFormModal({ onClose }: { onClose: () => void }) {
  const d = useTenant();
  const [v, setV] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [err, setErr] = useState('');
  const submit = () => {
    if (!v.name.trim() || !v.email.trim()) { setErr('Nome e e-mail são obrigatórios.'); return; }
    if (!isEmail(v.email)) { setErr('E-mail inválido.'); return; }
    const owner = nextSeller(d) ?? d.users[0];
    const { runs } = leadSvc.create({ kind: v.company ? 'business' : 'individual', name: v.name.trim(), email: v.email, phone: v.phone || undefined, companyName: v.company || undefined, source: 'Site', campaign: 'Formulário do site', value: 0, temperature: 'morno', ownerId: owner.id, teamId: owner.teamId, status: 'novo', tags: [], notes: v.message || undefined });
    toast('success', 'Lead recebido pelo formulário', runs.length ? `${runs.length} automação(ões) executada(s).` : undefined);
    setV({ name: '', email: '', phone: '', company: '', message: '' });
  };
  const embed = `<iframe src="https://forms.nexacrm.example/f/${normalize(d.org.name).replace(/\s+/g, '-')}" width="100%" height="520"></iframe>`;
  return (
    <Modal open onClose={onClose} size="lg" title="Formulário de captura" description="Pré-visualização funcional: envie para criar um lead real no CRM. A hospedagem pública do formulário requer integração (não conectada).">
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="card stack-sm" style={{ background: 'rgb(var(--bg-rgb)/.35)' }}>
          <strong>Fale com um especialista</strong>
          <Field label="Nome" required><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="E-mail" required><Input type="email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="Telefone"><Input value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label="Empresa"><Input value={v.company} onChange={e => setV({ ...v, company: e.target.value })} /></Field>
          <Field label="Mensagem"><Input value={v.message} onChange={e => setV({ ...v, message: e.target.value })} /></Field>
          {err && <Notice tone="danger">{err}</Notice>}
          <Button variant="primary" onClick={submit}>Enviar</Button>
        </div>
        <div className="stack-sm">
          <div className="label">Código de incorporação (exemplo)</div>
          <pre className="card xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: 12 }}>{embed}</pre>
          <Notice tone="warning">Domínio de exemplo — publicação real do formulário depende da API pública (não conectada).</Notice>
        </div>
      </div>
    </Modal>
  );
}

function MergeModal({ onClose }: { onClose: () => void }) {
  const d = useTenant();
  const pairs = useMemo(() => {
    const out: { a: Lead; b: Lead; reason: string }[] = []; const seen = new Set<string>();
    d.leads.filter(l => !l.archivedAt).forEach(a => {
      findDuplicates(d, { name: a.name, email: a.email, phone: a.phone, cpf: a.cpf }, a.id).filter(h => h.kind === 'lead').forEach(h => {
        const key = [a.id, h.id].sort().join('|'); if (seen.has(key) || d.dismissedDuplicates.includes(key)) return; seen.add(key);
        out.push({ a, b: d.leads.find(l => l.id === h.id)!, reason: h.reason });
      });
    });
    return out;
  }, [d]);
  return (
    <Modal open onClose={onClose} size="lg" title="Mesclar leads duplicados" description="Detecção por CPF, CNPJ, e-mail, telefone e nome. A mesclagem preserva histórico, tags e notas.">
      {pairs.length === 0 ? <Empty compact title="Nenhum duplicado encontrado" text="Sua base de leads está limpa." /> : (
        <div className="list">{pairs.map(p => (
          <div key={p.a.id + p.b.id} className="list-item" style={{ flexWrap: 'wrap' }}>
            <div className="flex1"><strong>{p.a.name}</strong> <span className="muted">↔</span> <strong>{p.b.name}</strong><div className="xs muted">Coincidência: {p.reason} · {p.a.companyName ?? '—'} / {p.b.companyName ?? '—'}</div></div>
            <Button size="xs" onClick={() => { leadSvc.merge(p.a.id, p.b.id); toast('success', 'Leads mesclados', `${p.b.name} → ${p.a.name}`); }}><GitMerge />Mesclar</Button>
            <Button size="xs" variant="ghost" onClick={() => { import('../../services/crm').then(m => m.settings.patch(t => { t.dismissedDuplicates = [...t.dismissedDuplicates, [p.a.id, p.b.id].sort().join('|')]; })); toast('info', 'Mantidos os dois registros'); }}>Manter ambos</Button>
          </div>
        ))}</div>
      )}
    </Modal>
  );
}
