import React, { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Avatar, Button, Field, Input, Notice, Badge } from '../../components/ui';
import { signIn, startSession, useSession } from '../../services/auth';
import { store } from '../../store/store';
import { roleOf } from '../../config/permissions';
import { toast } from '../../store/ui';

const PALETTE = ['#06141B', '#11212D', '#253745', '#4A5C6A', '#9BA8AB', '#CCD0CF'];

export default function Login() {
  const { session } = useSession();
  const nav = useNavigate(); const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const tenant = store.get().tenants[0];
  if (session) return <Navigate to="/" replace />;
  const from = (loc.state as { from?: string } | null)?.from ?? '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    const r = await signIn(email, password);
    setLoading(false);
    if (r.ok) { toast('success', 'Bem-vindo(a) de volta!'); nav(from, { replace: true }); } else setError(r.error);
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="row"><div className="brand-mark">N</div><strong style={{ fontSize: 18, letterSpacing: '-.02em' }}>NEXA CRM</strong></div>
        <div>
          <h1>Vendas, clientes e indicadores em um só lugar.</h1>
          <p className="muted" style={{ marginTop: 14, maxWidth: 500, fontSize: 15 }}>Pipeline visual, automações, Copilot e um workspace que você monta do seu jeito.</p>
          <div className="auth-pills" aria-hidden>
            {PALETTE.map((c, i) => (
              <div key={c} className="auth-pill" style={{ background: c, color: i < 4 ? '#CCD0CF' : '#06141B', marginTop: i ? -22 : 0, zIndex: 10 + i, position: 'relative' }}>{c}</div>
            ))}
          </div>
        </div>
        <p className="xs muted">Ambiente de demonstração · dados fictícios · nenhuma informação real é usada.</p>
      </section>
      <section className="auth-form">
        <div className="glass auth-card stack">
          <div><h2 style={{ fontSize: 22 }}>Entrar</h2><p className="muted small" style={{ marginTop: 4 }}>Use um perfil de demonstração ou seu e-mail.</p></div>
          <form className="stack" onSubmit={submit} noValidate>
            <Field label="E-mail" required error={error && !email ? 'Informe o e-mail.' : undefined}><Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" /></Field>
            <Field label="Senha" required hint="Ambiente demo: a senha de todos os perfis é demo123">
              <div style={{ position: 'relative' }}>
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
                <Button variant="ghost" size="sm" icon type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} style={{ position: 'absolute', right: 4, top: 4 }}>{show ? <EyeOff /> : <Eye />}</Button>
              </div>
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button variant="primary" type="submit" loading={loading}>{!loading && <LogIn />}Entrar</Button>
            <button type="button" className="btn ghost sm" onClick={() => toast('info', 'Recuperação de senha (simulada)', 'Sem e-mail transacional conectado. Em produção, um link seria enviado.')}>Esqueci minha senha</button>
          </form>
          <div className="divider" />
          <div className="row between"><span className="label"><ShieldCheck size={14} />Acesso rápido por perfil</span><Badge>{tenant.name}</Badge></div>
          <div className="demo-users">
            {tenant.data.users.filter(u => u.active).slice(0, 10).map(u => (
              <button key={u.id} className="demo-user" onClick={() => { startSession(tenant.id, u.id); toast('success', `Entrou como ${u.name}`, roleOf(u.role).label); nav(from, { replace: true }); }}>
                <Avatar name={u.name} color={u.color} size="sm" />
                <span style={{ minWidth: 0 }}><span className="ellipsis strong small" style={{ display: 'block' }}>{u.name}</span><span className="xs muted">{roleOf(u.role).label}</span></span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
