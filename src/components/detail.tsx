/* Building blocks for record detail pages (lead / person / company / deal). */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MessageCircle, Mail, CheckSquare, CalendarPlus, Handshake, StickyNote, Circle, CheckCircle2, Plus, Paperclip, Upload, Sparkles } from 'lucide-react';
import type { Refs, Deal, ActivityType } from '../types';
import { Badge, Button, Empty, Textarea, SimBadge, Modal } from './ui';
import { Money, UserChip, useLookups } from './common';
import { useTenant } from '../store/store';
import { useSession } from '../services/auth';
import { TaskForm, EventForm, LogActivityModal, DealForm } from './forms';
import { logActivity, tasks as taskSvc, deals as dealSvc } from '../services/crm';
import { simulateOutbound } from '../services/integrations';
import { toast, uiActions } from '../store/ui';
import { fmtDate, fmtDateTime, relTime } from '../lib/utils';

export function QuickActions({ refs, phone, whatsapp, email, onDeal, dealPreset, extra }: { refs: Refs; phone?: string; whatsapp?: string; email?: string; onDeal?: () => void; dealPreset?: Partial<Deal>; extra?: React.ReactNode }) {
  const { can } = useSession();
  const [log, setLog] = useState<ActivityType | null>(null);
  const [task, setTask] = useState(false);
  const [ev, setEv] = useState(false);
  const [deal, setDeal] = useState(false);
  const [note, setNote] = useState(false);
  const ro = !can('edit');
  const outbound = async (kind: 'whatsapp' | 'email', target?: string) => {
    if (!target) { toast('error', kind === 'whatsapp' ? 'Sem WhatsApp cadastrado' : 'Sem e-mail cadastrado', 'Edite o registro para adicionar.'); return; }
    const r = await simulateOutbound(kind, target);
    toast('warning', `${kind === 'whatsapp' ? 'WhatsApp' : 'E-mail'} não conectado`, r.message);
    setLog(kind);
  };
  return (
    <>
      <div className="quick-actions">
        <Button size="sm" disabled={ro} onClick={() => { if (phone) toast('info', `Discando ${phone} (simulado)`, 'Telefonia não conectada. Registre o resultado da ligação.'); setLog('call'); }}><Phone />Ligar</Button>
        <Button size="sm" disabled={ro} onClick={() => outbound('whatsapp', whatsapp)}><MessageCircle />WhatsApp</Button>
        <Button size="sm" disabled={ro} onClick={() => outbound('email', email)}><Mail />E-mail</Button>
        <Button size="sm" disabled={ro} onClick={() => setTask(true)}><CheckSquare />Tarefa</Button>
        <Button size="sm" disabled={ro} onClick={() => setEv(true)}><CalendarPlus />Reunião</Button>
        <Button size="sm" disabled={ro} onClick={() => setNote(true)}><StickyNote />Nota</Button>
        <Button size="sm" disabled={!can('create')} onClick={() => (onDeal ? onDeal() : setDeal(true))}><Handshake />Oportunidade</Button>
        <Button size="sm" variant="ghost" onClick={() => uiActions.copilot(true)}><Sparkles />Copilot</Button>
        {extra}
      </div>
      {log && <LogActivityModal open onClose={() => setLog(null)} refs={refs} defaultType={log} />}
      {task && <TaskForm open onClose={() => setTask(false)} refs={refs} />}
      {ev && <EventForm open onClose={() => setEv(false)} refs={refs} />}
      {deal && <DealForm open onClose={() => setDeal(false)} preset={{ ...dealPreset, companyId: refs.companyId, personId: refs.personId }} />}
      {note && <NoteModal refs={refs} onClose={() => setNote(false)} />}
    </>
  );
}

function NoteModal({ refs, onClose }: { refs: Refs; onClose: () => void }) {
  const [t, setT] = useState(''); const [err, setErr] = useState('');
  return (
    <LogShell title="Adicionar nota" onClose={onClose} onSave={() => { if (!t.trim()) { setErr('Escreva a nota.'); return; } logActivity({ type: 'note', title: 'Nota interna', body: t.trim(), refs }); toast('success', 'Nota adicionada'); onClose(); }}>
      <Textarea value={t} onChange={e => { setT(e.target.value); setErr(''); }} rows={5} autoFocus placeholder="Visível apenas para a equipe" aria-label="Nota" />
      {err && <span className="field-error">{err}</span>}
    </LogShell>
  );
}
function LogShell({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return <Modal open onClose={onClose} title={title} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={onSave}>Salvar</Button></>}>{children}</Modal>;
}

export function TasksPanel({ refs, match }: { refs: Refs; match: (t: { refs: Refs }) => boolean }) {
  const d = useTenant();
  const [open, setOpen] = useState(false);
  const list = d.tasks.filter(match).sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}><span className="muted small">{list.filter(t => !t.done).length} pendente(s)</span><Button size="sm" onClick={() => setOpen(true)}><Plus />Nova tarefa</Button></div>
      {!list.length ? <Empty compact title="Sem tarefas" text="Crie tarefas para não perder o próximo passo." /> : (
        <div className="list">{list.map(t => (
          <div key={t.id} className="list-item">
            <button className="btn ghost xs icon" onClick={() => taskSvc.toggle(t.id)} aria-label={t.done ? 'Reabrir tarefa' : 'Concluir tarefa'}>{t.done ? <CheckCircle2 color="var(--success)" /> : <Circle />}</button>
            <div className="flex1"><div className="small strong" style={{ textDecoration: t.done ? 'line-through' : undefined, opacity: t.done ? .6 : 1 }}>{t.title}</div><div className="xs muted">{fmtDateTime(t.due)}{t.createdBy ? ` · ${t.createdBy}` : ''}</div></div>
            {!t.done && new Date(t.due) < new Date() && <Badge tone="danger">Atrasada</Badge>}
            <UserChip id={t.ownerId} />
          </div>
        ))}</div>
      )}
      {open && <TaskForm open onClose={() => setOpen(false)} refs={refs} />}
    </div>
  );
}

export function DealsPanel({ deals, refs }: { deals: Deal[]; refs: Refs }) {
  const L = useLookups(); const [open, setOpen] = useState(false); const { can } = useSession();
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}><span className="muted small">{deals.length} oportunidade(s)</span>{can('create') && <Button size="sm" onClick={() => setOpen(true)}><Plus />Nova oportunidade</Button>}</div>
      {!deals.length ? <Empty compact title="Sem oportunidades" text="Crie uma oportunidade para acompanhar no pipeline." /> : (
        <div className="list">{deals.map(x => (
          <Link key={x.id} to={`/opportunities/${x.id}`} className="list-item click">
            <span className="icon-bubble"><Handshake /></span>
            <div className="flex1"><div className="small strong ellipsis">{x.name}</div><div className="xs muted">{L.stages.get(x.stageId)?.name} · prev. {fmtDate(x.expectedClose, { day: '2-digit', month: 'short' })}</div></div>
            <Badge tone={x.status === 'won' ? 'success' : x.status === 'lost' ? 'danger' : 'accent'}>{x.status === 'won' ? 'Ganha' : x.status === 'lost' ? 'Perdida' : `${x.probability}%`}</Badge>
            <strong className="small"><Money v={x.value} /></strong>
          </Link>
        ))}</div>
      )}
      {open && <DealForm open onClose={() => setOpen(false)} preset={{ companyId: refs.companyId, personId: refs.personId }} />}
    </div>
  );
}

export function ChangeLog({ entityId }: { entityId: string }) {
  const d = useTenant(); const L = useLookups();
  const rows = d.audit.filter(a => a.entityId === entityId);
  if (!rows.length) return <Empty compact title="Sem alterações registradas" text="Edições feitas a partir de agora aparecerão aqui com autor e data." />;
  return <div className="list">{rows.map(a => <div key={a.id} className="list-item"><span className="icon-bubble neutral"><StickyNote /></span><div className="flex1"><div className="small">{a.detail}</div><div className="xs muted">{L.users.get(a.userId)?.name ?? 'Sistema'} · {fmtDateTime(a.at)} · {a.action}</div></div></div>)}</div>;
}

export function FilesPanel({ files, onAdd }: { files: { id: string; name: string; size: number; addedAt: string; by: string }[]; onAdd?: (f: File) => void }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row small muted">{files.length} arquivo(s) <SimBadge>Armazenamento não conectado</SimBadge></span>
        {onAdd && <label className="btn sm"><Upload />Anexar<input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 10e6) toast('error', 'Arquivo acima de 10 MB'); else onAdd(f); } e.target.value = ''; }} /></label>}
      </div>
      {!files.length ? <Empty compact icon={<Paperclip size={20} />} title="Nenhum arquivo" text="Apenas os metadados são salvos enquanto o armazenamento não estiver conectado." /> :
        <div className="list">{files.map(f => <div key={f.id} className="list-item"><span className="icon-bubble neutral"><Paperclip /></span><div className="flex1"><div className="small strong">{f.name}</div><div className="xs muted">{(f.size / 1024).toFixed(0)} KB · {relTime(f.addedAt)}</div></div><UserChip id={f.by} /></div>)}</div>}
    </div>
  );
}

export function NotesPanel({ refs, match }: { refs: Refs; match: (a: { refs: Refs; type: string }) => boolean }) {
  const d = useTenant(); const [t, setT] = useState(''); const { can } = useSession();
  const notes = d.activities.filter(a => a.type === 'note' && match(a)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="stack-sm">
      {can('edit') && <div className="stack-sm"><Textarea value={t} onChange={e => setT(e.target.value)} rows={3} placeholder="Nota interna (visível só para a equipe)…" aria-label="Nova nota" /><Button size="sm" variant="primary" style={{ alignSelf: 'flex-end' }} disabled={!t.trim()} onClick={() => { logActivity({ type: 'note', title: 'Nota interna', body: t.trim(), refs }); setT(''); toast('success', 'Nota adicionada'); }}>Adicionar nota</Button></div>}
      {notes.length === 0 ? <Empty compact title="Sem notas" /> : notes.map(n => <div key={n.id} className="card" style={{ padding: 12 }}><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div><div className="xs muted" style={{ marginTop: 6 }}>{d.users.find(u => u.id === n.userId)?.name} · {relTime(n.at)}</div></div>)}
    </div>
  );
}

export function addDealFile(dealId: string, f: File) { dealSvc.addFile(dealId, f.name, f.size); toast('success', 'Arquivo registrado', 'Upload real depende de armazenamento externo (não conectado).'); }
