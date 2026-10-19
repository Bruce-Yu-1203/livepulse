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
    await expect(viewerPage.getByText('2 people online')).toBeVisible();

    const likeButton = viewerPage.getByRole('button', {
      name: /^Like this room\./,
    });
    await likeButton.click();
    await expect(
      viewerPage.getByRole('button', { name: /^Unlike this room\. 1 like$/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await viewerPage.reload();
    await expect(viewerPage.getByLabel('Connected')).toBeVisible();
    await expect(
      viewerPage.getByRole('button', { name: /^Unlike this room\. 1 like$/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    await viewerContext.setOffline(true);
    await expect(
      viewerPage.getByText(
        'You are offline. Chat will reconnect when the network returns.',
      ),
    ).toBeVisible();
    await viewerContext.setOffline(false);
    await expect(viewerPage.getByLabel('Connected')).toBeVisible({
      timeout: 15_000,
    });

    const viewerMessage = `Viewer message ${suffix}`;
    await sendMessage(viewerPage, viewerMessage);
    const viewerMessageRow = hostPage
      .locator('aside')
      .getByText(viewerMessage, { exact: true })
      .locator('..');
    await expect(viewerMessageRow).toBeVisible();
    await viewerMessageRow.getByRole('button', { name: 'Mute 10m' }).click();
    await expect(
      viewerMessageRow.getByRole('button', { name: 'Muted' }),
    ).toBeDisabled();

    const mutedMessage = `Muted message ${suffix}`;
    await viewerPage.getByLabel('Chat message').fill(mutedMessage);
    await viewerPage.getByRole('button', { name: 'Send' }).click();
    const mutedMessageRow = viewerPage
      .locator('aside')
      .getByText(mutedMessage, { exact: true })
      .locator('..');
    await expect(mutedMessageRow).toContainText('failed');
    await expect(
      viewerPage.getByText('You are temporarily muted in this room'),
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
    await reportCard.getByRole('button', { name: 'Remove message' }).click();
    await expect(reportCard).toBeHidden();
    await expect(
      adminPage.getByText('Message removed', { exact: true }).first(),
    ).toBeVisible();
    await Promise.all([
      expect(
        viewerPage
          .locator('aside')
          .getByText('Message removed by moderation', { exact: true }),
      ).toBeVisible(),
      expect(
        hostPage
          .locator('aside')
          .getByText('Message removed by moderation', { exact: true }),
      ).toBeVisible(),
    ]);

    const hostStudioPage = await hostContext.newPage();
    await hostStudioPage.goto('/studio');
    await hostStudioPage
      .getByRole('button')
      .filter({ hasText: roomTitle })
      .click();
    await hostStudioPage.getByRole('button', { name: 'End broadcast' }).click();
    await expect(hostStudioPage.getByRole('status')).toHaveText(
      'The broadcast ended and is now available as a replay.',
    );
    await Promise.all([
      expect(viewerPage.getByText('Replay mode')).toBeVisible(),
      expect(hostPage.getByText('Replay mode')).toBeVisible(),
      expect(
        viewerPage.getByText('Chat closed when this broadcast ended.'),
      ).toBeVisible(),
      expect(
        hostPage.getByText('Chat closed when this broadcast ended.'),
      ).toBeVisible(),
    ]);

    await viewerPage.reload();
    await expect(viewerPage.getByText('Replay mode')).toBeVisible();
    await expect(
      viewerPage
        .locator('aside')
        .getByText('Message removed by moderation', { exact: true }),
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
