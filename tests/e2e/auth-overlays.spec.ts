import { expect, test } from '@playwright/test';

const viewer = {
  createdAt: '2026-10-19T12:00:00.000Z',
  email: 'viewer@example.com',
  emailVerified: true,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Viewer',
  role: 'VIEWER',
  updatedAt: '2026-10-19T12:00:00.000Z',
};
const sessionUser = {
  createdAt: viewer.createdAt,
  email: viewer.email,
  id: viewer.id,
  role: viewer.role,
};

test('sign-in and registration open over the current page', async ({
  page,
}) => {
  let signedIn = false;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      status: signedIn ? 200 : 401,
      body: JSON.stringify(
        signedIn
          ? { requestId: 'auth-check', user: sessionUser }
          : { message: 'Sign in required' },
      ),
    }),
  );
  await page.route('**/api/v1/auth/providers', (route) =>
    route.fulfill({ json: { providers: [] } }),
  );
  await page.route('**/api/v1/auth/sign-in/email', (route) => {
    signedIn = true;
    return route.fulfill({
      json: { redirect: false, token: 'test-token', user: viewer },
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Sign in or create an account',
  });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/');

  await dialog.getByRole('button', { name: 'Create account' }).first().click();
  await expect(
    dialog.getByRole('heading', { name: 'Come join the conversation.' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: 'Join LivePulse' }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Come join the conversation.' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign in' }).first().click();
  await dialog.getByLabel('Email').fill(viewer.email);
  await dialog
    .getByLabel('Password', { exact: true })
    .fill('ExamplePassword123!');
  await dialog.locator('form').getByRole('button', { name: 'Sign in' }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/');
  await page
    .getByRole('button', { name: `Account menu for ${viewer.email}` })
    .click();
  await expect(page.getByRole('link', { name: 'Browse rooms' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Creator studio' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('account menu shows role links and closes with Escape', async ({
  page,
}) => {
  const admin = { ...sessionUser, email: 'admin@example.com', role: 'ADMIN' };
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { requestId: 'admin-check', user: admin } }),
  );

  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: `Account menu for ${admin.email}`,
  });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('link', { name: 'Creator studio' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Moderation', exact: true }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Moderation', exact: true }),
  ).toHaveCount(0);
});
