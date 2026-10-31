import { SiteHeader } from '../../components/site-header';
import { StudioDashboard } from './studio-dashboard';

export default function StudioPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <StudioDashboard />
      </main>
    </>
  );
}
