'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, authenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authenticated) { router.push('/dashboard'); return null; }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required'); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) router.push('/dashboard');
    else setError(result.error || 'Login failed');
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-in">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 gradient-brand rounded-xl flex items-center justify-center mx-auto mb-4"><span className="text-white text-xl font-bold">A</span></div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-gray-500 mt-1">Sign in to your AskABD account</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm border border-red-100">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 text-purple-600 rounded" />
                <span className="text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-purple-600 font-medium hover:text-purple-700">Forgot password?</a>
            </div>
            <button type="submit" disabled={loading} className="w-full gradient-brand text-white py-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">Don't have an account? <a href="/signup" className="text-purple-600 font-medium">Create one</a></p>
        <p className="text-center text-[11px] text-gray-400 mt-3">Development mode — any credentials accepted</p>
      </div>
    </div>
  );
}
