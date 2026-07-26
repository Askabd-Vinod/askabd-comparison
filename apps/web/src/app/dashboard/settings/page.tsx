export default function ProfilePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Profile & Settings</h1>
      <div className="space-y-6">
        {/* Profile Info */}
        <section className="bg-white rounded-xl p-6 border">
          <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input type="text" className="w-full border rounded-lg px-4 py-2" placeholder="Your name" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" className="w-full border rounded-lg px-4 py-2" placeholder="email@example.com" disabled /></div>
          </div>
          <p className="text-xs text-gray-400 mt-4">Managed by AskABD Identity Platform</p>
        </section>

        {/* Notification Preferences */}
        <section className="bg-white rounded-xl p-6 border">
          <h2 className="text-xl font-semibold mb-4">Notification Preferences</h2>
          <div className="space-y-3">
            {['Price drop alerts', 'New deals in saved categories', 'Review replies', 'Weekly comparison digest'].map((pref) => (
              <label key={pref} className="flex items-center justify-between">
                <span className="text-gray-700">{pref}</span>
                <input type="checkbox" defaultChecked className="w-5 h-5 text-purple-600 rounded" />
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">Powered by AskABD Notification Platform</p>
        </section>

        {/* Privacy */}
        <section className="bg-white rounded-xl p-6 border">
          <h2 className="text-xl font-semibold mb-4">Privacy</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between"><span>Make comparisons public by default</span><input type="checkbox" className="w-5 h-5" /></label>
            <label className="flex items-center justify-between"><span>Show profile in leaderboards</span><input type="checkbox" className="w-5 h-5" /></label>
            <label className="flex items-center justify-between"><span>Allow personalized recommendations</span><input type="checkbox" defaultChecked className="w-5 h-5" /></label>
          </div>
        </section>

        <div className="text-right">
          <button className="gradient-brand text-white px-8 py-3 rounded-lg font-medium">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
