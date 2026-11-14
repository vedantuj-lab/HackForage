import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../services/api.ts';
import { AuthUser } from '../types/hackforge.ts';

interface AuthPagesProps {
  initialMode: 'login' | 'register' | 'forgot' | 'reset';
  onBackHome: () => void;
  onSuccess: (user?: AuthUser) => void;
}

const DEMO_ACCOUNTS = [
  { label: 'Admin Console', email: 'admin@hackforge.demo', role: 'ADMIN' },
  { label: 'Team Leader (Team Alpha)', email: 'leader@hackforge.demo', role: 'TEAM_LEADER' },
  { label: 'Participant 1 (AI/ML)', email: 'participant1@hackforge.demo', role: 'PARTICIPANT' },
  { label: 'Participant 2 (UI/UX)', email: 'participant2@hackforge.demo', role: 'PARTICIPANT' },
  { label: 'Participant 3 (Full-Stack)', email: 'participant3@hackforge.demo', role: 'PARTICIPANT' },
];

export const AuthPages: React.FC<AuthPagesProps> = ({ initialMode, onBackHome, onSuccess }) => {
  const { login, register, signInWithGoogle, pushToast } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [institution, setInstitution] = useState('');
  const [location, setLocation] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const loggedIn = await login(email, password);
      pushToast('success', 'Signed in to HackForge.');
      onSuccess(loggedIn);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setEmail(demoEmail);
    setPassword('HackForge@2026');
    setBusy(true);
    try {
      const loggedIn = await login(demoEmail, 'HackForge@2026');
      pushToast('success', `Signed in as ${loggedIn.fullName}`);
      onSuccess(loggedIn);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const created = await register({ fullName, email, password, institution, location });
      pushToast('success', 'Account created. Complete your participant profile.');
      onSuccess(created);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string; resetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setForgotMessage(res.message);
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setMode('reset');
        pushToast('info', 'Reset token issued for development verification.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      pushToast('success', 'Password reset complete. You can now sign in.');
      setMode('login');
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      const loggedIn = await signInWithGoogle();
      pushToast('success', `Signed in as ${loggedIn.fullName}.`);
      onSuccess(loggedIn);
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed or was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#192230] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-4xl w-full mx-auto">
        <button
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#66717E] hover:text-[#192230] mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to HackForge Home</span>
        </button>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Primary Auth Form Card */}
          <div className="lg:col-span-7 bg-white border border-[#192230]/10 rounded-xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-[#192230]/10 pb-4 mb-6">
              <div>
                <h1 className="font-display text-2xl font-bold">
                  {mode === 'login' && 'Sign in to HackForge'}
                  {mode === 'register' && 'Create Participant Account'}
                  {mode === 'forgot' && 'Reset Your Password'}
                  {mode === 'reset' && 'Set a New Password'}
                </h1>
                <p className="text-xs text-[#66717E] mt-1">
                  {mode === 'register'
                    ? 'New public accounts receive the PARTICIPANT role.'
                    : 'Authenticated access to HackForge portals and PostgreSQL engines.'}
                </p>
              </div>
              <Lock className="w-5 h-5 text-[#1E9782] shrink-0" />
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-[#EF6853]/10 border border-[#EF6853]/30 text-xs font-medium text-[#192230]">
                {error}
              </div>
            )}
            {forgotMessage && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-[#1E9782]/10 border border-[#1E9782]/30 text-xs font-medium text-[#192230]">
                {forgotMessage}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@college.edu"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm focus:outline-none focus:border-[#192230]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm focus:outline-none focus:border-[#192230]"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[#66717E] hover:text-[#192230] font-medium"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="text-[#1E9782] font-semibold hover:underline"
                  >
                    Need an account? Register
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#192230] text-[#F7F5EF] text-sm font-semibold hover:bg-[#192230]/90 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Authenticating...' : 'Sign In'}
                </button>

                <div className="relative py-2 flex items-center">
                  <div className="flex-grow border-t border-[#192230]/10" />
                  <span className="mx-3 text-xs text-[#66717E]">or</span>
                  <div className="flex-grow border-t border-[#192230]/10" />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogle}
                  className="w-full py-2.5 px-4 rounded-lg bg-white border border-[#192230]/20 text-sm font-semibold text-[#192230] hover:bg-[#F7F5EF] transition-colors"
                >
                  Continue with Google (Firebase Auth)
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Aarav Kulkarni"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="aarav@slrtce.in"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Institution</label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="SLRTCE Mumbai"
                      className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Mumbai, India"
                      className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Password (min 8 chars)</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#1E9782] text-white text-sm font-semibold hover:bg-[#1E9782]/90 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Creating Account...' : 'Create Participant Account'}
                </button>

                <div className="text-center text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-[#66717E] hover:text-[#192230] font-medium"
                  >
                    Already registered? Sign in
                  </button>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Account Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#192230] text-white text-sm font-semibold"
                >
                  {busy ? 'Sending...' : 'Request Reset Token'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-xs text-[#66717E] hover:text-[#192230]"
                >
                  Back to Sign In
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Reset Token</label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">New Password (min 8 chars)</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#192230]/15 bg-[#F7F5EF]/40 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#1E9782] text-white text-sm font-semibold"
                >
                  {busy ? 'Updating...' : 'Confirm Password Reset'}
                </button>
              </form>
            )}
          </div>

          {/* Judge & Evaluator Demo Accounts Panel */}
          <div className="lg:col-span-5 bg-white border border-[#192230]/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#EF6853]">
              <KeyRound className="w-4 h-4" />
              <span>Seeded Demo Accounts (Development Only)</span>
            </div>
            <p className="text-xs text-[#66717E] mt-2 leading-relaxed">
              Sign into any of the three HackForge portals using real bcrypt-hashed database credentials (password: <span className="font-mono text-[#192230]">HackForge@2026</span>).
            </p>

            <div className="mt-4 divide-y divide-[#192230]/10 border-t border-b border-[#192230]/10">
              {DEMO_ACCOUNTS.map((acc) => (
                <div key={acc.email} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#192230] truncate">{acc.label}</div>
                    <div className="font-mono text-[11px] text-[#66717E] truncate">
                      {acc.email} · {acc.role}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDemoLogin(acc.email)}
                    className="px-3 py-1.5 rounded-md bg-[#F7F5EF] border border-[#192230]/15 text-xs font-semibold text-[#192230] hover:bg-[#192230] hover:text-[#F7F5EF] transition-colors whitespace-nowrap shrink-0"
                  >
                    Sign In
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
