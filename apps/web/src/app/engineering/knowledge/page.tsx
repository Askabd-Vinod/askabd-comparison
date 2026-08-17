import { Breadcrumb } from '../../components/breadcrumb';
import { NotYetAvailable } from '../../components/not-yet-available';

export default function EngineeringKnowledgePage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Engineering', href: '/engineering' }, { label: 'Knowledge Base' }]} />
      <NotYetAvailable
        title="Knowledge Base — Not yet available"
        description="AskABD does not yet persist reusable resolution knowledge (root causes, validated fixes, lessons learned) from resolved defects. This requires a knowledge-entry data store that has not been built. Defects currently record their own root cause and recommended fix individually — see Active Defects."
        alternateHref="/engineering"
        alternateLabel="View Active Defects →"
      />
    </div>
  );
}
