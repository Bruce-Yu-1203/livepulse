import { expect, test } from '@playwright/test';

test('homepage search suggests people and rooms and opens each result', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', {
    name: 'Search users and rooms',
  });

  await search.fill('host');
  const matchingUsers = page.getByRole('list', { name: 'Matching users' });
  await expect(
    matchingUsers.getByRole('link', { name: /host/i }),
  ).toBeVisible();
  await matchingUsers.getByRole('link', { name: /host/i }).click();
  await expect(page).toHaveURL(
    /\/users\/11111111-1111-4111-8111-111111111111$/,
  );
  await expect(page.getByRole('heading', { name: 'host' })).toBeVisible();

  await search.fill('MVP');
  const matchingRooms = page.getByRole('list', { name: 'Matching rooms' });
  await matchingRooms.getByRole('link', { name: /LivePulse MVP demo/ }).click();
  await expect(page).toHaveURL(
    /\/rooms\/44444444-4444-4444-8444-444444444444$/,
  );

  await search.fill('host');
  await search.press('Enter');
  await expect(page).toHaveURL(/\?q=host$/);
  await expect(
    page.getByRole('link', { name: /Open host's profile/ }),
  ).toBeVisible();
});
