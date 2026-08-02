export default function ServicesPage() {
  return (
    <div className="animate-in">
      <section className="bg-gradient-to-br from-slate-900 to-purple-900 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">AskABD Technologies</h1>
          <p className="text-lg text-gray-300">Enterprise Digital Services — We build, you grow</p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Our Services</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(s => (
            <div key={s.name} className="card p-6">
              <div className="text-3xl mb-3">{s.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{s.name}</h3>
              <p className="text-sm text-gray-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Platform Products</h2>
          <p className="text-gray-600 mb-10">Reusable enterprise platforms built by AskABD</p>
          <div className="grid md:grid-cols-2 gap-4">
            {platforms.map(p => (
              <div key={p.name} className="card p-6 text-left">
                <h3 className="font-semibold mb-1">{p.name}</h3>
                <p className="text-sm text-gray-600">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Get in Touch</h2>
        <p className="text-gray-600 mb-6">Ready to transform your business? Contact us today.</p>
        <a href="mailto:hello@askabd.com" className="gradient-brand text-white px-8 py-4 rounded-xl text-lg font-semibold inline-block hover:opacity-90">hello@askabd.com</a>
      </section>
    </div>
  );
}

const services = [
  { icon: '📊', name: 'Business Analysis', desc: 'Requirements gathering, process mapping, and gap analysis' },
  { icon: '💻', name: 'Software Development', desc: 'Enterprise applications, APIs, and microservices' },
  { icon: '🌐', name: 'Web Applications', desc: 'Modern web platforms with React, Next.js, and Node.js' },
  { icon: '📱', name: 'Mobile Applications', desc: 'Cross-platform mobile solutions' },
  { icon: '🤖', name: 'AI Solutions', desc: 'Machine learning, NLP, and intelligent automation' },
  { icon: '🔄', name: 'Digital Transformation', desc: 'End-to-end modernization of legacy systems' },
  { icon: '⚙️', name: 'Automation', desc: 'Workflow automation and process optimization' },
  { icon: '🏗️', name: 'Platform Engineering', desc: 'Scalable platform architecture and DevOps' },
  { icon: '✅', name: 'QA & Testing', desc: 'Automated testing, performance, and security testing' },
  { icon: '💡', name: 'Consulting', desc: 'Technology strategy and architecture consulting' },
];

const platforms = [
  { name: 'Comparison Platform', desc: 'Enterprise comparison engine for products, services, and pricing' },
  { name: 'Identity Platform', desc: 'Universal identity, authentication, and authorization' },
  { name: 'Workflow Platform', desc: 'Business process automation and rules engine' },
  { name: 'Decision Platform', desc: 'AI-powered decision support and recommendations' },
];
