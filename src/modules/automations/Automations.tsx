import React, { useState } from 'react';
import { Plus, Zap, Play, Pencil, Trash2, Filter, PlayCircle, Clock, CheckCircle2, XCircle, Workflow, FlaskConical } from 'lucide-react';
import type { ActionType, Automation, AutomationRun, Condition, TriggerType } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { automations as autoSvc } from '../../services/crm';
import { PageHeader } from '../../components/common';
import { Badge, Button, Empty, Field, Input, Modal, Select, Switch, Tabs, Notice, SimBadge } from '../../components/ui';
import { ACTIONS, LEAD_STATUS, TRIGGERS } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { fmtDateTime, relTime, uid } from '../../lib/utils';

export default function Automations() {
  const d = useTenant(); const { can } = useSession();
  const [tab, setTab] = useState<'list' | 'runs'>('list');
  const [edit, setEdit] = useState<Automation | null>(null);
  const [run, setRun] = useState<AutomationRun | null>(null);
  const editable = can('settings') || can('edit');
  const blank = (): Automation => ({ id: uid('au'), name: '', active: true, trigger: { type: 'lead.created', params: {} }, conditions: [], actions: [{ type: 'create_task', params: { title: '', days: '1' } }], runs: 0, createdAt: new Date().toISOString() });
  const describe = (a: Automation) => `${TRIGGERS[a.trigger.type].label}${a.conditions.length ? ` · ${a.conditions.length} condição(ões)` : ''} → ${a.actions.map(x => ACTIONS[x.type].label).join(', ')}`;

  return (
    <div>
      <PageHeader title="Automações" desc={<span className="row wrap" style={{ gap: 8 }}>Gatilho → Condição → Ação. Ações externas (e-mail, webhook) são <SimBadge>simuladas</SimBadge></span>} crumbs={[{ label: 'Início', to: '/' }, { label: 'Automações' }]}
        actions={<>
          <Button onClick={() => { const r = autoSvc.runScheduled(); toast(r.length ? 'success' : 'info', r.length ? `${r.length} execução(ões) agendada(s)` : 'Nada a executar agora', 'Verifica leads sem resposta e clientes inativos (cron em produção).'); }} disabled={!editable}><Clock />Rodar verificações agendadas</Button>
          {editable && <Button variant="primary" onClick={() => setEdit(blank())}><Plus />Nova automação</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Automações', count: d.automations.length }, { value: 'runs', label: 'Histórico de execuções', count: d.automationRuns.length }]} />
      {tab === 'list' && (d.automations.length === 0 ? <div className="card"><Empty icon={<Workflow size={22} />} title="Nenhuma automação" text="Automatize distribuição de leads, follow-ups e alertas." action={editable && <Button variant="primary" onClick={() => setEdit(blank())}><Plus />Criar automação</Button>} /></div> : (
        <div className="grid g2">
          {d.automations.map(a => (
            <div key={a.id} className="card stack-sm" style={{ opacity: a.active ? 1 : .7 }}>
              <div className="row between"><span className="row"><span className={`icon-bubble ${a.active ? 'success' : 'neutral'}`}><Zap /></span><strong>{a.name}</strong></span><Switch label={a.active ? 'Desativar' : 'Ativar'} checked={a.active} onChange={() => { if (!editable) return; autoSvc.toggle(a.id); toast('success', a.active ? 'Automação desativada' : 'Automação ativada'); }} /></div>
              {a.description && <p className="small muted">{a.description}</p>}
              <div className="small">{describe(a)}</div>
              <div className="row wrap xs muted" style={{ gap: 10 }}><span>{a.runs} execuções</span><span>Última: {relTime(a.lastRunAt)}</span></div>
              <div className="row wrap">
                <Button size="sm" onClick={() => { const r = autoSvc.test(a); setRun(r); }}><FlaskConical />Testar</Button>
                {editable && <Button size="sm" onClick={() => setEdit(JSON.parse(JSON.stringify(a)))}><Pencil />Editar</Button>}
                {editable && <Button size="sm" variant="ghost" icon aria-label="Excluir automação" onClick={async () => { if (await confirm({ title: `Excluir "${a.name}"?`, body: 'O histórico de execuções é mantido.', danger: true, confirmLabel: 'Excluir' })) { autoSvc.remove(a.id); toast('success', 'Automação excluída'); } }}><Trash2 /></Button>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {tab === 'runs' && <div className="card">{d.automationRuns.length === 0 ? <Empty compact title="Nenhuma execução registrada" text="Teste uma automação ou crie um lead para ver as execuções aqui." /> : (
        <div className="list">{d.automationRuns.map(r => (
          <div key={r.id} className="list-item click" onClick={() => setRun(r)}>
            {r.ok ? <CheckCircle2 color="var(--success)" size={18} /> : <XCircle color="var(--danger)" size={18} />}
            <div className="flex1 small"><strong>{d.automations.find(a => a.id === r.automationId)?.name ?? 'Automação removida'}</strong><div className="xs muted">{r.target} · {fmtDateTime(r.at)}</div></div>
            {r.test && <Badge tone="warning">Teste</Badge>}<Badge>{r.steps.length} passos</Badge>
          </div>
        ))}</div>
      )}</div>}
      {edit && <Builder a={edit} onClose={() => setEdit(null)} />}
      {run && (
        <Modal open onClose={() => setRun(null)} title={run.test ? 'Resultado do teste (sem alterar dados)' : 'Execução'} description={`${run.target} · ${fmtDateTime(run.at)}`}>
          <div className="flow">
            {run.steps.map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="flow-arrow" />}
                <div className={`flow-node ${i === 0 ? 'trigger' : s.label.startsWith('Condição') ? 'cond' : 'action'}`}>
                  <div className="row between"><strong className="small">{s.label}</strong>{s.ok ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}</div>
                  {s.detail && <div className="xs muted">{s.detail}</div>}
                </div>
              </React.Fragment>
            ))}
          </div>
          {run.test && <div style={{ marginTop: 12 }}><Notice>Teste executado em uma cópia isolada dos dados — nenhum registro foi alterado.</Notice></div>}
        </Modal>
      )}
    </div>
  );
}

function Builder({ a: init, onClose }: { a: Automation; onClose: () => void }) {
  const d = useTenant();
  const [a, setA] = useState<Automation>(init);
  const [err, setErr] = useState('');
  const stages = d.pipelines.flatMap(p => p.stages.map(s => ({ value: s.id, label: `${p.name} · ${s.name}` })));
  const trig = TRIGGERS[a.trigger.type];
  const setAction = (i: number, p: Partial<{ type: ActionType; params: Record<string, string> }>) => setA({ ...a, actions: a.actions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setCond = (i: number, p: Partial<Condition>) => setA({ ...a, conditions: a.conditions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = () => {
    if (!a.name.trim()) { setErr('Dê um nome à automação.'); return; }
    if (!a.actions.length) { setErr('Adicione ao menos uma ação.'); return; }
    if (trig.param && !a.trigger.params[trig.param.key]) { setErr(`Preencha "${trig.param.label}" no gatilho.`); return; }
    for (const ac of a.actions) for (const f of ACTIONS[ac.type].fields) if (f.type !== 'user' && !ac.params[f.key]) { setErr(`Preencha "${f.label}" na ação "${ACTIONS[ac.type].label}".`); return; }
    autoSvc.save(a); toast('success', 'Automação salva'); onClose();
  };
  const fieldInput = (type: string | undefined, value: string, onChange: (v: string) => void, label: string) =>
    type === 'user' ? <Select aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder="Rodízio automático" options={d.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name }))} />
      : type === 'status' ? <Select aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder="Selecione…" options={Object.entries(LEAD_STATUS).map(([k, x]) => ({ value: k, label: x.label }))} />
      : type === 'stage' ? <Select aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder="Selecione…" options={stages} />
      : type === 'tag' ? <Select aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder="Selecione…" options={d.tags.map(t => t.name)} />
      : <Input aria-label={label} type={type === 'number' ? 'number' : 'text'} value={value} onChange={e => onChange(e.target.value)} />;

  return (
    <Modal open onClose={onClose} size="lg" title={init.name ? 'Editar automação' : 'Nova automação'} description="Monte o fluxo visualmente."
      footer={<><Button onClick={() => { const r = autoSvc.test(a); toast(r.ok ? 'success' : 'warning', r.ok ? 'Teste concluído' : 'Fluxo interrompido', r.steps.map(s => `${s.ok ? '✓' : '✗'} ${s.label}`).join(' · ')); }} style={{ marginRight: 'auto' }}><PlayCircle />Testar</Button><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <Field label="Nome" required><Input value={a.name} onChange={e => { setA({ ...a, name: e.target.value }); setErr(''); }} placeholder="Ex.: Follow-up após proposta" /></Field>
        <div className="flow">
          <div className="flow-node trigger">
            <div className="flow-label"><Zap size={13} />Gatilho</div>
            <Select aria-label="Gatilho" value={a.trigger.type} onChange={e => setA({ ...a, trigger: { type: e.target.value as TriggerType, params: {} } })} options={Object.entries(TRIGGERS).map(([k, t]) => ({ value: k, label: t.label }))} />
            <div className="xs muted" style={{ marginTop: 6 }}>{trig.hint}</div>
            {trig.param && <div style={{ marginTop: 8 }}><Field label={trig.param.label} required>{fieldInput(trig.param.type, a.trigger.params[trig.param.key] ?? '', v => setA({ ...a, trigger: { ...a.trigger, params: { [trig.param!.key]: v } } }), trig.param.label)}</Field></div>}
          </div>
          <div className="flow-arrow" />
          <div className="flow-node cond">
            <div className="flow-label"><Filter size={13} />Condições (opcional)</div>
            {a.conditions.map((c, i) => (
              <div key={i} className="row wrap" style={{ marginBottom: 6 }}>
                <Select aria-label="Campo" value={c.field} onChange={e => setCond(i, { field: e.target.value })} options={['status', 'source', 'value', 'temperature', 'score', 'ownerId', 'tags', 'priority', 'product']} style={{ width: 140 }} />
                <Select aria-label="Operador" value={c.op} onChange={e => setCond(i, { op: e.target.value as Condition['op'] })} options={[{ value: 'eq', label: 'é igual a' }, { value: 'neq', label: 'é diferente de' }, { value: 'gt', label: 'maior que' }, { value: 'lt', label: 'menor que' }, { value: 'contains', label: 'contém' }]} style={{ width: 150 }} />
                <Input aria-label="Valor" value={c.value} onChange={e => setCond(i, { value: e.target.value })} style={{ flex: 1, minWidth: 100 }} />
                <Button size="sm" variant="ghost" icon aria-label="Remover condição" onClick={() => setA({ ...a, conditions: a.conditions.filter((_, j) => j !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button size="xs" onClick={() => setA({ ...a, conditions: [...a.conditions, { field: 'status', op: 'eq', value: '' }] })}><Plus />Condição</Button>
          </div>
          <div className="flow-arrow" />
          <div className="flow-node action">
            <div className="flow-label"><Play size={13} />Ações</div>
            {a.actions.map((ac, i) => (
              <div key={i} className="stack-sm" style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i < a.actions.length - 1 ? '1px solid var(--line)' : 0 }}>
                <div className="row"><Select aria-label="Ação" value={ac.type} onChange={e => setAction(i, { type: e.target.value as ActionType, params: {} })} options={Object.entries(ACTIONS).map(([k, x]) => ({ value: k, label: x.label }))} />
                  <Button size="sm" variant="ghost" icon aria-label="Remover ação" onClick={() => setA({ ...a, actions: a.actions.filter((_, j) => j !== i) })}><Trash2 /></Button></div>
                <div className="form-grid">{ACTIONS[ac.type].fields.map(f => <Field key={f.key} label={f.label}>{fieldInput(f.type, ac.params[f.key] ?? '', v => setAction(i, { params: { ...ac.params, [f.key]: v } }), f.label)}</Field>)}</div>
                {(ac.type === 'send_email' || ac.type === 'webhook') && <span className="xs" style={{ color: 'var(--warning)' }}>Executada em modo simulado até a integração ser conectada.</span>}
              </div>
            ))}
            <Button size="xs" onClick={() => setA({ ...a, actions: [...a.actions, { type: 'notify', params: { message: '' } }] })}><Plus />Ação</Button>
          </div>
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
      </div>
    </Modal>
  );
}
