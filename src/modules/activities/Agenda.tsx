import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Check, Pencil, Trash2, Clock, MapPin, Users, RefreshCw } from 'lucide-react';
import type { CalEvent } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { events as eventSvc } from '../../services/crm';
import { PageHeader, RefLinks, UserChip } from '../../components/common';
import { Badge, Button, Empty, Modal, Seg, Select, SimBadge } from '../../components/ui';
import { EventForm } from '../../components/forms';
import { EVENT_TYPES } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { addDays, cx, fmtDate, fmtDateTime, fmtTime, sameDay, startOfDay } from '../../lib/utils';

const TONE_COLOR: Record<string, string> = { accent: 'var(--accent)', info: 'var(--info)', neutral: 'var(--text2)', warning: 'var(--warning)', success: 'var(--success)', danger: 'var(--danger)' };
const evColor = (e: CalEvent) => TONE_COLOR[EVENT_TYPES[e.type].tone];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7);

export default function Agenda() {
  const d = useTenant(); const { user, can } = useSession();
  const [view, setView] = useState<'day' | 'week' | 'month' | 'list'>(() => (window.innerWidth < 700 ? 'list' : 'week'));
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [userF, setUserF] = useState(can('otherTeams') ? '' : user.id);
  const [typeF, setTypeF] = useState('');
  const [form, setForm] = useState<{ ev?: CalEvent; start?: Date } | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const evs = useMemo(() => d.events.filter(e => (!userF || e.participants.includes(userF) || e.ownerId === userF) && (!typeF || e.type === typeF)), [d.events, userF, typeF]);

  const step = (dir: number) => setCursor(c => view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1));
  const weekStart = addDays(cursor, -((cursor.getDay() + 6) % 7));
  const days = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const title = view === 'month' || view === 'list' ? cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : view === 'day' ? fmtDate(cursor, { weekday: 'long', day: '2-digit', month: 'long' }) : `${fmtDate(days[0], { day: '2-digit', month: 'short' })} – ${fmtDate(days[6], { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const onDay = (day: Date) => evs.filter(e => sameDay(e.start, day)).sort((a, b) => a.start.localeCompare(b.start));
  const newAt = (day: Date, h = 10) => { if (!can('create')) return; const s = new Date(day); s.setHours(h, 0, 0, 0); setForm({ start: s }); };

  return (
    <div>
      <PageHeader title="Agenda" desc={<span className="row wrap" style={{ gap: 8 }}>Reuniões, ligações, follow-ups, demonstrações e visitas. <SimBadge>Google/Outlook não conectados</SimBadge></span>} crumbs={[{ label: 'Início', to: '/' }, { label: 'Agenda' }]}
        actions={<>
          <Button onClick={() => toast('warning', 'Sincronização indisponível', 'Conecte Google Calendar ou Outlook em Configurações → Integrações.')}><RefreshCw />Sincronizar</Button>
          {can('create') && <Button variant="primary" onClick={() => setForm({})}><Plus />Novo evento</Button>}
        </>} />
      <div className="toolbar">
        <Button size="sm" icon onClick={() => step(-1)} aria-label="Anterior"><ChevronLeft /></Button>
        <Button size="sm" onClick={() => setCursor(startOfDay(new Date()))}>Hoje</Button>
        <Button size="sm" icon onClick={() => step(1)} aria-label="Próximo"><ChevronRight /></Button>
        <strong style={{ textTransform: 'capitalize', minWidth: 160 }}>{title}</strong>
        <span className="flex1" />
        <Seg label="Visualização" value={view} onChange={setView} options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'list', label: 'Lista' }]} />
        <Select aria-label="Usuário" value={userF} onChange={e => setUserF(e.target.value)} placeholder="Todos os usuários" options={d.users.map(u => ({ value: u.id, label: u.name }))} style={{ width: 190, height: 36 }} />
        <Select aria-label="Tipo de evento" value={typeF} onChange={e => setTypeF(e.target.value)} placeholder="Todos os tipos" options={Object.entries(EVENT_TYPES).map(([k, x]) => ({ value: k, label: x.label }))} style={{ width: 160, height: 36 }} />
      </div>

      {(view === 'week' || view === 'day') && (
        <div className="card" style={{ padding: 0 }}>
          <div className="week" style={{ '--days': days.length } as React.CSSProperties}>
            <div className="week-h" style={{ borderLeft: 0 }} />
            {days.map(day => <div key={day.toISOString()} className={cx('week-h', sameDay(day, new Date()) && 'today')}>{fmtDate(day, { weekday: 'short', day: '2-digit' })}</div>)}
            <div>{HOURS.map(h => <div key={h} className="week-time">{String(h).padStart(2, '0')}:00</div>)}</div>
            {days.map(day => (
              <div key={day.toISOString()} className="week-col">
                {HOURS.map(h => <div key={h} className="week-slot" onClick={() => newAt(day, h)} role="button" aria-label={`Criar evento ${fmtDate(day)} ${h}h`} />)}
                {onDay(day).map(e => {
                  const s = new Date(e.start), en = new Date(e.end);
                  const top = ((s.getHours() + s.getMinutes() / 60) - 7) * 52; const hgt = Math.max(22, ((en.getTime() - s.getTime()) / 36e5) * 52 - 2);
                  if (top < 0 || top > 12 * 52) return null;
                  return <button key={e.id} className={cx('week-ev', e.done && 'done')} style={{ top, height: hgt, '--c': evColor(e), opacity: e.done ? .55 : 1, textAlign: 'left', border: 0, color: 'var(--text)' } as React.CSSProperties} onClick={() => setOpen(e)}>{fmtTime(e.start)} {e.title}</button>;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'month' && (() => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const start = addDays(first, -((first.getDay() + 6) % 7));
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div className="card" style={{ padding: 0 }}>
            <div className="cal-grid">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => <div key={x} className="cal-dow">{x}</div>)}
              {cells.map(day => {
                const list = onDay(day);
                return (
                  <div key={day.toISOString()} className={cx('cal-cell', day.getMonth() !== cursor.getMonth() && 'out', sameDay(day, new Date()) && 'today')} onClick={() => { setCursor(startOfDay(day)); setView('day'); }}>
                    <span className="d">{day.getDate()}</span>
                    {list.slice(0, 3).map(e => <span key={e.id} className={cx('cal-ev', e.done && 'done')} style={{ '--c': evColor(e) } as React.CSSProperties} onClick={ev => { ev.stopPropagation(); setOpen(e); }} title={e.title}>{fmtTime(e.start)} {e.title}</span>)}
                    {list.length > 3 && <span className="xs muted">+{list.length - 3}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {view === 'list' && (() => {
        const from = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth(), 1)); const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const list = evs.filter(e => new Date(e.start) >= from && new Date(e.start) < to).sort((a, b) => a.start.localeCompare(b.start));
        let last = '';
        return (
          <div className="card">{list.length === 0 ? <Empty icon={<CalendarDays size={22} />} title="Nenhum evento neste mês" text="Agende reuniões e follow-ups vinculados a clientes." action={can('create') && <Button onClick={() => setForm({})}><Plus />Novo evento</Button>} /> : (
            <div className="list">{list.map(e => {
              const k = fmtDate(e.start, { weekday: 'long', day: '2-digit', month: 'long' }); const h = k !== last ? (last = k) : null;
              return (
                <React.Fragment key={e.id}>
                  {h && <div className="nav-group" style={{ padding: '14px 6px 6px', textTransform: 'capitalize' }}>{h}</div>}
                  <div className="list-item click" onClick={() => setOpen(e)}>
                    <span className="dot-status" style={{ background: evColor(e) }} />
                    <span style={{ width: 92 }} className="small num">{fmtTime(e.start)}–{fmtTime(e.end)}</span>
                    <span className="flex1 small" style={{ textDecoration: e.done ? 'line-through' : undefined }}><strong>{e.title}</strong></span>
                    <Badge tone={EVENT_TYPES[e.type].tone}>{EVENT_TYPES[e.type].label}</Badge>
                  </div>
                </React.Fragment>
              );
            })}</div>
          )}</div>
        );
      })()}

      {open && (() => { const e = d.events.find(x => x.id === open.id) ?? open; return (
        <Modal open onClose={() => setOpen(null)} title={e.title} description={<Badge tone={EVENT_TYPES[e.type].tone}>{EVENT_TYPES[e.type].label}</Badge>}
          footer={can('edit') ? <>
            <Button variant="danger" style={{ marginRight: 'auto' }} onClick={async () => { if (await confirm({ title: 'Excluir este evento?', danger: true, confirmLabel: 'Excluir' })) { eventSvc.remove(e.id); setOpen(null); toast('success', 'Evento excluído'); } }}><Trash2 />Excluir</Button>
            <Button onClick={() => { setForm({ ev: e }); setOpen(null); }}><Pencil />Editar / reagendar</Button>
            <Button variant="primary" onClick={() => { eventSvc.toggle(e.id); toast('success', e.done ? 'Reaberto' : 'Marcado como concluído'); }}><Check />{e.done ? 'Reabrir' : 'Concluir'}</Button>
          </> : undefined}>
          <div className="stack-sm">
            <div className="row small"><Clock size={15} />{fmtDateTime(e.start)} – {fmtTime(e.end)}</div>
            {e.location && <div className="row small"><MapPin size={15} />{e.location}</div>}
            <div className="row small wrap"><Users size={15} />{e.participants.map(p => <UserChip key={p} id={p} />)}</div>
            {e.reminderMin ? <div className="small muted">Lembrete {e.reminderMin >= 1440 ? '1 dia' : `${e.reminderMin} min`} antes</div> : null}
            <div className="row small wrap" style={{ gap: 8 }}><RefLinks refs={e.refs} /></div>
            {e.notes && <p className="small">{e.notes}</p>}
          </div>
        </Modal>
      ); })()}
      {form && <EventForm open onClose={() => setForm(null)} event={form.ev} start={form.start} />}
    </div>
  );
}
