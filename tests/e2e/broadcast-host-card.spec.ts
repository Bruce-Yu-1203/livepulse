import { expect, test } from '@playwright/test';

test('live room shows broadcaster signal and elapsed time', async ({
  page,
}) => {
  await page.goto('/rooms/44444444-4444-4444-8444-444444444444');

  const broadcaster = page.getByRole('region', { name: 'Broadcaster' });
  const hostLink = broadcaster.locator('.broadcast-host-identity');
  await expect(hostLink).toBeVisible();
  await expect(broadcaster.locator('.broadcast-host-live-badge')).toBeVisible();
  await expect(broadcaster.locator('.broadcast-host-viewers')).toHaveText(
    /\d+/u,
  );
  await expect(broadcaster.locator('.broadcast-host-duration')).toContainText(
    /\d+:\d{2}:\d{2}/u,
  );
  await expect(hostLink).toHaveAttribute(
    'href',
    '/users/11111111-1111-4111-8111-111111111111',
  );
});
