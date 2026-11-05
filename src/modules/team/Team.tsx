import React, { useState } from 'react';
import { UserPlus, Pencil, Power, Check, X, Monitor, LogOut, Search, Download, Plus, Eye } from 'lucide-react';
import type { RoleKey, User, Action } from '../../types';
import { useTenant } from '../../store/store';
import { useSession, impersonate, hashPassword } from '../../services/auth';
import { team as teamSvc, settings } from '../../services/crm';
import { PageHeader, UserChip } from '../../components/common';
import { Avatar, Badge, Button, Column, DataTable, Field, Input, Modal, Select, Tabs, Notice, Empty, SimBadge } from '../../components/ui';
import { ROLES, ACTION_LABELS, roleOf } from '../../config/permissions';
import { confirm, prompt, toast } from '../../store/ui';
import { download, fmtDateTime, isEmail, normalize, relTime, toCSV, uid } from '../../lib/utils';

export default function Team() {
  const d = useTenant(); const { user, realUser, can } = useSession();
  const admin = can('settings');
  const [tab, setTab] = useState<'users' | 'teams' | 'perms' | 'sessions' | 'audit'>('users');
  const [edit, setEdit] = useState<User | null>(null);
  const [q, setQ] = useState('');
  const columns: Column<User>[] = [
    { key: 'name', label: 'Usuário', sort: u => u.name, render: u => <div className="cell-main"><Avatar name={u.name} color={u.color} /><div style={{ minWidth: 0 }}><div className="t">{u.name}{u.id === user.id && <Badge tone="accent">você</Badge>}</div><div className="s">{u.email}</div></div></div> },
    { key: 'role', label: 'Perfil', sort: u => u.role, render: u => <Badge tone="accent">{roleOf(u.role).label}</Badge> },
    { key: 'team', label: 'Equipe', render: u => <span className="small">{d.teams.find(t => t.id === u.teamId)?.name}</span> },
    { key: 'status', label: 'Status', render: u => u.pending ? <Badge tone="warning">Convite pendente</Badge> : u.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge>Desativado</Badge> },
    { key: 'last', label: 'Último acesso', sort: u => u.lastAccessAt, render: u => <span className="small" title={fmtDateTime(u.lastAccessAt)}>{u.pending ? '—' : relTime(u.lastAccessAt)}</span> },
    { key: 'actions', label: '', render: u => admin ? <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
      {(realUser.role === 'owner' || realUser.role === 'admin') && u.active && <Button size="xs" variant="ghost" icon title="Ver como" aria-label={`Ver como ${u.name}`} onClick={() => { impersonate(u.id); toast('info', `Visualizando como ${u.name}`); }}><Eye /></Button>}
      <Button size="xs" variant="ghost" icon aria-label={`Editar ${u.name}`} onClick={() => setEdit(u)}><Pencil /></Button>
      <Button size="xs" variant="ghost" icon aria-label={u.active ? `Desativar ${u.name}` : `Ativar ${u.name}`} disabled={u.id === realUser.id || u.role === 'owner'} onClick={async () => { if (await confirm({ title: `${u.active ? 'Desativar' : 'Reativar'} ${u.name}?`, body: u.active ? 'O usuário perde o acesso imediatamente. Registros e histórico são mantidos.' : 'O acesso será restabelecido.', danger: u.active, confirmLabel: u.active ? 'Desativar' : 'Reativar' })) { teamSvc.toggleUser(u.id); toast('success', u.active ? 'Usuário desativado' : 'Usuário reativado'); } }}><Power /></Button>
    </div> : null },
  ];
  const audit = d.audit.filter(a => !q || normalize(`${a.detail} ${a.entity} ${d.users.find(u => u.id === a.userId)?.name}`).includes(normalize(q)));
  return (
    <div>
      <PageHeader title="Usuários, equipes e permissões" desc="Convites, perfis de acesso, sessões e auditoria de alterações." crumbs={[{ label: 'Início', to: '/' }, { label: 'Equipe' }]}
        actions={admin && <Button variant="primary" onClick={() => setEdit({ id: uid('u'), name: '', email: '', role: 'seller', teamId: d.teams[0].id, active: true, pending: true, lastAccessAt: new Date().toISOString(), color: '#7FA7B5', title: '', invitedAt: new Date().toISOString() })}><UserPlus />Convidar usuário</Button>} />
      {!admin && <div style={{ marginBottom: 12 }}><Notice>Visualização somente leitura. Apenas Proprietário e Administrador gerenciam usuários.</Notice></div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: 'Usuários', count: d.users.length }, { value: 'teams', label: 'Equipes', count: d.teams.length }, { value: 'perms', label: 'Permissões' }, { value: 'sessions', label: 'Sessões', count: d.sessions.length }, { value: 'audit', label: 'Auditoria', count: d.audit.length }]} />
      {tab === 'users' && <div className="card" style={{ padding: 6 }}><DataTable rows={d.users} columns={columns} pageSize={15} /></div>}
      {tab === 'teams' && (
        <div className="stack">
          {admin && <Button style={{ alignSelf: 'flex-start' }} onClick={async () => { const n = await prompt({ title: 'Nova equipe', label: 'Nome da equipe', required: true }); if (n) { settings.patch(t => { t.teams = [...t.teams, { id: uid('team'), name: n, department: 'Comercial' }]; }, `Criou equipe ${n}`); toast('success', 'Equipe criada'); } }}><Plus />Nova equipe</Button>}
          <div className="grid g3">{d.teams.map(t => {
            const members = d.users.filter(u => u.teamId === t.id);
            return <div key={t.id} className="card stack-sm"><div className="row between"><strong>{t.name}</strong><Badge>{t.department}</Badge></div><span className="xs muted">Líder: {d.users.find(u => u.id === t.leadId)?.name ?? '—'}</span>
              <div className="list">{members.map(m => <div key={m.id} className="list-item"><UserChip id={m.id} /><span className="flex1" /><Badge>{roleOf(m.role).label}</Badge></div>)}</div>
              {!members.length && <span className="small muted">Sem membros.</span>}</div>;
          })}</div>
        </div>
      )}
      {tab === 'perms' && (
        <div className="card" style={{ padding: 6 }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Permissão</th>{ROLES.map(r => <th key={r.key} style={{ textAlign: 'center' }} title={r.description}>{r.label}</th>)}</tr></thead>
            <tbody>{(Object.keys(ACTION_LABELS) as Action[]).map(a => (
              <tr key={a}><td className="strong small">{ACTION_LABELS[a]}</td>{ROLES.map(r => <td key={r.key} style={{ textAlign: 'center' }}>{r.perms[a] ? <Check size={16} color="var(--success)" aria-label="Permitido" /> : <X size={16} color="var(--text2)" opacity={.4} aria-label="Negado" />}</td>)}</tr>
            ))}</tbody>
          </table></div>
          <p className="xs muted" style={{ padding: 10 }}>Dica: use "Ver como" (menu do usuário ou ícone de olho) para experimentar a interface com cada perfil. Perfis sem "Dados de outras equipes" veem apenas registros da própria equipe.</p>
        </div>
      )}
      {tab === 'sessions' && (
        <div className="card">{d.sessions.length === 0 ? <Empty compact title="Nenhuma sessão ativa" /> : <div className="list">{d.sessions.map(s => (
          <div key={s.id} className="list-item"><span className="icon-bubble neutral"><Monitor /></span><div className="flex1 small"><strong>{d.users.find(u => u.id === s.userId)?.name}</strong> · {s.device}<div className="xs muted">{s.location} · iniciada {relTime(s.startedAt)}</div></div>
            {s.current ? <Badge tone="success">Sessão atual</Badge> : admin && <Button size="xs" onClick={async () => { if (await confirm({ title: 'Encerrar esta sessão?', body: 'O dispositivo será desconectado.', danger: true, confirmLabel: 'Encerrar' })) { teamSvc.endSession(s.id); toast('success', 'Sessão encerrada'); } }}><LogOut />Encerrar</Button>}
          </div>
        ))}</div>}<p className="xs muted" style={{ marginTop: 8 }}>Controle de sessões demonstrativo <SimBadge>auth simulada</SimBadge></p></div>
      )}
      {tab === 'audit' && (
        <div className="card">
          <div className="toolbar"><div className="input-icon"><Search /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar auditoria…" aria-label="Filtrar auditoria" /></div><span className="flex1" /><Button size="sm" onClick={() => { download(`auditoria-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(audit.map(a => ({ data: a.at, usuario: d.users.find(u => u.id === a.userId)?.name, acao: a.action, entidade: a.entity, detalhe: a.detail })))); toast('success', 'Auditoria exportada'); }} disabled={!can('export')}><Download />Exportar</Button></div>
          {audit.length === 0 ? <Empty compact title="Nenhum registro" /> : <div className="list">{audit.slice(0, 120).map(a => <div key={a.id} className="list-item"><UserChip id={a.userId} /><div className="flex1 small">{a.detail}<div className="xs muted">{a.entity} · {a.action}</div></div><span className="xs muted" title={fmtDateTime(a.at)}>{relTime(a.at)}</span></div>)}</div>}
        </div>
      )}
      {edit && <UserModal u={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserModal({ u: init, onClose }: { u: User; onClose: () => void }) {
  const d = useTenant(); const { realUser } = useSession();
  const [u, setU] = useState(init); const [err, setErr] = useState<Record<string, string>>({});
  const [pw, setPw] = useState('');
  const isNew = !d.users.some(x => x.id === u.id);
  const save = async () => {
    const e: Record<string, string> = {};
    if (!u.name.trim()) e.name = 'Informe o nome.';
    if (!u.email.trim() || !isEmail(u.email)) e.email = 'Informe um e-mail válido.';
    if (d.users.some(x => x.id !== u.id && normalize(x.email) === normalize(u.email))) e.email = 'Já existe um usuário com este e-mail.';
    if (u.role === 'owner' && realUser.role !== 'owner') e.role = 'Apenas o proprietário pode atribuir este perfil.';
    if (isNew && pw.length < 6) e.pw = 'Defina uma senha provisória com pelo menos 6 caracteres.';
    if (!isNew && pw && pw.length < 6) e.pw = 'Use pelo menos 6 caracteres.';
    setErr(e); if (Object.keys(e).length) return;
    teamSvc.saveUser({ ...u, pending: false, ...(pw ? { passwordHash: await hashPassword(pw) } : {}) });
    toast(isNew ? 'warning' : 'success', isNew ? 'Usuário criado' : 'Usuário atualizado', isNew ? `E-mail transacional não conectado: envie a ${u.email} o e-mail e a senha provisória por outro canal.` : pw ? 'Senha redefinida.' : undefined);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'Convidar usuário' : `Editar ${init.name}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{isNew ? 'Enviar convite' : 'Salvar'}</Button></>}>
      <div className="form-grid">
        <Field label="Nome" required error={err.name}><Input value={u.name} onChange={e => setU({ ...u, name: e.target.value })} autoFocus /></Field>
        <Field label="E-mail" required error={err.email}><Input type="email" value={u.email} onChange={e => setU({ ...u, email: e.target.value })} /></Field>
        <Field label="Cargo"><Input value={u.title} onChange={e => setU({ ...u, title: e.target.value })} /></Field>
        <Field label="Equipe"><Select value={u.teamId} onChange={e => setU({ ...u, teamId: e.target.value })} options={d.teams.map(t => ({ value: t.id, label: t.name }))} /></Field>
        <Field label={isNew ? 'Senha provisória' : 'Redefinir senha'} required={isNew} error={err.pw} hint={isNew ? undefined : 'Deixe vazio para manter a atual'}><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Perfil de acesso" error={err.role} className="full"><Select value={u.role} onChange={e => setU({ ...u, role: e.target.value as RoleKey })} options={ROLES.map(r => ({ value: r.key, label: `${r.label} — ${r.description}` }))} /></Field>
      </div>
    </Modal>
  );
}
