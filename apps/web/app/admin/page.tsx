import { SiteHeader } from '../../components/site-header';
import { AdminDashboard } from './admin-dashboard';

export default function AdminPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <AdminDashboard />
      </main>
    </>
  );
}
