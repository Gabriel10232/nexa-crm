import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Upload, Check, Rocket } from 'lucide-react';
import { Button, Field, Input, Select, Notice } from '../../components/ui';
import { useTenant } from '../../store/store';
import { createOrganization } from '../../services/auth';
import { settings, leads as leadSvc, pipelines } from '../../services/crm';
import { OPERATION_TEMPLATES, buildPipeline } from '../../config/templates';
import { BUILTIN_PRESETS } from '../../config/appearance';
import { SEGMENTS } from '../../config/labels';
import { toast } from '../../store/ui';
import { deepClone, parseCSV } from '../../lib/utils';
import { useSession } from '../../services/auth';

const STEPS = ['Empresa', 'Operação', 'Regional', 'Identidade', 'Importação', 'Checklist'];

export default function Onboarding() {
  const d = useTenant(); const nav = useNavigate(); const [sp] = useSearchParams(); const { user } = useSession();
  const isNew = sp.get('new') === '1';
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: isNew ? '' : d.org.name, segment: d.org.segment || '', users: d.org.usersEstimate || '1-10', objective: d.org.objective || '',
    template: d.org.template || 'b2b', currency: d.org.currency, timezone: d.org.timezone, logo: d.org.logo ?? '', preset: 'preset_premium',
  });
  const [csv, setCsv] = useState<Record<string, string>[]>([]);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f, v: string) => { setF(s => ({ ...s, [k]: v })); setErr(''); };

  const next = () => {
    if (step === 0 && (!f.name.trim() || !f.segment)) { setErr('Informe o nome da empresa e o segmento.'); return; }
    if (step < STEPS.length - 1) setStep(step + 1); else finish();
  };
  const finish = () => {
    if (isNew) createOrganization(f.name.trim(), f.template);
    const tpl = OPERATION_TEMPLATES[f.template];
    const preset = BUILTIN_PRESETS.find(p => p.id === f.preset);
    settings.org({ name: f.name.trim(), segment: f.segment, usersEstimate: f.users, objective: f.objective, template: f.template, currency: f.currency, timezone: f.timezone, logo: f.logo || undefined, onboarded: true, sources: tpl.sources, products: tpl.products,
      checklist: { company: true, pipeline: true, users: false, import: csv.length > 0, automation: false, integrations: false } });
    if (isNew || d.deals.length === 0) pipelines.save(buildPipeline('pipe_main', tpl.label, f.template));
    if (preset) settings.appearance(deepClone(preset.appearance));
    csv.forEach(r => leadSvc.create({ kind: r.empresa ? 'business' : 'individual', name: r.nome || r.name || 'Sem nome', companyName: r.empresa || undefined, email: r.email || r['e-mail'] || undefined, phone: r.telefone || undefined, source: r.origem || 'Importação', value: Number(r.valor) || 0, temperature: 'morno', ownerId: user.id, teamId: user.teamId, status: 'novo', tags: ['Importado'] }));
    toast('success', 'Configuração concluída!', csv.length ? `${csv.length} contatos importados.` : 'Seu CRM está pronto.');
    nav('/', { replace: true });
  };

  const onLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Envie uma imagem (PNG, JPG ou SVG).'); return; }
    if (file.size > 400_000) { setErr('Imagem muito grande (máx. 400 KB).'); return; }
    const r = new FileReader(); r.onload = () => set('logo', String(r.result)); r.readAsDataURL(file);
  };
  const onCsv = async (file?: File) => { if (!file) return; const rows = parseCSV(await file.text()); if (!rows.length) { setErr('Arquivo vazio ou inválido.'); return; } setCsv(rows); };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="glass" style={{ width: 'min(760px, 100%)', padding: 'clamp(20px, 4vw, 36px)' }}>
        <div className="row between" style={{ marginBottom: 18 }}>
          <div className="row"><div className="brand-mark">N</div><div><strong>Configuração inicial</strong><div className="xs muted">Passo {step + 1} de {STEPS.length} · {STEPS[step]}</div></div></div>
          {!isNew && d.org.onboarded && <Button size="sm" variant="ghost" onClick={() => nav('/')}>Pular</Button>}
          {isNew && <Button size="sm" variant="ghost" onClick={() => nav('/')}>Cancelar</Button>}
        </div>
        <div className="steps" style={{ marginBottom: 24 }}>{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && <div className="form-grid">
          <Field label="Nome da empresa" required className="full"><Input value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
          <Field label="Segmento de atuação" required><Select value={f.segment} onChange={e => set('segment', e.target.value)} options={SEGMENTS} placeholder="Selecione…" /></Field>
          <Field label="Quantidade de usuários"><Select value={f.users} onChange={e => set('users', e.target.value)} options={['1-10', '11-50', '51-200', '200+']} /></Field>
          <Field label="Objetivo principal" className="full"><Select value={f.objective} onChange={e => set('objective', e.target.value)} placeholder="Selecione…" options={['Organizar leads', 'Aumentar a conversão do funil', 'Previsibilidade de receita', 'Automatizar tarefas', 'Melhorar atendimento']} /></Field>
        </div>}

        {step === 1 && <div className="stack">
          <p className="muted">Escolha um modelo de operação. O pipeline e as listas de origem/produtos serão criados automaticamente — tudo pode ser editado depois.</p>
          <div className="choice-grid">
            {Object.entries(OPERATION_TEMPLATES).map(([k, t]) => (
              <button key={k} className="choice" aria-pressed={f.template === k} onClick={() => set('template', k)}>
                <span className="t">{t.label}</span><span className="s">{t.description}</span>
                <span className="xs muted" style={{ marginTop: 6 }}>{t.stages.map(s => s[0]).join(' → ')}</span>
              </button>
            ))}
          </div>
        </div>}

        {step === 2 && <div className="form-grid">
          <Field label="Moeda"><Select value={f.currency} onChange={e => set('currency', e.target.value)} options={[{ value: 'BRL', label: 'Real (R$)' }, { value: 'USD', label: 'Dólar (US$)' }, { value: 'EUR', label: 'Euro (€)' }]} /></Field>
          <Field label="Fuso horário"><Select value={f.timezone} onChange={e => set('timezone', e.target.value)} options={['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon', 'UTC']} /></Field>
        </div>}

        {step === 3 && <div className="stack">
          <div className="row" style={{ gap: 16 }}>
            <div className="brand-mark" style={{ width: 64, height: 64, borderRadius: 18, fontSize: 24 }}>{f.logo ? <img src={f.logo} alt="Logo" /> : (f.name || 'N').charAt(0)}</div>
            <label className="btn"><Upload />Enviar logotipo<input type="file" accept="image/*" hidden onChange={e => onLogo(e.target.files?.[0])} /></label>
            {f.logo && <Button variant="ghost" size="sm" onClick={() => set('logo', '')}>Remover</Button>}
          </div>
          <div className="label">Identidade visual</div>
          <div className="preset-grid">
            {BUILTIN_PRESETS.map(p => { const c = p.appearance.colors[p.appearance.mode === 'light' ? 'light' : 'dark']; return (
              <button key={p.id} className={`preset ${f.preset === p.id ? 'active' : ''}`} onClick={() => set('preset', p.id)}>
                <div className="pv" style={{ background: c.bg }}><i style={{ background: c.card }} /><i style={{ background: c.accent }} /><i style={{ background: c.button }} /></div>{p.name}
              </button>); })}
          </div>
        </div>}

        {step === 4 && <div className="stack">
          <p className="muted">Opcional: importe contatos por CSV com colunas <code>nome; empresa; email; telefone; origem; valor</code>.</p>
          <label className="btn" style={{ alignSelf: 'flex-start' }}><Upload />Selecionar arquivo CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => onCsv(e.target.files?.[0])} /></label>
          {csv.length > 0 && <Notice tone="success">{csv.length} linha(s) prontas para importar. Primeira: {Object.values(csv[0]).slice(0, 3).join(' · ')}</Notice>}
        </div>}

        {step === 5 && <div className="stack-sm">
          {[['Dados da empresa', true], ['Pipeline configurado', true], ['Identidade visual', true], ['Contatos importados', csv.length > 0], ['Convidar equipe', false], ['Criar primeira automação', false], ['Conectar integrações', false]].map(([l, ok]) => (
            <div key={l as string} className="list-item"><span className={`icon-bubble ${ok ? 'success' : 'neutral'}`}>{ok ? <Check /> : <ArrowRight />}</span><span className="flex1">{l}</span><span className="xs muted">{ok ? 'Concluído' : 'Disponível depois em Configurações'}</span></div>
          ))}
        </div>}

        {err && <div style={{ marginTop: 14 }}><Notice tone="danger">{err}</Notice></div>}
        <div className="row between" style={{ marginTop: 24 }}>
          <Button onClick={() => setStep(s => s - 1)} disabled={step === 0}><ArrowLeft />Voltar</Button>
          <Button variant="primary" onClick={next}>{step === STEPS.length - 1 ? <><Rocket />Concluir</> : <>Continuar<ArrowRight /></>}</Button>
        </div>
      </div>
    </div>
  );
}
