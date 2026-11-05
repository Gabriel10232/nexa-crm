import React, { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, UserPlus, Sparkles } from 'lucide-react';
import { Avatar, Button, Field, Input, Notice } from '../../components/ui';
import { signIn, signUp, startSession, enterDemo, useSession, hasAccounts } from '../../services/auth';
import { store, useStore } from '../../store/store';
import { roleOf } from '../../config/permissions';
import { toast } from '../../store/ui';
import { isEmail } from '../../lib/utils';

export default function Login() {
  const { session } = useSession();
  const nav = useNavigate(); const loc = useLocation();
  const tenants = useStore(s => s.tenants);
  const firstAccess = !tenants.some(t => t.data.users.length > 0);
  const [mode, setMode] = useState<'login' | 'signup'>(firstAccess ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const demo = tenants.find(t => t.id === 'org_aurora');
  if (session) return <Navigate to="/" replace />;
  const from = (loc.state as { from?: string } | null)?.from ?? '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (mode === 'signup' && !name.trim()) er.name = 'Informe seu nome.';
    if (!email.trim()) er.email = 'Informe o e-mail.'; else if (!isEmail(email)) er.email = 'E-mail inválido.';
    if (!password) er.password = 'Informe a senha.'; else if (mode === 'signup' && password.length < 6) er.password = 'Use pelo menos 6 caracteres.';
    if (mode === 'signup' && password !== confirmPw) er.confirm = 'As senhas não conferem.';
    setErrors(er); if (Object.keys(er).length) return;
    setLoading(true);
    if (mode === 'signup') {
      if (hasAccounts() && store.get().tenants.some(t => t.data.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase()))) { setLoading(false); setErrors({ email: 'Já existe uma conta com este e-mail.' }); return; }
      await signUp(name, email, password);
      setLoading(false); toast('success', 'Conta criada', 'Vamos configurar sua empresa.'); nav('/onboarding', { replace: true });
      return;
    }
    const r = await signIn(email, password);
    setLoading(false);
    if (r.ok) { toast('success', 'Bem-vindo(a) de volta!'); nav(from, { replace: true }); } else setErrors({ form: r.error });
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="row"><div className="brand-mark">N</div><strong style={{ fontSize: 18, letterSpacing: '-.02em' }}>NEXA CRM</strong></div>
        <div>
          <h1 className="rise">Vendas, clientes e indicadores em um só lugar.</h1>
          <p className="muted rise" style={{ marginTop: 14, maxWidth: 500, fontSize: 15, animationDelay: '80ms' }}>Pipeline visual, automações, Copilot e um workspace que você monta do seu jeito.</p>
        </div>
        <p className="xs muted">Seus dados ficam salvos neste navegador até um banco de dados ser conectado.</p>
      </section>
      <section className="auth-form">
        <div className="glass auth-card stack pop-in">
          <div>
            <h2 style={{ fontSize: 22 }}>{mode === 'signup' ? (firstAccess ? 'Criar sua conta' : 'Criar conta') : 'Entrar'}</h2>
            <p className="muted small" style={{ marginTop: 4 }}>{mode === 'signup' ? 'Primeiro acesso: você será o proprietário da organização.' : 'Acesse com seu e-mail e senha.'}</p>
          </div>
          <form className="stack" onSubmit={submit} noValidate>
            {mode === 'signup' && <Field label="Nome completo" required error={errors.name}><Input value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoFocus /></Field>}
            <Field label="E-mail" required error={errors.email}><Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" autoFocus={mode === 'login'} /></Field>
            <Field label="Senha" required error={errors.password}>
              <div style={{ position: 'relative' }}>
                <Input type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
                <Button variant="ghost" size="sm" icon type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} style={{ position: 'absolute', right: 4, top: 4 }}>{show ? <EyeOff /> : <Eye />}</Button>
              </div>
            </Field>
            {mode === 'signup' && <Field label="Confirmar senha" required error={errors.confirm}><Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} /></Field>}
            {errors.form && <Notice tone="danger">{errors.form}</Notice>}
            <Button variant="primary" type="submit" loading={loading}>{!loading && (mode === 'signup' ? <UserPlus /> : <LogIn />)}{mode === 'signup' ? 'Criar conta e começar' : 'Entrar'}</Button>
            {mode === 'login' && <button type="button" className="btn ghost sm" onClick={() => toast('info', 'Recuperação de senha', 'E-mail transacional não conectado. Peça ao administrador para redefinir seu acesso.')}>Esqueci minha senha</button>}
            {!firstAccess && <button type="button" className="btn ghost sm" onClick={() => { setMode(m => (m === 'login' ? 'signup' : 'login')); setErrors({}); }}>{mode === 'login' ? 'Criar uma nova conta' : 'Já tenho conta — entrar'}</button>}
          </form>
          <div className="divider" />
          {demo ? (
            <>
              <span className="label">Acesso rápido · demonstração com dados fictícios</span>
              <div className="demo-users">
                {demo.data.users.filter(u => u.active).slice(0, 10).map(u => (
                  <button key={u.id} className="demo-user" onClick={() => { startSession(demo.id, u.id); toast('success', `Entrou como ${u.name}`, roleOf(u.role).label); nav(from, { replace: true }); }}>
                    <Avatar name={u.name} color={u.color} size="sm" />
                    <span style={{ minWidth: 0 }}><span className="ellipsis strong small" style={{ display: 'block' }}>{u.name}</span><span className="xs muted">{roleOf(u.role).label}</span></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => { enterDemo(); toast('info', 'Modo demonstração', 'Organizações fictícias adicionadas. Sua organização continua vazia.'); nav('/', { replace: true }); }}><Sparkles />Explorar uma demonstração com dados fictícios</button>
          )}
        </div>
      </section>
    </div>
  );
}
