import { Metadata } from 'next';
import { WPGEntryForm } from '../../../components/knowledge/WPGEntryForm';

export const metadata: Metadata = {
  title: 'Knowledge Filing | HoloScript Studio',
  description: 'Contribute W/P/G (Wisdom, Pattern, Gotcha) entries to the HoloMesh.',
};

export default function KnowledgeFilingPage() {
  return (
    <div className="min-h-screen bg-h-bg border-h-border">
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-h-text mb-2">Knowledge Filing</h1>
          <p className="text-h-text-dim text-sm max-w-2xl">
            This module compresses your domain insights into standard structured tuples (Wisdom, Pattern, Gotcha)
            and files them to your designated HoloMesh workspace. The synced knowledge is instantly queryable by 
            all agents connected to your API key.
          </p>
        </div>

        <WPGEntryForm />
      </div>
    </div>
  );
}
