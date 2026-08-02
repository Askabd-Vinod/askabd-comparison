import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="animate-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white py-24 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(124,58,237,0.3),transparent_50%)]" />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Enterprise Comparison Platform
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Compare Anything.<br /><span className="gradient-text">Decide Smarter.</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            Products, services, insurance, travel, education, banking — compare side by side with AI-powered insights and make the best decision.
          </p>
          <form action="/search" className="flex max-w-2xl mx-auto">
            <input type="text" name="q" placeholder="Search products, services, or categories..." className="flex-1 px-6 py-4 rounded-l-xl text-gray-900 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white" />
            <button type="submit" className="gradient-brand px-8 py-4 rounded-r-xl text-lg font-semibold hover:opacity-90 transition">Compare</button>
          </form>
          <p className="text-sm text-gray-400 mt-4">Trusted by enterprises • 48 APIs • Real-time data</p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">Platform Capabilities</p>
          <h2 className="text-3xl lg:text-4xl font-bold">Everything you need to compare & decide</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {capabilities.map(cap => (
            <div key={cap.name} className="card p-5 text-center">
              <div className="text-3xl mb-3">{cap.icon}</div>
              <h3 className="font-semibold text-sm">{cap.name}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-14">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { icon: '🔍', title: 'Search', desc: 'Find products and services across any category with intelligent search' },
              { icon: '⚖️', title: 'Compare', desc: 'View side-by-side specs, prices, pros and cons with template-driven analysis' },
              { icon: '💰', title: 'Decide', desc: 'Get AI-powered recommendations and find the best value for your needs' },
            ].map(s => (
              <div key={s.title} className="card p-8">
                <div className="text-4xl mb-4">{s.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">Industries</p>
          <h2 className="text-3xl font-bold">Built for every industry</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {['Electronics', 'Travel', 'Insurance', 'Education', 'Banking', 'Healthcare', 'Automobiles', 'Software', 'Real Estate', 'Credit Cards', 'Subscriptions', 'Enterprise'].map(ind => (
            <Link key={ind} href={`/categories/${ind.toLowerCase().replace(' ', '-')}`} className="card p-4 text-center text-sm font-medium text-gray-700">{ind}</Link>
          ))}
        </div>
      </section>

      {/* Platform */}
      <section className="bg-gradient-to-br from-slate-900 to-purple-900 text-white py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">Enterprise-Grade Platform</h2>
          <p className="text-gray-300 mb-10 max-w-2xl mx-auto">Built with security, scalability, and reliability at its core. Every component is monitored, audited, and production-ready.</p>
          <div className="grid md:grid-cols-4 gap-6 text-center">
            {[
              { label: 'API Endpoints', value: '48' },
              { label: 'Uptime', value: '99.9%' },
              { label: 'Security Layers', value: '9' },
              { label: 'Shared Packages', value: '16' },
            ].map(s => (
              <div key={s.label}><p className="text-3xl font-bold">{s.value}</p><p className="text-sm text-gray-400 mt-1">{s.label}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to make better decisions?</h2>
        <p className="text-gray-600 mb-8">Join thousands of users who save time and money with AskABD.</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/signup" className="gradient-brand text-white px-8 py-4 rounded-xl text-lg font-semibold hover:opacity-90">Get Started Free</Link>
          <Link href="/platform" className="border border-gray-300 px-8 py-4 rounded-xl text-lg font-semibold text-gray-700 hover:bg-gray-50">View Platform</Link>
        </div>
      </section>
    </div>
  );
}

const capabilities = [
  { icon: '📊', name: 'Product Comparison' },
  { icon: '💰', name: 'Price Comparison' },
  { icon: '🏥', name: 'Service Comparison' },
  { icon: '🛡️', name: 'Insurance' },
  { icon: '✈️', name: 'Travel' },
  { icon: '🎓', name: 'Education' },
  { icon: '🏦', name: 'Banking' },
  { icon: '🏥', name: 'Healthcare' },
  { icon: '🛒', name: 'Marketplace' },
  { icon: '🏪', name: 'Merchant Platform' },
  { icon: '📈', name: 'Analytics' },
  { icon: '🤖', name: 'AI Recommendations' },
  { icon: '⭐', name: 'Review Engine' },
  { icon: '💲', name: 'Price Engine' },
  { icon: '🔐', name: 'Identity Platform' },
  { icon: '⚙️', name: 'Workflow Platform' },
];
