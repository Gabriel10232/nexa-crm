import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Send, Copy, CheckSquare } from 'lucide-react';
import { Button, Modal, Notice, SimBadge } from '../../components/ui';
import { PageHeader } from '../../components/common';
import { useUI, uiActions, toast } from '../../store/ui';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { ask, CopilotAnswer, SUGGESTIONS } from '../../services/copilot';
import { tasks } from '../../services/crm';
import { sleep } from '../../lib/utils';

function ctxFromPath(path: string) {
  const m = path.match(/^\/(people|companies|opportunities|leads)\/([^/]+)/);
  if (!m) return undefined;
  return { people: { personId: m[2] }, companies: { companyId: m[2] }, opportunities: { dealId: m[2] }, leads: { leadId: m[2] } }[m[1] as 'people'];
}

function Chat({ compact }: { compact?: boolean }) {
  const d = useTenant(); const { user } = useSession(); const loc = useLocation(); const nav = useNavigate();
  const ctx = ctxFromPath(loc.pathname);
  const [msgs, setMsgs] = useState<{ q: string; a?: CopilotAnswer }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setQ(''); setBusy(true);
    setMsgs(m => [...m, { q: text }]);
    await sleep(500);
    const a = ask(d, user, text, ctx);
    setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { ...x, a } : x)));
    setBusy(false);
  };
  const ctxSuggestions = ctx ? ['Resuma tudo que aconteceu nesta negociação.', 'Crie uma mensagem de follow-up para este cliente.'] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: compact ? '100%' : 'calc(100vh - var(--topbar-h) - 180px)', minHeight: 420 }}>
      <Notice tone="warning">IA real <strong>não conectada</strong>. Respostas demonstrativas calculadas a partir dos dados do CRM (dados de exemplo).</Notice>
      <div className="cp-msgs" style={{ padding: '14px 2px' }} aria-live="polite">
        {msgs.length === 0 && (
          <div className="stack-sm">
            <p className="muted small">Sugestões{ctx ? ' para este registro' : ''}:</p>
            {[...ctxSuggestions, ...SUGGESTIONS].map(s => <button key={s} className="btn sm" style={{ justifyContent: 'flex-start', height: 'auto', padding: '8px 14px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => send(s)}><Sparkles />{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <React.Fragment key={i}>
            <div className="cp-q">{m.q}</div>
            {m.a ? (
              <div className="cp-a">
                <div className="row between"><strong className="small">NEXA Copilot</strong><SimBadge>Exemplo</SimBadge></div>
                <div>{m.a.text}</div>
                {m.a.bullets && m.a.bullets.length > 0 && <ul>{m.a.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                {m.a.draft && <div className="cp-draft">{m.a.draft}<div style={{ marginTop: 8 }}><Button size="xs" onClick={() => { navigator.clipboard?.writeText(m.a!.draft!); toast('success', 'Mensagem copiada'); }}><Copy />Copiar</Button></div></div>}
                {m.a.action && <Button size="sm" variant="primary" onClick={() => { tasks.save({ title: m.a!.action!.title, due: new Date(Date.now() + m.a!.action!.dueDays * 864e5).toISOString(), refs: ctx ?? {} }); toast('success', 'Tarefa criada pelo Copilot', m.a!.action!.title); }}><CheckSquare />Criar tarefa</Button>}
                {m.a.links && <div className="row wrap">{m.a.links.map(l => <Button key={l.to} size="xs" onClick={() => { uiActions.copilot(false); nav(l.to); }}>{l.label}</Button>)}</div>}
              </div>
            ) : <div className="cp-a"><div className="row"><span className="skel" style={{ width: 8, height: 8, borderRadius: 9 }} /><span className="skel" style={{ width: 8, height: 8, borderRadius: 9 }} /><span className="skel" style={{ width: 8, height: 8, borderRadius: 9 }} /><span className="muted small">Analisando dados…</span></div></div>}
          </React.Fragment>
        ))}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); send(q); }} style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Pergunte algo sobre seu CRM…" aria-label="Pergunta para o Copilot" />
        <Button variant="primary" icon type="submit" disabled={!q.trim() || busy} aria-label="Enviar"><Send /></Button>
      </form>
    </div>
  );
}

export function CopilotDrawer() {
  const open = useUI(s => s.copilot);
  return <Modal open={open} onClose={() => uiActions.copilot(false)} drawer title={<span className="row"><Sparkles size={18} />NEXA Copilot</span>} description="Assistente comercial (Ctrl J)"><Chat compact /></Modal>;
}

export default function CopilotPage() {
  return (
    <div className="stack" style={{ maxWidth: 860, margin: '0 auto' }}>
      <PageHeader title="NEXA Copilot" desc="Resumos, próximos passos, follow-ups, priorização e relatórios em linguagem natural." crumbs={[{ label: 'Início', to: '/' }, { label: 'Copilot' }]} />
      <div className="card"><Chat /></div>
    </div>
  );
}
