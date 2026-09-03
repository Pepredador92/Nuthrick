import { ArrowLeft, Eye, EyeOff, LoaderCircle, MailCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field, Input } from '@/src/components/ui/FormField';
import { Logo } from '@/src/components/ui/Logo';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/features/auth/AuthProvider';

function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <main className="grid min-h-screen bg-[#f7f8f4] lg:grid-cols-[1fr_.9fr]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12"><h1 className="text-4xl font-semibold tracking-[-.04em] text-[#17312c]">{title}</h1><p className="mt-3 leading-7 text-[#687672]">{subtitle}</p>{children}</div>
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#64736e]"><ArrowLeft size={16} />Volver al inicio</Link>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#173d36] p-12 text-white lg:flex lg:flex-col lg:justify-end"><div className="absolute -right-20 -top-20 h-96 w-96 rounded-full border-[80px] border-[#f0b85e]/20" /><div className="absolute bottom-28 left-20 h-44 w-44 rounded-full bg-[#81ae9e]/20 blur-2xl" /><div className="relative max-w-lg"><span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#f2c47a]">Nuthrick para nutriólogos</span><p className="mt-6 text-4xl font-semibold leading-tight tracking-[-.04em]">Tu práctica merece herramientas tan cuidadas como la atención que brindas.</p><div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"><p className="text-sm text-white/65">Incluido en esta versión</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><span>✓ Perfil profesional</span><span>✓ Página pública</span><span>✓ Disponibilidad</span><span>✓ Seguridad por cuenta</span></div></div></div></aside>
    </main>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const { user, profile, configurationReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (user) return <Navigate to={profile?.onboarding_completed ? '/app' : '/onboarding'} replace />;

  const handleGoogle = async () => {
    setError('');
    if (!configurationReady) return setError('Conecta el nuevo proyecto de Supabase para habilitar el acceso.');
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (authError) setError(authError.message);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!configurationReady) return setError('Conecta el nuevo proyecto de Supabase para habilitar el acceso.');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    setBusy(true);
    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        const destination = (location.state as { from?: string } | null)?.from ?? '/app';
        navigate(destination, { replace: true });
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (authError) throw authError;
        if (data.session) navigate('/onboarding', { replace: true });
        else setConfirmationSent(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible completar el acceso.');
    } finally {
      setBusy(false);
    }
  };

  if (confirmationSent) return <AuthShell title="Revisa tu correo" subtitle="Te enviamos un enlace para confirmar tu cuenta."><div className="mt-8 rounded-3xl border border-[#dce5df] bg-white p-7 text-center"><MailCheck className="mx-auto text-[#4a7867]" size={36} /><p className="mt-4 font-semibold">Confirma {email}</p><p className="mt-2 text-sm leading-6 text-[#6d7a76]">Al abrir el enlace podrás completar tu perfil inicial.</p></div></AuthShell>;

  return (
    <AuthShell title={isLogin ? 'Qué gusto verte de nuevo' : 'Crea tu espacio profesional'} subtitle={isLogin ? 'Inicia sesión para continuar con tu práctica.' : 'Empieza gratis. Sólo te tomará un momento.'}>
      <button type="button" onClick={handleGoogle} className="mt-9 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#d9e1dc] bg-white px-5 py-3.5 text-sm font-semibold shadow-sm transition hover:border-[#b9c7bf]"><span className="grid h-6 w-6 place-items-center rounded-full border border-[#d8dfdb] font-bold text-[#4285f4]">G</span>Continuar con Google <span className="rounded-full bg-[#f7edd9] px-2 py-0.5 text-[10px] text-[#8c6527]">Recomendado</span></button>
      <div className="my-7 flex items-center gap-3 text-xs text-[#8a9691]"><span className="h-px flex-1 bg-[#dfe5e1]" />o continúa con email<span className="h-px flex-1 bg-[#dfe5e1]" /></div>
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Email" name="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" /></Field>
        <Field label="Contraseña" name="password"><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" className="pr-12" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#78847f]" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
        {isLogin && <div className="text-right"><Link to="/forgot-password" className="text-sm font-semibold text-[#4a7465]">¿Olvidaste tu contraseña?</Link></div>}
        {error && <p role="alert" className="rounded-xl bg-[#fff1ed] px-4 py-3 text-sm text-[#934938]">{error}</p>}
        <button disabled={busy} className="nuth-button w-full justify-center py-3.5">{busy && <LoaderCircle className="animate-spin" size={17} />}{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</button>
      </form>
      <p className="mt-7 text-center text-sm text-[#6d7a76]">{isLogin ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'} <Link to={isLogin ? '/register' : '/login'} className="font-semibold text-[#315e50]">{isLogin ? 'Crear cuenta' : 'Iniciar sesión'}</Link></p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { configurationReady } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!configurationReady) return setError('Conecta el nuevo proyecto de Supabase para habilitar la recuperación.');
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (authError) setError(authError.message); else setSent(true);
  };
  return <AuthShell title="Recupera tu acceso" subtitle="Te enviaremos un enlace seguro para elegir una nueva contraseña.">{sent ? <div className="mt-8 rounded-2xl bg-[#edf5f0] p-5 text-sm text-[#3f6759]">Si existe una cuenta para {email}, recibirás las instrucciones en unos minutos.</div> : <form className="mt-8 space-y-5" onSubmit={submit}><Field label="Email" name="email"><Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-[#934938]">{error}</p>}<button className="nuth-button w-full justify-center py-3.5">Enviar enlace</button></form>}</AuthShell>;
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 8) return setMessage('Usa al menos 8 caracteres.'); const { error } = await supabase.auth.updateUser({ password }); setMessage(error ? error.message : 'Contraseña actualizada. Ya puedes iniciar sesión.'); };
  return <AuthShell title="Nueva contraseña" subtitle="Elige una contraseña que no utilices en otros servicios."><form className="mt-8 space-y-5" onSubmit={submit}><Field label="Nueva contraseña" name="password"><Input id="password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></Field>{message && <p role="status" className="text-sm text-[#526c62]">{message}</p>}<button className="nuth-button w-full justify-center py-3.5">Guardar contraseña</button></form></AuthShell>;
}

export function AuthCallbackPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && user) navigate(profile?.onboarding_completed ? '/app' : '/onboarding', { replace: true }); }, [loading, navigate, profile, user]);
  return <main className="grid min-h-screen place-items-center bg-[#f7f8f4]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[#4d7567]" /><p className="mt-4 text-sm text-[#687672]">Preparando tu cuenta…</p></div></main>;
}
