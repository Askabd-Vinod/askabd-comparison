export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Sign In to AskABD</h1>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" placeholder="you@example.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" placeholder="••••••••" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <button type="submit" className="w-full gradient-brand text-white py-3 rounded-lg font-medium text-lg hover:opacity-90">
            Sign In
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">Don't have an account? <a href="#" className="text-purple-600 font-medium">Sign Up</a></p>
        <p className="text-center text-xs text-gray-400 mt-6">Authentication powered by AskABD Identity Platform</p>
      </div>
    </div>
  );
}
