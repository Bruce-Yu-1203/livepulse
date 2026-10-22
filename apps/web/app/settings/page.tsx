import { SiteHeader } from '../../components/site-header';
import { SettingsPanel } from './settings-panel';

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="settings-page">
        <SettingsPanel />
      </main>
    </>
  );
}
