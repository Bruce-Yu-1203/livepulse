import { expect, test } from '@playwright/test';

const hostId = '11111111-1111-4111-8111-111111111111';
const viewerId = '22222222-2222-4222-8222-222222222222';
const roomId = '44444444-4444-4444-8444-444444444444';

test('viewer follows a host from the profile and unfollows in the room', async ({
  page,
}) => {
  await page.goto('/auth');
  const form = page.locator('form');
  await form.getByLabel('Email').fill('viewer@livepulse.local');
  await form
    .getByLabel('Password', { exact: true })
    .fill(process.env.DEMO_PASSWORD ?? '');
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/users/${viewerId}`);
  await expect(page.getByRole('heading', { name: 'viewer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Follow viewer' })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: /Account menu for viewer@livepulse.local/ })
    .click();
  await expect(page.getByRole('link', { name: 'My profile' })).toHaveAttribute(
    'href',
    `/users/${viewerId}`,
  );

  await page.goto(`/users/${hostId}`);
  await page.getByRole('button', { name: 'Follow host' }).click();
  await expect(
    page.getByRole('button', { name: 'Unfollow host' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '1 Followers' })).toBeVisible();
  await page.getByRole('link', { name: '1 Followers' }).click();
  await expect(page).toHaveURL(new RegExp(`/users/${hostId}/followers$`));
  await expect(
    page.getByRole('link', { name: /Open viewer's profile/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Open viewer's profile/ }).click();
  await expect(page).toHaveURL(new RegExp(`/users/${viewerId}$`));
  await expect(page.getByRole('link', { name: '1 Following' })).toBeVisible();

  await page.goto(`/rooms/${roomId}`);
  await expect(
    page
      .getByRole('link', { name: /host/ })
      .filter({ has: page.locator('.search-user-avatar') }),
  ).toBeVisible();
  const broadcaster = page.getByRole('region', { name: 'Broadcaster' });
  await expect(broadcaster.getByLabel('Live')).toHaveCount(0);
  await expect(broadcaster.locator('.broadcast-host-viewers')).toBeVisible();
  await expect(broadcaster.locator('.broadcast-host-duration')).toHaveText('—');
  await expect(
    page
      .locator('main section p')
      .filter({ hasText: 'A seeded live room for trying chat' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Unfollow host' }).click();
  await expect(page.getByRole('button', { name: 'Follow host' })).toBeVisible();
});
