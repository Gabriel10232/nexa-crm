import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Palette, Plus, Trash2, Plug, Database, RotateCcw, Download, Columns3, Save } from 'lucide-react';
import type { CustomField, OrgSettings } from '../../types';
import { useTenant, store } from '../../store/store';
import { useSession } from '../../services/auth';
import { settings } from '../../services/crm';
import { INTEGRATIONS, STATUS_LABEL } from '../../services/integrations';
import { activeAdapter } from '../../services/storage';
import { PageHeader } from '../../components/common';
import { Badge, Button, Field, Input, Select, Switch, Tabs, Textarea, Notice, Empty, Modal } from '../../components/ui';
import { confirm, prompt, toast } from '../../store/ui';
import { download, uid } from '../../lib/utils';
import { SEGMENTS } from '../../config/labels';

type Tab = 'company' | 'appearance' | 'pipeline' | 'fields' | 'tags' | 'lists' | 'notifications' | 'distribution' | 'integrations' | 'privacy';

export default function Settings() {
  const d = useTenant(); const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('company');
  return (
    <div>
      <PageHeader title="Configurações" desc="Identidade, personalização, campos, regras e integrações da organização." crumbs={[{ label: 'Início', to: '/' }, { label: 'Configurações' }]} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'company', label: 'Empresa' }, { value: 'appearance', label: 'Aparência' }, { value: 'pipeline', label: 'Pipeline' }, { value: 'fields', label: 'Campos' }, { value: 'tags', label: 'Tags' },
        { value: 'lists', label: 'Status e listas' }, { value: 'notifications', label: 'Notificações' }, { value: 'distribution', label: 'Distribuição' }, { value: 'integrations', label: 'Integrações' }, { value: 'privacy', label: 'Privacidade e dados' },
      ]} />
      {tab === 'company' && <CompanyTab />}
      {tab === 'appearance' && (
        <div className="card stack">
          <p>Cores, glassmorphism, tipografia, espaçamentos, densidade, presets e acessibilidade — aplicados em tempo real e salvos por organização.</p>
          <div className="row wrap"><Button variant="primary" onClick={() => window.dispatchEvent(new Event('nexa:appearance'))}><Palette />Personalizar aparência</Button><Button onClick={() => nav('/')}>Editar dashboard</Button></div>
          <div className="grid g3">
            <div className="ap-row card"><span>Tema</span><Select value={d.appearance.mode} onChange={e => settings.appearance({ ...d.appearance, mode: e.target.value as 'dark' })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'auto', label: 'Automático' }]} style={{ width: 140 }} aria-label="Tema" /></div>
            <div className="ap-row card"><span>Efeitos glass</span><Switch label="Glass" checked={d.appearance.glass.enabled} onChange={v => settings.appearance({ ...d.appearance, glass: { ...d.appearance.glass, enabled: v } })} /></div>
            <div className="ap-row card"><span>Reduzir animações</span><Switch label="Reduzir animações" checked={d.appearance.a11y.reduceMotion} onChange={v => settings.appearance({ ...d.appearance, a11y: { ...d.appearance.a11y, reduceMotion: v } })} /></div>
          </div>
        </div>
      )}
      {tab === 'pipeline' && (
        <div className="card stack">
          {d.pipelines.map(p => <div key={p.id} className="stack-sm"><strong>{p.name}</strong><div className="row wrap" style={{ gap: 6 }}>{p.stages.map(s => <Badge key={s.id}><span className="dot" style={{ background: s.color }} />{s.name} · {s.probability}%</Badge>)}</div></div>)}
          <Button style={{ alignSelf: 'flex-start' }} onClick={() => nav('/pipeline')}><Columns3 />Gerenciar pipelines e etapas</Button>
        </div>
      )}
      {tab === 'fields' && <FieldsTab />}
      {tab === 'tags' && <TagsTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'notifications' && (
        <div className="card stack">
          {([['email', 'Notificações por e-mail (requer integração)'], ['push', 'Notificações no navegador'], ['staleDeals', 'Alertar oportunidades paradas (14+ dias)'], ['dailyDigest', 'Resumo diário por e-mail']] as [keyof OrgSettings['notifications'], string][]).map(([k, l]) => (
            <div key={k} className="ap-row"><span>{l}</span><Switch label={l} checked={d.org.notifications[k]} onChange={v => { settings.org({ notifications: { ...d.org.notifications, [k]: v } }); toast('success', 'Preferência salva'); }} /></div>
          ))}
        </div>
      )}
      {tab === 'distribution' && (
        <div className="card stack">
          <Field label="Regra de distribuição de leads" hint="Usada pela automação 'Distribuir novos leads', importação e ação em massa.">
            <Select value={d.org.distribution} onChange={e => { settings.org({ distribution: e.target.value as OrgSettings['distribution'] }); toast('success', 'Regra atualizada'); }} options={[{ value: 'round_robin', label: 'Rodízio por carga (menos leads abertos primeiro)' }, { value: 'by_team', label: 'Por equipe do lead' }, { value: 'manual', label: 'Manual' }]} />
          </Field>
          <div className="list">{d.users.filter(u => u.role === 'seller').map(u => <div key={u.id} className="list-item"><span className="flex1 small">{u.name}</span><Badge>{d.leads.filter(l => l.ownerId === u.id && !l.archivedAt && !['convertido', 'perdido', 'desqualificado'].includes(l.status)).length} leads abertos</Badge>{!u.active && <Badge tone="warning">Inativo — fora do rodízio</Badge>}</div>)}</div>
        </div>
      )}
      {tab === 'integrations' && (
        <div className="stack">
          <Notice tone="warning">Nenhuma integração externa está conectada neste ambiente. Itens "Simulado" funcionam com dados locais e deixam isso explícito na interface.</Notice>
          <div className="grid g2">{INTEGRATIONS.map(i => (
            <div key={i.key} className="card stack-sm">
              <div className="row between"><span className="row"><span className="icon-bubble neutral"><Plug /></span><strong className="small">{i.name}</strong></span><Badge tone={i.status === 'connected' ? 'success' : i.status === 'simulated' ? 'warning' : 'neutral'}>{STATUS_LABEL[i.status]}</Badge></div>
              <p className="small muted">{i.description}</p>
              <div className="row between"><span className="xs muted">{i.category}{i.envVar ? ` · ${i.envVar}` : ''}</span><Button size="sm" onClick={() => toast('info', `Conectar ${i.name}`, 'Configure as credenciais no backend (variáveis de ambiente) e implemente o adapter correspondente. Veja README → Integrações.')}>Configurar</Button></div>
            </div>
          ))}</div>
        </div>
      )}
      {tab === 'privacy' && <PrivacyTab />}
    </div>
  );
}

function CompanyTab() {
  const d = useTenant();
  const [o, setO] = useState(d.org);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(o) !== JSON.stringify(d.org);
  const img = (k: 'logo' | 'favicon') => (f?: File) => {
    if (!f) return; if (!f.type.startsWith('image/')) { toast('error', 'Envie uma imagem'); return; }
    if (f.size > 400_000) { toast('error', 'Imagem acima de 400 KB'); return; }
    const r = new FileReader(); r.onload = () => setO(s => ({ ...s, [k]: String(r.result) })); r.readAsDataURL(f);
  };
  const save = () => { if (!o.name.trim() || !o.productName.trim()) { setErr('Nome da empresa e do produto são obrigatórios.'); return; } settings.org(o); toast('success', 'Configurações salvas'); };
  return (
    <div className="card stack">
      <div className="form-grid">
        <Field label="Nome da empresa" required><Input value={o.name} onChange={e => { setO({ ...o, name: e.target.value }); setErr(''); }} /></Field>
        <Field label="Nome do produto (white-label)" required hint="Substitui 'NEXA CRM' na interface e no título da aba"><Input value={o.productName} onChange={e => { setO({ ...o, productName: e.target.value }); setErr(''); }} /></Field>
        <Field label="Segmento"><Select value={o.segment} onChange={e => setO({ ...o, segment: e.target.value })} options={SEGMENTS} /></Field>
        <Field label="Moeda"><Select value={o.currency} onChange={e => setO({ ...o, currency: e.target.value })} options={[{ value: 'BRL', label: 'Real (R$)' }, { value: 'USD', label: 'Dólar (US$)' }, { value: 'EUR', label: 'Euro (€)' }]} /></Field>
        <Field label="Idioma"><Select value={o.locale} onChange={e => setO({ ...o, locale: e.target.value })} options={[{ value: 'pt-BR', label: 'Português (Brasil)' }, { value: 'en-US', label: 'English (formatos)' }, { value: 'es-ES', label: 'Español (formatos)' }]} /></Field>
        <Field label="Fuso horário"><Select value={o.timezone} onChange={e => setO({ ...o, timezone: e.target.value })} options={['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'Europe/Lisbon', 'UTC']} /></Field>
        <div className="field"><span className="label">Logo</span><div className="row"><div className="brand-mark" style={{ width: 48, height: 48 }}>{o.logo ? <img src={o.logo} alt="Logo" /> : o.productName[0]}</div><label className="btn sm"><Upload />Enviar<input type="file" accept="image/*" hidden onChange={e => img('logo')(e.target.files?.[0])} /></label>{o.logo && <Button size="sm" variant="ghost" onClick={() => setO({ ...o, logo: undefined })}>Remover</Button>}</div></div>
        <div className="field"><span className="label">Favicon</span><div className="row">{o.favicon ? <img src={o.favicon} alt="Favicon" style={{ width: 32, height: 32, borderRadius: 8 }} /> : <span className="muted small">Padrão</span>}<label className="btn sm"><Upload />Enviar<input type="file" accept="image/*" hidden onChange={e => img('favicon')(e.target.files?.[0])} /></label></div></div>
      </div>
      {err && <Notice tone="danger">{err}</Notice>}
      <div className="row"><span className="flex1" />{dirty && <span className="unsaved">Alterações não salvas</span>}<Button onClick={() => setO(d.org)} disabled={!dirty}>Descartar</Button><Button variant="primary" onClick={save} disabled={!dirty}><Save />Salvar</Button></div>
    </div>
  );
}

function FieldsTab() {
  const d = useTenant(); const [f, setF] = useState<CustomField | null>(null);
  const ENT: Record<string, string> = { lead: 'Lead', person: 'Pessoa', company: 'Empresa', deal: 'Oportunidade' };
  return (
    <div className="card stack">
      <div className="row between"><p className="muted small">Campos extras exibidos nos formulários e detalhes (leads com suporte completo no formulário).</p><Button onClick={() => setF({ id: uid('cf'), entity: 'lead', label: '', type: 'text' })}><Plus />Novo campo</Button></div>
      {d.customFields.length === 0 ? <Empty compact title="Nenhum campo personalizado" /> : <div className="list">{d.customFields.map(c => (
        <div key={c.id} className="list-item"><div className="flex1 small"><strong>{c.label}</strong><div className="xs muted">{ENT[c.entity]} · {c.type}{c.options ? ` (${c.options.join(', ')})` : ''}{c.required ? ' · obrigatório' : ''}</div></div>
          <Button size="xs" onClick={() => setF(c)}>Editar</Button>
          <Button size="xs" variant="ghost" icon aria-label="Excluir campo" onClick={async () => { if (await confirm({ title: `Excluir o campo "${c.label}"?`, body: 'Valores já preenchidos deixam de ser exibidos.', danger: true, confirmLabel: 'Excluir' })) settings.patch(t => { t.customFields = t.customFields.filter(x => x.id !== c.id); }, `Removeu campo ${c.label}`); }}><Trash2 /></Button>
        </div>
      ))}</div>}
      {f && <Modal open onClose={() => setF(null)} title="Campo personalizado" footer={<><Button onClick={() => setF(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (!f.label.trim()) { toast('error', 'Informe o rótulo'); return; } settings.patch(t => { t.customFields = t.customFields.some(x => x.id === f.id) ? t.customFields.map(x => (x.id === f.id ? f : x)) : [...t.customFields, f]; }, `Salvou campo ${f.label}`); toast('success', 'Campo salvo'); setF(null); }}>Salvar</Button></>}>
        <div className="form-grid">
          <Field label="Rótulo" required><Input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Entidade"><Select value={f.entity} onChange={e => setF({ ...f, entity: e.target.value as CustomField['entity'] })} options={Object.entries(ENT).map(([k, l]) => ({ value: k, label: l }))} /></Field>
          <Field label="Tipo"><Select value={f.type} onChange={e => setF({ ...f, type: e.target.value as CustomField['type'] })} options={[{ value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }, { value: 'date', label: 'Data' }, { value: 'select', label: 'Lista de opções' }]} /></Field>
          {f.type === 'select' && <Field label="Opções" hint="Separadas por vírgula"><Input value={(f.options ?? []).join(', ')} onChange={e => setF({ ...f, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></Field>}
          <label className="check"><input type="checkbox" checked={!!f.required} onChange={e => setF({ ...f, required: e.target.checked })} />Obrigatório</label>
        </div>
      </Modal>}
    </div>
  );
}

function TagsTab() {
  const d = useTenant();
  const usage = (n: string) => d.leads.filter(l => l.tags.includes(n)).length + d.people.filter(p => p.tags.includes(n)).length + d.companies.filter(c => c.tags.includes(n)).length;
  return (
    <div className="card stack">
      <Button style={{ alignSelf: 'flex-start' }} onClick={async () => { const n = await prompt({ title: 'Nova tag', label: 'Nome', required: true }); if (n) { if (d.tags.some(t => t.name.toLowerCase() === n.toLowerCase())) { toast('error', 'Tag já existe'); return; } settings.patch(t => { t.tags = [...t.tags, { id: uid('tg'), name: n, color: '#7FA7B5' }]; }, `Criou tag ${n}`); } }}><Plus />Nova tag</Button>
      <div className="list">{d.tags.map(t => (
        <div key={t.id} className="list-item">
          <input type="color" className="color-input" value={t.color} aria-label={`Cor da tag ${t.name}`} onChange={e => settings.patch(x => { x.tags = x.tags.map(y => (y.id === t.id ? { ...y, color: e.target.value } : y)); })} />
          <span className="flex1 small strong">{t.name}</span><span className="xs muted">{usage(t.name)} uso(s)</span>
          <Button size="xs" variant="ghost" icon aria-label={`Excluir tag ${t.name}`} onClick={async () => { if (await confirm({ title: `Excluir a tag "${t.name}"?`, body: `Será removida do catálogo. ${usage(t.name)} registro(s) mantêm o texto da tag.`, danger: true, confirmLabel: 'Excluir' })) settings.patch(x => { x.tags = x.tags.filter(y => y.id !== t.id); }, `Removeu tag ${t.name}`); }}><Trash2 /></Button>
        </div>
      ))}</div>
    </div>
  );
}

function ListsTab() {
  const d = useTenant();
  const lists: [keyof OrgSettings, string][] = [['sources', 'Origens de leads'], ['products', 'Produtos e serviços'], ['lostReasons', 'Motivos de perda'], ['categories', 'Categorias de contatos']];
  return (
    <div className="grid g2">
      {lists.map(([k, label]) => {
        const items = d.org[k] as string[];
        return (
          <div key={k} className="card stack-sm">
            <div className="row between"><strong className="small">{label}</strong><Button size="xs" onClick={async () => { const v = await prompt({ title: `Adicionar em ${label}`, label: 'Valor', required: true }); if (v && !items.includes(v)) settings.org({ [k]: [...items, v] } as Partial<OrgSettings>); }}><Plus />Adicionar</Button></div>
            <div className="tags">{items.map(i => <span key={i} className="tag">{i}<button className="btn ghost xs icon" style={{ '--h': '16px', width: 16 } as React.CSSProperties} aria-label={`Remover ${i}`} onClick={() => settings.org({ [k]: items.filter(x => x !== i) } as Partial<OrgSettings>)}>×</button></span>)}</div>
          </div>
        );
      })}
      <div className="card stack-sm" style={{ gridColumn: '1/-1' }}><strong className="small">Status de leads</strong><p className="xs muted">Novo · Em contato · Aguardando resposta · Qualificado · Reunião agendada · Proposta enviada · Convertido · Desqualificado · Perdido — fixos para manter relatórios e automações consistentes.</p></div>
    </div>
  );
}

function PrivacyTab() {
  const d = useTenant(); const { can } = useSession();
  const [policy, setPolicy] = useState(d.org.privacyPolicy);
  return (
    <div className="stack">
      <div className="card stack-sm">
        <Field label="Política de privacidade (LGPD)"><Textarea value={policy} onChange={e => setPolicy(e.target.value)} rows={5} /></Field>
        <Button size="sm" variant="primary" style={{ alignSelf: 'flex-end' }} disabled={policy === d.org.privacyPolicy} onClick={() => { settings.org({ privacyPolicy: policy }); toast('success', 'Política salva'); }}>Salvar política</Button>
      </div>
      <div className="card stack-sm">
        <div className="row"><span className="icon-bubble neutral"><Database /></span><div><strong className="small">Armazenamento</strong><div className="xs muted">Adapter ativo: {activeAdapter.name}. Dados isolados por organização e persistidos neste navegador.</div></div></div>
        <div className="row wrap">
          <Button size="sm" disabled={!can('export')} onClick={() => { download(`nexa-backup-${d.org.name}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json'); toast('success', 'Backup exportado'); }}><Download />Exportar todos os dados (JSON)</Button>
          <Button size="sm" variant="danger" disabled={!can('settings')} onClick={async () => { if (await confirm({ title: 'Restaurar dados de demonstração?', body: 'Todas as organizações voltam ao estado inicial. Alterações feitas serão perdidas.', typeToConfirm: 'RESTAURAR', danger: true, confirmLabel: 'Restaurar' })) { store.reset(); location.hash = '#/login'; toast('success', 'Dados de demonstração restaurados'); } }}><RotateCcw />Restaurar dados de demonstração</Button>
        </div>
      </div>
    </div>
  );
}
