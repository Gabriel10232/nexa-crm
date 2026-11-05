import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Circle, CheckCircle2, Pencil, Trash2, CheckSquare } from 'lucide-react';
import type { Task } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { tasks as taskSvc } from '../../services/crm';
import { PageHeader, RefLinks, UserChip } from '../../components/common';
import { Badge, Button, Empty, Input, Select, Tabs, usePaged, Pager, SkeletonRows, useLoading } from '../../components/ui';
import { TaskForm } from '../../components/forms';
import { TASK_TYPES } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { fmtDateTime, normalize, sameDay, startOfDay } from '../../lib/utils';

export default function Tasks() {
  const d = useTenant(); const { user, can } = useSession(); const [sp] = useSearchParams();
  const loading = useLoading(250);
  const [tab, setTab] = useState<'pending' | 'today' | 'late' | 'done' | 'all'>('pending');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [owner, setOwner] = useState(can('otherTeams') ? '' : user.id);
  const [type, setType] = useState('');
  const [form, setForm] = useState<{ task?: Task } | null>(null);
  const base = useMemo(() => scoped(d, user, d.tasks).filter(t => (!owner || t.ownerId === owner) && (!type || t.type === type) && (!q || normalize(t.title).includes(normalize(q)))), [d, user, owner, type, q]);
  const now = new Date();
  const is = {
    pending: (t: Task) => !t.done, today: (t: Task) => !t.done && sameDay(t.due, now), late: (t: Task) => !t.done && new Date(t.due) < startOfDay(now),
    done: (t: Task) => t.done, all: () => true,
  };
  const rows = base.filter(is[tab]).sort((a, b) => (tab === 'done' ? (b.doneAt ?? '').localeCompare(a.doneAt ?? '') : a.due.localeCompare(b.due)));
  const paged = usePaged(rows, 20);
  const groupLabel = (t: Task) => t.done ? 'Concluídas' : new Date(t.due) < startOfDay(now) ? 'Atrasadas' : sameDay(t.due, now) ? 'Hoje' : new Date(t.due) < new Date(startOfDay(now).getTime() + 2 * 864e5) ? 'Amanhã' : 'Próximas';
  let last = '';
  return (
    <div>
      <PageHeader title="Tarefas" desc="Follow-ups, ligações e próximos passos — com prazo, prioridade e vínculo ao cliente." crumbs={[{ label: 'Início', to: '/' }, { label: 'Tarefas' }]}
        actions={can('create') && <Button variant="primary" onClick={() => setForm({})}><Plus />Nova tarefa</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Pendentes', count: base.filter(is.pending).length }, { value: 'today', label: 'Hoje', count: base.filter(is.today).length }, { value: 'late', label: 'Atrasadas', count: base.filter(is.late).length }, { value: 'done', label: 'Concluídas', count: base.filter(is.done).length }, { value: 'all', label: 'Todas' }]} />
      <div className="toolbar">
        <div className="input-icon"><Search /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tarefa…" aria-label="Buscar tarefa" /></div>
        <Select aria-label="Responsável" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Todos os responsáveis" options={d.users.map(u => ({ value: u.id, label: u.id === user.id ? `${u.name} (eu)` : u.name }))} style={{ width: 220, height: 36 }} />
        <Select aria-label="Tipo" value={type} onChange={e => setType(e.target.value)} placeholder="Todos os tipos" options={Object.entries(TASK_TYPES).map(([k, l]) => ({ value: k, label: l }))} style={{ width: 170, height: 36 }} />
      </div>
      <div className="card">
        {loading ? <SkeletonRows /> : rows.length === 0 ? <Empty icon={<CheckSquare size={22} />} title={tab === 'late' ? 'Nenhuma tarefa atrasada 🎉' : 'Nenhuma tarefa'} text="Crie tarefas manualmente, pelo Copilot ou via automações." action={can('create') && <Button onClick={() => setForm({})}><Plus />Nova tarefa</Button>} /> : (
          <div className="list">
            {paged.slice.map(t => {
              const g = groupLabel(t); const header = g !== last ? (last = g) : null;
              return (
                <React.Fragment key={t.id}>
                  {header && <div className="nav-group" style={{ padding: '14px 6px 6px', color: g === 'Atrasadas' ? 'var(--danger)' : undefined }}>{header}</div>}
                  <div className="list-item" style={{ flexWrap: 'wrap' }}>
                    <button className="btn ghost sm icon" onClick={() => { taskSvc.toggle(t.id); toast('success', t.done ? 'Tarefa reaberta' : 'Tarefa concluída'); }} aria-label={t.done ? `Reabrir ${t.title}` : `Concluir ${t.title}`} disabled={!can('edit')}>{t.done ? <CheckCircle2 color="var(--success)" /> : <Circle />}</button>
                    <div className="flex1" style={{ minWidth: 200 }}>
                      <div className="strong small" style={{ textDecoration: t.done ? 'line-through' : undefined, opacity: t.done ? .6 : 1 }}>{t.title}</div>
                      <div className="xs muted row wrap" style={{ gap: 8 }}><span>{fmtDateTime(t.due)}</span><Badge>{TASK_TYPES[t.type]}</Badge>{t.createdBy && <span>{t.createdBy}</span>}<RefLinks refs={t.refs} /></div>
                    </div>
                    <Badge tone={t.priority === 'alta' ? 'danger' : t.priority === 'media' ? 'warning' : 'neutral'}>{({ alta: 'Alta', media: 'Média', baixa: 'Baixa' })[t.priority]}</Badge>
                    <UserChip id={t.ownerId} />
                    {can('edit') && <Button size="xs" variant="ghost" icon onClick={() => setForm({ task: t })} aria-label="Editar tarefa"><Pencil /></Button>}
                    {can('edit') && <Button size="xs" variant="ghost" icon aria-label="Excluir tarefa" onClick={async () => { if (await confirm({ title: `Excluir a tarefa "${t.title}"?`, danger: true, confirmLabel: 'Excluir' })) { taskSvc.remove(t.id); toast('success', 'Tarefa excluída'); } }}><Trash2 /></Button>}
                  </div>
                </React.Fragment>
              );
            })}
            <Pager page={paged.page} pages={paged.pages} total={rows.length} pageSize={20} onPage={paged.setPage} />
          </div>
        )}
      </div>
      {form && <TaskForm open onClose={() => setForm(null)} task={form.task} />}
    </div>
  );
}
