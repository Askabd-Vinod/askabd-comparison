'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const { signup, authenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authenticated) { router.push('/dashboard'); return null; }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name) { setError('Name is required'); return; }
    if (!email) { setError('Email is required'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    const result = await signup(email, password, name);
    setLoading(false);
    if (result.ok) router.push('/dashboard');
    else setError(result.error || 'Signup failed');
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 animate-in">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 gradient-brand rounded-xl flex items-center justify-center mx-auto mb-4"><span className="text-white text-xl font-bold">A</span></div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-gray-500 mt-1">Start comparing and saving today</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm border border-red-100">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <button type="submit" disabled={loading} className="w-full gradient-brand text-white py-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-4 text-center">By signing up, you agree to our Terms and Privacy Policy</p>
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">Already have an account? <a href="/login" className="text-purple-600 font-medium">Sign in</a></p>
      </div>
    </div>
  );
}
