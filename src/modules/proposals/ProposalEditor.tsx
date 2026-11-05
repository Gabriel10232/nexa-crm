import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, Send, Printer, Eye, Copy, ArrowLeft } from 'lucide-react';
import type { Proposal, ProposalItem } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { proposals as propSvc, proposalTotals } from '../../services/crm';
import { simulateOutbound } from '../../services/integrations';
import { PageHeader } from '../../components/common';
import { Badge, Button, Empty, Field, Input, Modal, Select, Textarea, Notice, SimBadge } from '../../components/ui';
import { PROPOSAL_STATUS } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { fmtDate, fromInputDate, money, toInputDate, uid } from '../../lib/utils';

export default function ProposalEditor() {
  const { id } = useParams(); const [sp] = useSearchParams(); const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate();
  const existing = d.proposals.find(p => p.id === id);
  const deal = d.deals.find(x => x.id === (existing?.dealId ?? sp.get('deal')));
  const initial = useMemo<Proposal>(() => existing ?? {
    id: uid('pr'), number: `PRO-${new Date().getFullYear()}-${String(100 + d.proposals.length + 1).padStart(4, '0')}`, title: deal?.name ?? '', dealId: deal?.id, companyId: deal?.companyId, personId: deal?.personId, ownerId: user.id,
    items: [{ id: uid('it'), description: deal?.product ?? '', qty: 1, price: deal?.value ?? 0, discount: 0 }], discount: 0, tax: 0, validUntil: new Date(Date.now() + 15 * 864e5).toISOString(),
    paymentTerms: '30 dias após assinatura', notes: 'Valores válidos até a data de validade.', status: 'rascunho', template: 'moderno', createdAt: new Date().toISOString(),
  }, [existing?.id]); // eslint-disable-line
  const [p, setP] = useState<Proposal>(initial);
  const [err, setErr] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const t = proposalTotals(p);
  const dirty = JSON.stringify(p) !== JSON.stringify(existing ?? initial) || !existing;
  const ro = !can('edit');
  if (id !== 'new' && !existing) return <div className="card"><Empty title="Proposta não encontrada" action={<Button onClick={() => nav('/proposals')}>Voltar</Button>} /></div>;

  const setItem = (iid: string, patch: Partial<ProposalItem>) => setP({ ...p, items: p.items.map(i => (i.id === iid ? { ...i, ...patch } : i)) });
  const validate = () => {
    const e: string[] = [];
    if (!p.title.trim()) e.push('Informe o título da proposta.');
    if (!p.companyId && !p.personId) e.push('Selecione o cliente (empresa ou pessoa).');
    if (!p.items.length) e.push('Adicione ao menos um item.');
    if (p.items.some(i => !i.description.trim() || i.qty <= 0 || i.price < 0)) e.push('Itens precisam de descrição, quantidade > 0 e preço válido.');
    if (p.items.some(i => i.discount < 0 || i.discount > 100) || p.discount < 0 || p.discount > 100) e.push('Descontos devem estar entre 0% e 100%.');
    if (!p.validUntil) e.push('Informe a validade.');
    setErr(e); return !e.length;
  };
  const save = (status?: Proposal['status']) => {
    if (!validate()) return false;
    const next = { ...p, status: status ?? p.status, sentAt: status === 'enviada' ? new Date().toISOString() : p.sentAt };
    propSvc.save(next); setP(next);
    if (!existing) nav(`/proposals/${next.id}`, { replace: true });
    return true;
  };
  const send = async () => {
    const person = d.people.find(x => x.id === p.personId);
    if (!save('enviada')) return;
    const r = await simulateOutbound('email', person?.email ?? 'cliente');
    toast('warning', 'Proposta marcada como enviada', `${r.message} Use "Imprimir / PDF" para gerar o arquivo.`);
  };
  const company = d.companies.find(c => c.id === p.companyId); const person = d.people.find(x => x.id === p.personId);

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Propostas', to: '/proposals' }, { label: existing ? p.number : 'Nova proposta' }]} title={existing ? `${p.number}` : 'Nova proposta'}
        actions={<>
          <Button onClick={() => nav(-1)}><ArrowLeft />Voltar</Button>
          <Button onClick={() => setPreview(true)}><Eye />Pré-visualizar</Button>
          {existing && can('create') && <Button onClick={() => { const c = { ...p, id: uid('pr'), number: `${p.number}-B`, status: 'rascunho' as const, createdAt: new Date().toISOString(), sentAt: undefined, signedBy: undefined }; propSvc.save(c); nav(`/proposals/${c.id}`); toast('success', 'Proposta duplicada'); }}><Copy />Duplicar</Button>}
          {!ro && <Button onClick={() => save() && toast('success', 'Proposta salva')} disabled={!dirty}><Save />Salvar</Button>}
          {!ro && <Button variant="primary" onClick={send}><Send />Enviar</Button>}
        </>}>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}><Badge tone={PROPOSAL_STATUS[p.status].tone} dot>{PROPOSAL_STATUS[p.status].label}</Badge>{p.sentAt && <span className="xs muted">Enviada em {fmtDate(p.sentAt)}</span>}<SimBadge>PDF e e-mail: estrutura pronta, envio simulado</SimBadge></div>
      </PageHeader>
      {err.length > 0 && <div style={{ marginBottom: 12 }}><Notice tone="danger"><strong>Corrija antes de salvar:</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{err.map(e => <li key={e}>{e}</li>)}</ul></Notice></div>}
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
        <div className="stack">
          <div className="card form-grid">
            <Field label="Título" required className="full"><Input value={p.title} onChange={e => setP({ ...p, title: e.target.value })} disabled={ro} /></Field>
            <Field label="Empresa"><Select value={p.companyId ?? ''} onChange={e => setP({ ...p, companyId: e.target.value || undefined, personId: undefined })} placeholder="—" options={d.companies.map(c => ({ value: c.id, label: c.tradeName }))} disabled={ro} /></Field>
            <Field label="Contato"><Select value={p.personId ?? ''} onChange={e => setP({ ...p, personId: e.target.value || undefined })} placeholder="—" options={d.people.filter(x => !p.companyId || x.companyId === p.companyId).map(x => ({ value: x.id, label: x.name }))} disabled={ro} /></Field>
            <Field label="Oportunidade"><Select value={p.dealId ?? ''} onChange={e => setP({ ...p, dealId: e.target.value || undefined })} placeholder="—" options={d.deals.filter(x => x.status === 'open' && (!p.companyId || x.companyId === p.companyId)).map(x => ({ value: x.id, label: x.name }))} disabled={ro} /></Field>
            <Field label="Template"><Select value={p.template} onChange={e => setP({ ...p, template: e.target.value })} options={[{ value: 'moderno', label: 'Moderno' }, { value: 'classico', label: 'Clássico' }, { value: 'enxuto', label: 'Enxuto' }]} disabled={ro} /></Field>
          </div>
          <div className="card">
            <div className="card-head"><h3>Produtos e serviços</h3>{!ro && <Button size="sm" onClick={() => setP({ ...p, items: [...p.items, { id: uid('it'), description: '', qty: 1, price: 0, discount: 0 }] })}><Plus />Item</Button>}</div>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Descrição</th><th style={{ width: 80 }}>Qtd</th><th style={{ width: 130 }}>Preço</th><th style={{ width: 90 }}>Desc. %</th><th style={{ width: 120, textAlign: 'right' }}>Subtotal</th><th /></tr></thead>
              <tbody>{p.items.map(i => (
                <tr key={i.id}>
                  <td><Input value={i.description} onChange={e => setItem(i.id, { description: e.target.value })} list="prod-list" aria-label="Descrição" disabled={ro} /></td>
                  <td><Input type="number" min={1} value={i.qty} onChange={e => setItem(i.id, { qty: Number(e.target.value) })} aria-label="Quantidade" disabled={ro} /></td>
                  <td><Input type="number" min={0} step={100} value={i.price} onChange={e => setItem(i.id, { price: Number(e.target.value) })} aria-label="Preço" disabled={ro} /></td>
                  <td><Input type="number" min={0} max={100} value={i.discount} onChange={e => setItem(i.id, { discount: Number(e.target.value) })} aria-label="Desconto" disabled={ro} /></td>
                  <td style={{ textAlign: 'right' }} className="num strong">{money(i.qty * i.price * (1 - i.discount / 100))}</td>
                  <td>{!ro && <Button size="xs" variant="ghost" icon onClick={() => setP({ ...p, items: p.items.filter(x => x.id !== i.id) })} aria-label="Remover item"><Trash2 /></Button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <datalist id="prod-list">{d.org.products.map(x => <option key={x} value={x} />)}</datalist>
          </div>
          <div className="card form-grid">
            <Field label="Condições de pagamento"><Input value={p.paymentTerms} onChange={e => setP({ ...p, paymentTerms: e.target.value })} disabled={ro} /></Field>
            <Field label="Validade" required><Input type="date" value={toInputDate(p.validUntil)} onChange={e => setP({ ...p, validUntil: fromInputDate(e.target.value) ?? '' })} disabled={ro} /></Field>
            <Field label="Observações" className="full"><Textarea value={p.notes ?? ''} onChange={e => setP({ ...p, notes: e.target.value })} rows={3} disabled={ro} /></Field>
          </div>
        </div>
        <div className="stack">
          <div className="card stack-sm">
            <Field label="Desconto geral (%)"><Input type="number" min={0} max={100} value={p.discount} onChange={e => setP({ ...p, discount: Number(e.target.value) })} disabled={ro} /></Field>
            <Field label="Impostos (%)"><Input type="number" min={0} max={50} step={.25} value={p.tax} onChange={e => setP({ ...p, tax: Number(e.target.value) })} disabled={ro} /></Field>
            <div className="divider" />
            <div className="row between small"><span>Subtotal</span><span className="num">{money(t.subtotal)}</span></div>
            <div className="row between small"><span>Desconto</span><span className="num">− {money(t.discount)}</span></div>
            <div className="row between small"><span>Impostos</span><span className="num">+ {money(t.tax)}</span></div>
            <div className="row between"><strong>Total</strong><strong className="num" style={{ fontSize: 22 }}>{money(t.total)}</strong></div>
          </div>
          <div className="card stack-sm">
            <Field label="Status"><Select value={p.status} disabled={ro} onChange={async e => { const s = e.target.value as Proposal['status']; if (s === 'aceita' && !(await confirm({ title: 'Marcar como aceita?', body: 'Registra a aceitação do cliente na timeline.', confirmLabel: 'Confirmar' }))) return; const next = { ...p, status: s, signedBy: s === 'aceita' ? person?.name ?? company?.tradeName : p.signedBy }; setP(next); if (existing) { propSvc.save(next); toast('success', `Status: ${PROPOSAL_STATUS[s].label}`); } }} options={Object.entries(PROPOSAL_STATUS).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
            <Button onClick={() => setPreview(true)}><Printer />Imprimir / PDF</Button>
          </div>
        </div>
      </div>
      {preview && (
        <Modal open onClose={() => setPreview(false)} size="xl" title="Pré-visualização" className="print-only-doc" footer={<><Button onClick={() => setPreview(false)}>Fechar</Button><Button variant="primary" onClick={() => window.print()}><Printer />Imprimir / salvar PDF</Button></>}>
          <div className="doc">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="row">{d.org.logo ? <img src={d.org.logo} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} /> : <div style={{ width: 48, height: 48, borderRadius: 12, background: '#11212D', color: '#CCD0CF', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{d.org.name[0]}</div>}<div><strong>{d.org.name}</strong><div style={{ color: '#4A5C6A', fontSize: 12 }}>Proposta comercial</div></div></div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#4A5C6A' }}><strong style={{ color: '#06141B' }}>{p.number}</strong><br />Emitida em {fmtDate(p.createdAt)}<br />Válida até {fmtDate(p.validUntil)}</div>
            </div>
            <h2 style={{ marginTop: 28 }}>{p.title || 'Sem título'}</h2>
            <p style={{ color: '#4A5C6A', marginTop: 6 }}>Para: <strong style={{ color: '#06141B' }}>{company?.legalName ?? person?.name ?? '—'}</strong>{person && company ? ` · A/C ${person.name}` : ''}</p>
            <table><thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Desc.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
              <tbody>{p.items.map(i => <tr key={i.id}><td>{i.description}</td><td>{i.qty}</td><td>{money(i.price)}</td><td>{i.discount}%</td><td style={{ textAlign: 'right' }}>{money(i.qty * i.price * (1 - i.discount / 100))}</td></tr>)}</tbody></table>
            <div className="tot"><span>Subtotal</span><span>{money(t.subtotal)}</span><span>Desconto ({p.discount}%)</span><span>− {money(t.discount)}</span><span>Impostos ({p.tax}%)</span><span>+ {money(t.tax)}</span><strong>Total</strong><strong>{money(t.total)}</strong></div>
            <p style={{ marginTop: 20 }}><strong>Condições de pagamento:</strong> {p.paymentTerms}</p>
            {p.notes && <p style={{ marginTop: 6, color: '#4A5C6A' }}>{p.notes}</p>}
            <div className="sig"><div>{d.org.name}<br />{d.users.find(u => u.id === p.ownerId)?.name}</div><div>{p.signedBy ? `Aceito por ${p.signedBy}` : 'Assinatura do cliente'}</div></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
