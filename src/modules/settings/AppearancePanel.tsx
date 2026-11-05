import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Save, RotateCcw, Download, Upload, Copy, Pencil, Trash2, Check, MoreHorizontal } from 'lucide-react';
import type { Appearance, AppearancePreset, ColorSet } from '../../types';
import { Button, Modal, Seg, Switch, Select, Menu, Notice } from '../../components/ui';
import { useTenant } from '../../store/store';
import { settings } from '../../services/crm';
import { applyAppearance, resolvedMode } from '../../lib/theme';
import { DEFAULT_APPEARANCE, DENSITY, FONTS } from '../../config/appearance';
import { confirm, prompt, toast } from '../../store/ui';
import { contrast, deepClone, download, uid } from '../../lib/utils';

const COLOR_LABELS: [keyof ColorSet, string][] = [
  ['primary', 'Cor principal'], ['secondary', 'Cor secundária'], ['accent', 'Destaque'], ['bg', 'Fundo'], ['bg2', 'Fundo (gradiente)'],
  ['text', 'Textos'], ['text2', 'Textos secundários'], ['border', 'Bordas'], ['button', 'Botões'], ['buttonText', 'Texto dos botões'],
  ['sidebar', 'Sidebar'], ['topbar', 'Topbar'], ['card', 'Cards'], ['info', 'Indicadores'], ['success', 'Status: sucesso'], ['warning', 'Status: atenção'], ['danger', 'Status: erro'],
];

export function AppearancePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useTenant();
  const [draft, setDraft] = useState<Appearance>(d.appearance);
  const hist = useRef<{ past: Appearance[]; future: Appearance[] }>({ past: [], future: [] });
  const [, force] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(d.appearance);

  useEffect(() => { if (open) { setDraft(d.appearance); hist.current = { past: [], future: [] }; } }, [open]); // eslint-disable-line
  useEffect(() => { if (open) applyAppearance(draft); }, [draft, open]);

  const update = (fn: (a: Appearance) => void) => {
    setDraft(prev => { const next = deepClone(prev); fn(next); hist.current.past.push(prev); hist.current.future = []; return next; });
    force(x => x + 1);
  };
  const undo = () => { const p = hist.current.past.pop(); if (p) { hist.current.future.push(draft); setDraft(p); force(x => x + 1); } };
  const redo = () => { const f = hist.current.future.pop(); if (f) { hist.current.past.push(draft); setDraft(f); force(x => x + 1); } };
  const save = () => { settings.appearance(draft); toast('success', 'Aparência salva', 'Mantida após atualizar a página.'); };
  const close = async () => {
    if (dirty && !(await confirm({ title: 'Descartar alterações não salvas?', body: 'As alterações de aparência serão revertidas.', confirmLabel: 'Descartar', danger: true }))) return;
    applyAppearance(d.appearance); onClose();
  };

  const mode = resolvedMode(draft);
  const cs = draft.colors[mode];
  const contrastRatio = contrast(cs.text, cs.bg);

  const applyPreset = async (p: AppearancePreset) => {
    update(a => Object.assign(a, deepClone(p.appearance)));
    if (p.layout && await confirm({ title: `Aplicar também o layout do preset "${p.name}"?`, body: 'O dashboard ativo terá os widgets substituídos.', confirmLabel: 'Aplicar layout' })) {
      settings.dashboards(d.dashboards.map(x => (x.id === d.activeDashboardId ? { ...x, widgets: deepClone(p.layout!), updatedAt: new Date().toISOString() } : x)));
    }
  };
  const savePreset = async () => {
    const name = await prompt({ title: 'Salvar como preset', label: 'Nome do preset', required: true });
    if (!name) return;
    const layout = d.dashboards.find(x => x.id === d.activeDashboardId)?.widgets;
    settings.patch(t => { t.presets = [...t.presets, { id: uid('preset'), name, appearance: deepClone(draft), layout: layout ? deepClone(layout) : undefined }]; }, `Preset ${name}`);
    toast('success', `Preset "${name}" salvo`, 'Inclui cores, fontes, espaçamentos, glass e layout do dashboard.');
  };
  const exportCfg = () => download(`nexa-aparencia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ appearance: draft, dashboards: d.dashboards }, null, 2), 'application/json');
  const importCfg = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      try {
        const json = JSON.parse(await inp.files![0].text());
        if (!json.appearance?.colors?.dark) throw new Error('Arquivo sem configuração de aparência válida.');
        update(a => Object.assign(a, { ...DEFAULT_APPEARANCE, ...json.appearance }));
        if (Array.isArray(json.dashboards)) settings.dashboards(json.dashboards);
        toast('success', 'Configuração importada', 'Revise e clique em Salvar.');
      } catch (e) { toast('error', 'Não foi possível importar', String((e as Error).message)); }
    };
    inp.click();
  };

  const slider = (label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, unit = '') => (
    <div className="ap-slider"><label>{label}</label><input className="range" type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))} aria-label={label} /><output>{step < 1 ? value.toFixed(2) : value}{unit}</output></div>
  );

  return (
    <Modal open={open} onClose={close} drawer className="ap" title="Personalizar aparência" description="Alterações aparecem em tempo real em toda a interface."
      footer={<>
        {dirty && <span className="unsaved" style={{ marginRight: 'auto' }}>Alterações não salvas</span>}
        <Button size="sm" icon onClick={undo} disabled={!hist.current.past.length} aria-label="Desfazer" title="Desfazer"><Undo2 /></Button>
        <Button size="sm" icon onClick={redo} disabled={!hist.current.future.length} aria-label="Refazer" title="Refazer"><Redo2 /></Button>
        <Button size="sm" onClick={close}>Fechar</Button>
        <Button size="sm" variant="primary" onClick={save} disabled={!dirty}><Save />Salvar</Button>
      </>}>
      <div className="ap-panel" style={{ width: '100%' }}>
        <section className="ap-section">
          <div className="row between"><h4>Presets visuais</h4>
            <Menu trigger={p => <Button size="xs" {...p}><MoreHorizontal />Ações</Button>}>
              <button onClick={savePreset}><Save />Salvar preset atual</button>
              <button onClick={exportCfg}><Download />Exportar configuração</button>
              <button onClick={importCfg}><Upload />Importar configuração</button>
              <hr />
              <button className="danger" onClick={async () => { if (await confirm({ title: 'Restaurar configurações originais?', confirmLabel: 'Restaurar', danger: true })) update(a => Object.assign(a, deepClone(DEFAULT_APPEARANCE))); }}><RotateCcw />Restaurar originais</button>
            </Menu>
          </div>
          <div className="preset-grid">
            {d.presets.map(p => {
              const c = p.appearance.colors[p.appearance.mode === 'light' ? 'light' : 'dark'];
              const active = JSON.stringify(p.appearance) === JSON.stringify(draft);
              return (
                <div key={p.id} className={`preset ${active ? 'active' : ''}`} role="button" tabIndex={0} onClick={() => applyPreset(p)} onKeyDown={e => e.key === 'Enter' && applyPreset(p)} aria-label={`Aplicar preset ${p.name}`}>
                  <div className="pv" style={{ background: c.bg }}><i style={{ background: c.card, opacity: p.appearance.glass.enabled ? .8 : 1 }} /><i style={{ background: c.accent }} /><i style={{ background: c.button }} /></div>
                  <span className="row between" style={{ gap: 4 }}>
                    <span className="ellipsis">{p.name}</span>
                    {active && <Check size={12} />}
                    {!p.builtin && (
                      <span onClick={e => e.stopPropagation()}>
                        <Menu width={180} trigger={tp => <button {...tp} className="btn ghost xs icon" style={{ '--h': '18px', width: 18 } as React.CSSProperties} aria-label={`Opções do preset ${p.name}`}><MoreHorizontal size={12} /></button>}>
                          <button onClick={async () => { const n = await prompt({ title: 'Renomear preset', label: 'Nome', initial: p.name, required: true }); if (n) settings.patch(t => { t.presets = t.presets.map(x => (x.id === p.id ? { ...x, name: n } : x)); }); }}><Pencil />Renomear</button>
                          <button onClick={() => settings.patch(t => { t.presets = [...t.presets, { ...deepClone(p), id: uid('preset'), name: `${p.name} (cópia)`, builtin: false }]; })}><Copy />Duplicar</button>
                          <button className="danger" onClick={async () => { if (await confirm({ title: `Excluir preset "${p.name}"?`, danger: true, confirmLabel: 'Excluir' })) settings.patch(t => { t.presets = t.presets.filter(x => x.id !== p.id); }); }}><Trash2 />Excluir</button>
                        </Menu>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ap-section">
          <h4>Tema</h4>
          <Seg label="Modo de tema" value={draft.mode} onChange={v => update(a => { a.mode = v; })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'auto', label: 'Automático' }]} />
          <div className="ap-row"><span>Gradientes de fundo</span><Switch label="Gradientes" checked={draft.gradient} onChange={v => update(a => { a.gradient = v; })} /></div>
        </section>

        <section className="ap-section">
          <h4>Cores · tema {mode === 'dark' ? 'escuro' : 'claro'}</h4>
          <div className="swatch-grid">
            {COLOR_LABELS.map(([k, l]) => (
              <label key={k} className="swatch"><input type="color" className="color-input" value={cs[k] as string} onChange={e => update(a => { (a.colors[mode][k] as string) = e.target.value; })} aria-label={l} />{l}</label>
            ))}
          </div>
          <div className="label">Cores dos gráficos</div>
          <div className="row wrap">{cs.charts.map((c, i) => <input key={i} type="color" className="color-input" value={c} onChange={e => update(a => { a.colors[mode].charts[i] = e.target.value; })} aria-label={`Cor do gráfico ${i + 1}`} />)}</div>
          {contrastRatio < 4.5 && <Notice tone="warning">Contraste texto/fundo de {contrastRatio.toFixed(1)}:1 está abaixo do recomendado (4.5:1). A leitura pode ficar prejudicada.</Notice>}
        </section>

        <section className="ap-section">
          <div className="ap-row"><h4>Glassmorphism</h4><Switch label="Ativar efeitos glass" checked={draft.glass.enabled} onChange={v => update(a => { a.glass.enabled = v; })} /></div>
          {draft.glass.enabled && <>
            {slider('Transparência dos cards', draft.glass.cardAlpha, .1, 1, .01, v => update(a => { a.glass.cardAlpha = v; }))}
            {slider('Opacidade do fundo', draft.glass.bgOpacity, 0, 1, .05, v => update(a => { a.glass.bgOpacity = v; }))}
            {slider('Blur', draft.glass.blur, 0, 48, 1, v => update(a => { a.glass.blur = v; }), 'px')}
            {slider('Saturação', draft.glass.saturation, 100, 220, 5, v => update(a => { a.glass.saturation = v; }), '%')}
            {slider('Opacidade das bordas', draft.glass.borderAlpha, 0, .6, .01, v => update(a => { a.glass.borderAlpha = v; }))}
            {slider('Espessura das bordas', draft.glass.borderWidth, 0, 3, 1, v => update(a => { a.glass.borderWidth = v; }), 'px')}
            {slider('Sombras', draft.glass.shadow, 0, 1, .05, v => update(a => { a.glass.shadow = v; }))}
            {slider('Brilho interno', draft.glass.innerGlow, 0, .2, .01, v => update(a => { a.glass.innerGlow = v; }))}
            {slider('Reflexo (highlight)', draft.glass.highlight, 0, .5, .01, v => update(a => { a.glass.highlight = v; }))}
            {slider('Sidebar', draft.glass.sidebarAlpha, .1, 1, .01, v => update(a => { a.glass.sidebarAlpha = v; }))}
            {slider('Topbar', draft.glass.topbarAlpha, .1, 1, .01, v => update(a => { a.glass.topbarAlpha = v; }))}
            {slider('Modais', draft.glass.modalAlpha, .3, 1, .01, v => update(a => { a.glass.modalAlpha = v; }))}
            {slider('Widgets', draft.glass.widgetAlpha, .1, 1, .01, v => update(a => { a.glass.widgetAlpha = v; }))}
          </>}
        </section>

        <section className="ap-section">
          <h4>Tipografia</h4>
          <div className="ap-row"><span>Fonte</span><Select value={draft.type.family} onChange={e => update(a => { a.type.family = e.target.value; })} options={FONTS} style={{ width: 190 }} aria-label="Família da fonte" /></div>
          <div className="ap-row"><span>Estilo dos títulos</span><Select value={draft.type.titleStyle} onChange={e => update(a => { a.type.titleStyle = e.target.value as Appearance['type']['titleStyle']; })} options={[{ value: 'tight', label: 'Compacto' }, { value: 'normal', label: 'Normal' }, { value: 'uppercase', label: 'Maiúsculas' }]} style={{ width: 190 }} aria-label="Estilo dos títulos" /></div>
          {slider('Texto', draft.type.baseSize, 12, 18, .5, v => update(a => { a.type.baseSize = v; }), 'px')}
          {slider('Títulos', draft.type.titleSize, 18, 40, 1, v => update(a => { a.type.titleSize = v; }), 'px')}
          {slider('Números', draft.type.numberSize, 18, 44, 1, v => update(a => { a.type.numberSize = v; }), 'px')}
          {slider('Peso', draft.type.weight, 400, 700, 100, v => update(a => { a.type.weight = v; }))}
          {slider('Altura das linhas', draft.type.lineHeight, 1.2, 1.9, .05, v => update(a => { a.type.lineHeight = v; }))}
          {slider('Espaçamento letras', draft.type.letterSpacing, -.03, .08, .005, v => update(a => { a.type.letterSpacing = v; }), 'em')}
          {slider('Navegação', draft.type.navSize, 12, 17, .5, v => update(a => { a.type.navSize = v; }), 'px')}
          {slider('Botões', draft.type.buttonSize, 12, 17, .5, v => update(a => { a.type.buttonSize = v; }), 'px')}
        </section>

        <section className="ap-section">
          <h4>Espaçamento e dimensões</h4>
          <Seg label="Densidade" value={draft.space.density} onChange={v => update(a => { a.space.density = v; const p = DENSITY[v]; Object.assign(a.space, { cardPadding: p.cardPadding, gap: p.gap, margin: p.margin, rowHeight: p.rowHeight, topbarHeight: p.topbarHeight }); a.type.baseSize = p.baseSize; })}
            options={[{ value: 'compact', label: 'Compacto' }, { value: 'balanced', label: 'Equilibrado' }, { value: 'comfortable', label: 'Confortável' }]} />
          {slider('Padding dos cards', draft.space.cardPadding, 8, 36, 1, v => update(a => { a.space.cardPadding = v; }), 'px')}
          {slider('Espaço entre widgets', draft.space.gap, 6, 32, 1, v => update(a => { a.space.gap = v; }), 'px')}
          {slider('Margens', draft.space.margin, 10, 56, 1, v => update(a => { a.space.margin = v; }), 'px')}
          {slider('Largura sidebar', draft.space.sidebarWidth, 200, 320, 4, v => update(a => { a.space.sidebarWidth = v; }), 'px')}
          {slider('Altura topbar', draft.space.topbarHeight, 52, 84, 2, v => update(a => { a.space.topbarHeight = v; }), 'px')}
          {slider('Altura dos cards (linha)', draft.space.widgetRow, 70, 130, 2, v => update(a => { a.space.widgetRow = v; }), 'px')}
          {slider('Raio das bordas', draft.space.radius, 0, 32, 1, v => update(a => { a.space.radius = v; }), 'px')}
          {slider('Linhas das tabelas', draft.space.rowHeight, 36, 68, 2, v => update(a => { a.space.rowHeight = v; }), 'px')}
          {slider('Ícones', draft.space.iconSize, 14, 24, 1, v => update(a => { a.space.iconSize = v; }), 'px')}
        </section>

        <section className="ap-section">
          <h4>Acessibilidade e performance</h4>
          <div className="stack-sm"><span>Animações</span>
            <Seg label="Animações" value={draft.a11y.motionPref ?? (draft.a11y.reduceMotion ? 'reduce' : 'system')} onChange={v => update(a => { a.a11y.motionPref = v; a.a11y.reduceMotion = v === 'reduce'; })}
              options={[{ value: 'system', label: 'Seguir o sistema' }, { value: 'full', label: 'Sempre completas' }, { value: 'reduce', label: 'Reduzidas' }]} />
            {(draft.a11y.motionPref ?? 'system') === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches && <Notice tone="warning">Seu sistema pede movimento reduzido, então só fades são exibidos. Escolha "Sempre completas" para ver todas as animações.</Notice>}
          </div>
          <div className="ap-row"><span>Desativar efeitos glass</span><Switch label="Desativar glass" checked={!draft.glass.enabled} onChange={v => update(a => { a.glass.enabled = !v; })} /></div>
          <div className="ap-row"><span>Alto contraste</span><Switch label="Alto contraste" checked={draft.a11y.highContrast} onChange={v => update(a => { a.a11y.highContrast = v; if (v) { a.glass.borderAlpha = Math.max(a.glass.borderAlpha, .6); } })} /></div>
          <div className="ap-row"><span>Simplificar efeitos automaticamente em dispositivos modestos</span><Switch label="Modo leve automático" checked={draft.a11y.autoLite} onChange={v => update(a => { a.a11y.autoLite = v; })} /></div>
        </section>
      </div>
    </Modal>
  );
}
