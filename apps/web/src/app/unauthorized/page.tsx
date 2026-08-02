export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">🔒</p>
        <h1 className="text-3xl font-bold mb-2">Authentication Required</h1>
        <p className="text-gray-600 mb-6">Please sign in to access this page.</p>
        <a href="/login" className="gradient-brand text-white px-6 py-3 rounded-lg inline-block font-medium">Sign In</a>
      </div>
    </div>
  );
}
