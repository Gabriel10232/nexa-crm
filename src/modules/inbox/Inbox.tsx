import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Send, StickyNote, Paperclip, Zap, ArrowLeft, Plus, Bell, Smile, Frown, Meh, MessagesSquare } from 'lucide-react';
import type { Channel, Conversation } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { inbox } from '../../services/crm';
import { sentiment } from '../../services/copilot';
import { PageHeader, UserChip, TagInput } from '../../components/common';
import { Avatar, Badge, Button, Empty, Field, Icon, Input, Menu, Modal, Select, SimBadge, Notice, Textarea } from '../../components/ui';
import { CHANNELS } from '../../config/labels';
import { toast } from '../../store/ui';
import { cx, fmtDateTime, normalize, relTime, toInputDateTime } from '../../lib/utils';

const QUICK = ['Olá! Obrigado pelo contato, já vou verificar.', 'Pode me passar mais detalhes, por favor?', 'Perfeito, vou encaminhar ao time responsável.', 'Posso agendar uma conversa rápida para alinharmos?'];
const TEMPLATES = [
  { name: 'Envio de proposta', body: 'Olá {nome}! Segue a proposta conforme conversamos. Fico à disposição para dúvidas.' },
  { name: 'Confirmação de reunião', body: 'Olá {nome}, confirmando nossa reunião. Qualquer imprevisto, me avise por aqui.' },
  { name: 'Pós-venda', body: 'Olá {nome}! Como está sendo a experiência até aqui? Sua opinião é muito importante.' },
];

export default function InboxPage() {
  const d = useTenant(); const { user, can } = useSession(); const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | Conversation['status']>('');
  const [channel, setChannel] = useState<'' | Channel>('');
  const [mine, setMine] = useState(false);
  const [newConv, setNewConv] = useState(false);
  const activeId = sp.get('c');
  const list = useMemo(() => d.conversations.filter(c => (!status || c.status === status) && (!channel || c.channel === channel) && (!mine || c.assigneeId === user.id) &&
    (!q || normalize(c.subject + ' ' + (d.people.find(p => p.id === c.personId)?.name ?? '') + ' ' + c.messages.map(m => m.body).join(' ')).includes(normalize(q))))
    .sort((a, b) => (b.messages[b.messages.length - 1]?.at ?? '').localeCompare(a.messages[a.messages.length - 1]?.at ?? '')), [d, status, channel, mine, q, user.id]);
  const active = d.conversations.find(c => c.id === activeId);
  useEffect(() => { if (active?.unread) inbox.update(active.id, { unread: 0 }); }, [active?.id]); // eslint-disable-line

  return (
    <div>
      <PageHeader title="Inbox" desc={<span className="row wrap" style={{ gap: 8 }}>Conversas de todos os canais vinculadas ao contato. <SimBadge>Canais não conectados · envio simulado</SimBadge></span>} crumbs={[{ label: 'Início', to: '/' }, { label: 'Inbox' }]}
        actions={can('create') && <Button variant="primary" onClick={() => setNewConv(true)}><Plus />Nova conversa</Button>} />
      <div className={cx('inbox', active && 'has-active')}>
        <div className="card conv-pane" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--line)' }} className="stack-sm">
            <div className="input-icon"><Search /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar mensagens…" aria-label="Buscar mensagens" /></div>
            <div className="row" style={{ gap: 6 }}>
              <Select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as '')} placeholder="Todos status" options={[{ value: 'aberta', label: 'Abertas' }, { value: 'pendente', label: 'Pendentes' }, { value: 'resolvida', label: 'Resolvidas' }]} style={{ height: 32 }} />
              <Select aria-label="Canal" value={channel} onChange={e => setChannel(e.target.value as '')} placeholder="Canais" options={Object.entries(CHANNELS).map(([k, c]) => ({ value: k, label: c.label }))} style={{ height: 32 }} />
            </div>
            <label className="check xs"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />Somente atribuídas a mim</label>
          </div>
          <div className="conv-list" role="list">
            {list.length === 0 && <Empty compact icon={<MessagesSquare size={20} />} title="Nenhuma conversa" text="Ajuste os filtros." />}
            {list.map(c => {
              const p = d.people.find(x => x.id === c.personId); const last = c.messages[c.messages.length - 1];
              return (
                <div key={c.id} role="listitem" tabIndex={0} className={cx('conv', c.id === activeId && 'active')} onClick={() => setSp({ c: c.id })} onKeyDown={e => e.key === 'Enter' && setSp({ c: c.id })}>
                  <Avatar name={p?.name ?? '?'} />
                  <div className="flex1" style={{ minWidth: 0 }}>
                    <div className="row between"><span className="strong small ellipsis">{p?.name ?? 'Contato'}</span><span className="xs muted">{relTime(last?.at)}</span></div>
                    <div className="xs ellipsis">{c.subject}</div>
                    <div className="xs muted ellipsis">{last?.body}</div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}><Badge><Icon name={CHANNELS[c.channel].icon} size={11} />{CHANNELS[c.channel].label}</Badge>{c.status !== 'aberta' && <Badge tone={c.status === 'resolvida' ? 'success' : 'warning'}>{c.status}</Badge>}{c.unread > 0 && <Badge tone="accent">{c.unread}</Badge>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {active ? <Thread c={active} onBack={() => setSp({})} /> : <div className="card thread" style={{ display: 'grid', placeItems: 'center' }}><Empty icon={<MessagesSquare size={22} />} title="Selecione uma conversa" text="Responda, adicione notas internas e acompanhe o sentimento do cliente." /></div>}
        {active && <SidePanel c={active} />}
      </div>
      {newConv && <NewConversation onClose={() => setNewConv(false)} onCreated={id => setSp({ c: id })} />}
    </div>
  );
}

function Thread({ c, onBack }: { c: Conversation; onBack: () => void }) {
  const d = useTenant(); const { can } = useSession();
  const [txt, setTxt] = useState(''); const [mode, setMode] = useState<'user' | 'note'>('user');
  const end = useRef<HTMLDivElement>(null);
  const p = d.people.find(x => x.id === c.personId);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [c.messages.length, c.id]);
  const send = () => {
    if (!txt.trim()) return;
    inbox.send(c.id, txt.trim(), mode); setTxt('');
    if (mode === 'user') toast('warning', 'Mensagem registrada (simulada)', `${CHANNELS[c.channel].label} não conectado — nada foi enviado ao cliente.`);
  };
  return (
    <div className="card thread">
      <div className="row between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ minWidth: 0 }}>
          <Button size="sm" variant="ghost" icon onClick={onBack} aria-label="Voltar" className="show-mobile"><ArrowLeft /></Button>
          <Avatar name={p?.name ?? '?'} /><div style={{ minWidth: 0 }}><div className="strong ellipsis">{c.subject}</div><div className="xs muted">{p?.name} · via {CHANNELS[c.channel].label}</div></div>
        </div>
        <Select aria-label="Status da conversa" value={c.status} onChange={e => { inbox.update(c.id, { status: e.target.value as Conversation['status'] }); toast('success', 'Status atualizado'); }} options={[{ value: 'aberta', label: 'Aberta' }, { value: 'pendente', label: 'Pendente' }, { value: 'resolvida', label: 'Resolvida' }]} style={{ width: 130, height: 32 }} disabled={!can('edit')} />
      </div>
      <div className="thread-msgs">
        {c.messages.map(m => (
          <div key={m.id} className={cx('msg', m.from)}>
            {m.from === 'note' && <div className="xs strong" style={{ color: 'var(--warning)' }}>Nota interna · {d.users.find(u => u.id === m.userId)?.name}</div>}
            {m.body}
            <div className="mt">{fmtDateTime(m.at)}{m.from === 'user' && ` · ${d.users.find(u => u.id === m.userId)?.name ?? ''}`}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {can('edit') && (
        <div className="composer">
          <div className="row wrap" style={{ gap: 6 }}>
            <div className="pill-seg"><button aria-pressed={mode === 'user'} onClick={() => setMode('user')}><Send />Responder</button><button aria-pressed={mode === 'note'} onClick={() => setMode('note')}><StickyNote />Nota interna</button></div>
            <Menu width={300} trigger={t => <Button size="xs" {...t}><Zap />Respostas rápidas</Button>}>{QUICK.map(x => <button key={x} onClick={() => setTxt(x)} style={{ whiteSpace: 'normal' }}>{x}</button>)}</Menu>
            <Menu width={260} trigger={t => <Button size="xs" {...t}>Templates</Button>}>{TEMPLATES.map(x => <button key={x.name} onClick={() => setTxt(x.body.replace('{nome}', p?.name.split(' ')[0] ?? ''))}>{x.name}</button>)}</Menu>
            <label className="btn xs"><Paperclip />Anexo<input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setTxt(t => `${t}${t ? '\n' : ''}[Anexo: ${f.name}]`); toast('info', 'Anexo registrado', 'Armazenamento não conectado — apenas o nome do arquivo é salvo.'); } }} /></label>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Textarea value={txt} onChange={e => setTxt(e.target.value)} rows={2} placeholder={mode === 'note' ? 'Nota visível só para a equipe…' : 'Escreva uma resposta… (Ctrl+Enter envia)'} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} aria-label="Mensagem" style={{ minHeight: 56 }} />
            <Button variant="primary" icon onClick={send} disabled={!txt.trim()} aria-label="Enviar"><Send /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidePanel({ c }: { c: Conversation }) {
  const d = useTenant(); const { can } = useSession();
  const p = d.people.find(x => x.id === c.personId); const co = d.companies.find(x => x.id === c.companyId);
  const s = sentiment(c.messages.filter(m => m.from === 'contact').map(m => m.body).join(' '));
  const SI = s === 'positivo' ? Smile : s === 'negativo' ? Frown : Meh;
  return (
    <div className="card inbox-side stack-sm" style={{ overflowY: 'auto' }}>
      <div className="row"><Avatar name={p?.name ?? '?'} size="lg" /><div style={{ minWidth: 0 }}>{p ? <Link to={`/people/${p.id}`} className="strong" style={{ textDecoration: 'underline' }}>{p.name}</Link> : <strong>Contato</strong>}{co && <div className="xs"><Link to={`/companies/${co.id}`} className="muted">{co.tradeName}</Link></div>}</div></div>
      <dl className="kv small" style={{ gridTemplateColumns: '90px 1fr' }}><dt>E-mail</dt><dd>{p?.email ?? '—'}</dd><dt>Telefone</dt><dd>{p?.phone ?? '—'}</dd></dl>
      <div className="divider" />
      <div className="row between"><span className="label">Sentimento</span><Badge tone={s === 'positivo' ? 'success' : s === 'negativo' ? 'danger' : 'neutral'}><SI size={12} />{s}</Badge></div>
      <span className="xs muted">Classificação automática por palavras-chave (demonstrativo).</span>
      <Field label="Responsável"><Select value={c.assigneeId} disabled={!can('edit')} onChange={e => { inbox.update(c.id, { assigneeId: e.target.value }); toast('success', 'Conversa distribuída', d.users.find(u => u.id === e.target.value)?.name); }} options={d.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name }))} /></Field>
      <div className="field"><span className="label">Tags de atendimento</span><TagInput value={c.tags} onChange={t => inbox.update(c.id, { tags: t })} /></div>
      <Field label="Lembrete de resposta"><Input type="datetime-local" value={toInputDateTime(c.remindAt)} onChange={e => { inbox.update(c.id, { remindAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }); toast('success', 'Lembrete definido'); }} /></Field>
      {c.remindAt && <Notice icon={<Bell />}>Lembrete {relTime(c.remindAt)}</Notice>}
    </div>
  );
}

function NewConversation({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const d = useTenant(); const { user } = useSession();
  const [personId, setPersonId] = useState(''); const [channel, setChannel] = useState<Channel>('whatsapp'); const [subject, setSubject] = useState(''); const [err, setErr] = useState('');
  const create = () => {
    if (!personId || !subject.trim()) { setErr('Selecione o contato e informe o assunto.'); return; }
    const p = d.people.find(x => x.id === personId)!;
    const c = inbox.create({ channel, personId, companyId: p.companyId, subject: subject.trim(), status: 'aberta', assigneeId: user.id, tags: [], sentiment: 'neutro', unread: 0, messages: [] });
    onCreated(c.id); onClose();
  };
  return (
    <Modal open onClose={onClose} title="Nova conversa" description="A conversa é vinculada automaticamente ao contato e à empresa." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={create}>Criar</Button></>}>
      <div className="stack">
        <Field label="Contato" required><Select value={personId} onChange={e => setPersonId(e.target.value)} placeholder="Selecione…" options={d.people.filter(p => !p.archivedAt).map(p => ({ value: p.id, label: `${p.name}${p.companyId ? ` · ${d.companies.find(c => c.id === p.companyId)?.tradeName}` : ''}` }))} /></Field>
        <Field label="Canal"><Select value={channel} onChange={e => setChannel(e.target.value as Channel)} options={Object.entries(CHANNELS).map(([k, c]) => ({ value: k, label: c.label }))} /></Field>
        <Field label="Assunto" required error={err}><Input value={subject} onChange={e => { setSubject(e.target.value); setErr(''); }} /></Field>
      </div>
    </Modal>
  );
}
