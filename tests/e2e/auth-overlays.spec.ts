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
  username: null,
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
  await expect(dialog).toHaveCSS('overflow-y', 'hidden');

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
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(
    page.getByRole('heading', { name: 'Profile photo' }),
  ).toBeVisible();
});

test('settings uploads a profile photo and refreshes the account avatar', async ({
  page,
}) => {
  let avatarUrl: string | null = null;
  const expectedAvatarUrl = `http://localhost:3001/api/v1/users/${viewer.id}/avatar?v=1`;
  const avatar = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII=',
    'base64',
  );
  let uploadedContentType: string | undefined;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { requestId: 'auth-check', user: { ...sessionUser, avatarUrl } },
    }),
  );
  await page.route('**/api/v1/users/me/avatar', (route) => {
    const body = route.request().postDataJSON();
    uploadedContentType = body.contentType;
    avatarUrl = expectedAvatarUrl;
    return route.fulfill({
      json: { avatarUrl, requestId: 'avatar-upload' },
    });
  });
  await page.route(`**/api/v1/users/${viewer.id}/avatar*`, (route) =>
    route.fulfill({
      body: avatar,
      contentType: 'image/png',
    }),
  );

  await page.goto('/settings');
  await page.getByLabel('Choose image').setInputFiles({
    buffer: avatar,
    mimeType: 'image/png',
    name: 'avatar.png',
  });
  await page.getByRole('button', { name: 'Save photo' }).click();

  await expect(page.getByRole('status')).toHaveText('Photo updated.');
  expect(uploadedContentType).toBe('image/png');
  await expect(
    page
      .getByRole('button', { name: `Account menu for ${viewer.email}` })
      .locator('img'),
  ).toHaveAttribute('src', expectedAvatarUrl);
});

test('registration validates fields, verifies email, and signs in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.route('**/turnstile/v0/api.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        const widgets = new Map();
        window.turnstile = {
          render(container, options) {
            const id = String(widgets.size + 1);
            widgets.set(id, options);
            container.textContent = 'Verification ready';
            queueMicrotask(() => options.callback('test-turnstile-token-' + id));
            return id;
          },
          reset(id) {
            const options = widgets.get(id);
            if (options) queueMicrotask(() => options.callback('fresh-turnstile-token-' + id));
          },
          remove(id) { widgets.delete(id); }
        };
      `,
    }),
  );
  let signedIn = false;
  let startCount = 0;
  let completeCount = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      json: signedIn
        ? {
            requestId: 'auth-check',
            user: {
              ...sessionUser,
              email: 'new@example.com',
              username: 'newviewer',
            },
          }
        : { message: 'Sign in required' },
    }),
  );
  await page.route('**/api/v1/auth/providers', (route) =>
    route.fulfill({ json: { providers: [] } }),
  );
  await page.route('**/api/v1/auth/registration/start', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      email: 'new@example.com',
      turnstileToken: expect.stringContaining('turnstile-token'),
    });
    startCount += 1;
    if (startCount === 1) {
      return route.fulfill({
        status: 409,
        json: {
          code: 'AUTH_USERNAME_ALREADY_REGISTERED',
          message: 'This username is already taken.',
          requestId: 'duplicate-username',
        },
      });
    }
    return route.fulfill({
      json: {
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
        requestId: 'code-sent',
      },
    });
  });
  await page.route('**/api/v1/auth/registration/complete', (route) => {
    completeCount += 1;
    if (completeCount === 1) {
      return route.fulfill({
        status: 400,
        json: {
          code: 'AUTH_REGISTRATION_CODE_INVALID',
          message: 'Invalid code.',
          requestId: 'invalid-code',
        },
      });
    }
    return route.fulfill({
      json: {
        requestId: 'registration-complete',
        userId: viewer.id,
      },
    });
  });
  await page.route('**/api/v1/auth/sign-in/email', (route) => {
    signedIn = true;
    return route.fulfill({
      json: {
        redirect: false,
        token: 'test-token',
        user: { ...viewer, email: 'new@example.com' },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Join LivePulse' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Sign in or create an account',
  });
  await expect(dialog).toHaveCSS('overflow-y', 'hidden');
  await dialog.getByLabel('Email').fill('invalid-email');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Enter a valid email address.')).toBeVisible();
  await dialog.getByLabel('Email').fill('new@example.com');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Send verification code' }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole('group', { name: 'Human verification' }),
  ).toBeVisible();

  await dialog.getByLabel('Username').fill('abcd');
  await dialog.getByLabel('Password', { exact: true }).fill('letters');
  await dialog.getByRole('button', { name: 'Send verification code' }).click();
  await expect(dialog.getByText(/Use 5–30 letters/)).toBeVisible();
  await expect(
    dialog.getByText(/at least 8 characters with both letters and numbers/),
  ).toBeVisible();
  await dialog.getByLabel('Username').fill('takenuser');
  await dialog.getByLabel('Password', { exact: true }).fill('Letters123');
  await dialog.getByRole('button', { name: 'Show password' }).click();
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await dialog.getByRole('button', { name: 'Send verification code' }).click();
  await expect(
    dialog.getByText('This username is already taken. Choose another.'),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Send verification code' }),
  ).toBeEnabled();
  await dialog.getByLabel('Username').fill('newviewer');
  await dialog.getByRole('button', { name: 'Send verification code' }).click();
  await expect(dialog.getByLabel('Email verification code')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Verify and create account' }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole('button', { name: /Resend code in 60s/ }),
  ).toBeDisabled();
  await dialog.getByLabel('Email verification code').fill('111111');
  await dialog
    .getByRole('button', { name: 'Verify and create account' })
    .click();
  await expect(
    dialog.getByText(/That code is incorrect or expired/),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Verify and create account' }),
  ).toBeEnabled();
  await dialog.getByLabel('Email verification code').fill('123456');
  await dialog
    .getByRole('button', { name: 'Verify and create account' })
    .click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Account menu for new@example.com' }),
  ).toBeVisible();
  expect(startCount).toBe(2);
  expect(completeCount).toBe(2);
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
