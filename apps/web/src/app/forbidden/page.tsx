export default function ForbiddenPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">⛔</p>
        <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">You do not have permission to access this page.</p>
        <a href="/dashboard" className="gradient-brand text-white px-6 py-3 rounded-lg inline-block font-medium">Go to Dashboard</a>
      </div>
    </div>
  );
}
