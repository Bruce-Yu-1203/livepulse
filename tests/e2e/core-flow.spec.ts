import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

const demoPassword = requiredEnvironment('DEMO_PASSWORD');

test('viewer, host, and administrator complete the core live-room flow', async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const adminContext = await browser.newContext();

  try {
    const hostPage = await hostContext.newPage();
    const viewerPage = await viewerContext.newPage();
    const adminPage = await adminContext.newPage();
    const suffix = randomUUID().slice(0, 8);
    const roomTitle = `E2E room ${suffix}`;

    await signIn(hostPage, 'host@livepulse.local', demoPassword);
    await createLiveRoom(hostPage, roomTitle);

    await registerAndSignInViewer(viewerPage, suffix);
    await viewerPage.goto('/');
    await viewerPage.getByRole('link', { name: `Open ${roomTitle}` }).click();
    await expect(viewerPage).toHaveURL(/\/rooms\/[0-9a-f-]+$/);
    const roomPath = new URL(viewerPage.url()).pathname;

    await hostPage.goto(roomPath);
    await Promise.all([
      expect(viewerPage.getByLabel('Connected')).toBeVisible(),
      expect(hostPage.getByLabel('Connected')).toBeVisible(),
    ]);

    const viewerMessage = `Viewer message ${suffix}`;
    await sendMessage(viewerPage, viewerMessage);
    await expect(
      hostPage.locator('aside').getByText(viewerMessage, { exact: true }),
    ).toBeVisible();

    const hostMessage = `Host message ${suffix}`;
    await sendMessage(hostPage, hostMessage);
    const hostMessageRow = viewerPage
      .locator('aside')
      .getByText(hostMessage, { exact: true })
      .locator('..');
    await expect(hostMessageRow).toBeVisible();
    await hostMessageRow
      .getByRole('button', { name: 'Report message' })
      .click();
    await hostMessageRow.getByLabel('Details').fill('Verified by the E2E flow');
    await hostMessageRow.getByRole('button', { name: 'Submit report' }).click();
    await expect(
      hostMessageRow.getByText('Reported', { exact: true }),
    ).toBeVisible();

    await signIn(adminPage, 'admin@livepulse.local', demoPassword);
    await adminPage.goto('/admin');
    await expect(
      adminPage.getByRole('heading', { name: 'Moderation queue' }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { name: 'Runtime pulse' }),
    ).toBeVisible();

    const reportCard = adminPage
      .locator('article')
      .filter({ hasText: hostMessage });
    await expect(reportCard).toBeVisible();
    await reportCard.getByRole('button', { name: 'Keep message' }).click();
    await expect(reportCard).toBeHidden();
    await expect(
      adminPage.getByText('Report dismissed', { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await Promise.all([
      hostContext.close(),
      viewerContext.close(),
      adminContext.close(),
    ]);
  }
});

async function createLiveRoom(page: Page, roomTitle: string): Promise<void> {
  await expect(page).toHaveURL(/\/studio$/);
  const createForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Create a room' }),
  });
  await createForm.getByLabel('Title').fill(roomTitle);
  await createForm
    .getByLabel('Description')
    .fill('A browser-tested room for the complete MVP interaction flow.');
  await createForm
    .getByLabel('Cover image URL')
    .fill('https://example.com/e2e-cover.jpg');
  await createForm
    .getByLabel('Demo video URL')
    .fill('https://example.com/e2e-video.mp4');
  await createForm.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft room created.');
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'The room is live and visible to viewers.',
  );
}

async function registerAndSignInViewer(
  page: Page,
  suffix: string,
): Promise<void> {
  const email = `viewer-${suffix}@example.com`;
  const password = `Viewer-${randomUUID()}!`;
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Create account' }).click();
  const form = page.locator('form');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Account created. You can sign in now.',
  );
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function sendMessage(page: Page, message: string): Promise<void> {
  await page.getByLabel('Chat message').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(
    page.locator('aside').getByText(message, { exact: true }),
  ).toBeVisible();
}

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/auth');
  const form = page.locator('form');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/studio$/);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for browser end-to-end tests`);
  }
  return value;
}
