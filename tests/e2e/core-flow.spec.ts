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

    await signInViewer(viewerPage);
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
    const likeResponsePromise = viewerPage.waitForResponse(
      (response) =>
        response.url().includes('/likes/me') &&
        response.request().method() === 'PUT',
    );
    await likeButton.click();
    const likeResponse = await likeResponsePromise;
    expect(likeResponse.ok()).toBe(true);
    const unlikeButton = viewerPage.getByRole('button', {
      name: /^Unlike this room\./,
    });
    await expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(unlikeButton).toBeEnabled();
    const reloadErrors: string[] = [];
    viewerPage.on('pageerror', (error) => reloadErrors.push(error.message));
    await viewerPage.reload();
    await expect(
      viewerPage.getByRole('heading', { name: roomTitle }),
    ).toBeVisible();
    await expect(viewerPage.getByLabel('Connected')).toBeVisible({
      timeout: 15_000,
    });
    expect(reloadErrors).toEqual([]);
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
      .locator('aside:visible')
      .getByText(viewerMessage, { exact: true })
      .locator('..');
    await expect(viewerMessageRow).toBeVisible();
    await viewerMessageRow.getByRole('button', { name: 'Mute 10m' }).click();
    await expect(
      viewerMessageRow.getByRole('button', { name: 'Muted' }),
    ).toBeDisabled();

    const mutedMessage = `Muted message ${suffix}`;
    await viewerPage
      .getByLabel('Chat message', { exact: true })
      .filter({ visible: true })
      .fill(mutedMessage);
    await viewerPage
      .getByRole('button', { name: 'Send' })
      .filter({ visible: true })
      .click();
    const mutedMessageRow = viewerPage
      .locator('aside:visible')
      .getByText(mutedMessage, { exact: true })
      .locator('..');
    await expect(mutedMessageRow).toContainText('failed');
    await expect(
      viewerPage.getByText('You are temporarily muted in this room'),
    ).toBeVisible();

    const hostMessage = `Host message ${suffix}`;
    await sendMessage(hostPage, hostMessage);
    const hostMessageRow = viewerPage
      .locator('aside:visible')
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
          .locator('aside:visible')
          .getByText('Message removed by moderation', { exact: true }),
      ).toBeVisible(),
      expect(
        hostPage
          .locator('aside:visible')
          .getByText('Message removed by moderation', { exact: true }),
      ).toBeVisible(),
    ]);

    const hostStudioPage = await hostContext.newPage();
    await hostStudioPage.goto('/studio');
    await expect(
      hostStudioPage.getByRole('heading', { name: roomTitle }),
    ).toBeVisible();
    await hostStudioPage.getByRole('button', { name: 'End broadcast' }).click();
    await hostStudioPage.getByRole('button', { name: 'Confirm end' }).click();
    await expect(hostStudioPage.getByRole('status')).toHaveText(
      'Broadcast ended and saved to history.',
    );
    await hostStudioPage
      .getByRole('button', { name: 'Broadcast history' })
      .click();
    await hostStudioPage.getByLabel('Search title').fill(roomTitle);
    await hostStudioPage
      .getByRole('form', { name: 'Search broadcast history' })
      .getByRole('button', { name: 'Search' })
      .click();
    await expect(
      hostStudioPage.getByRole('heading', { name: roomTitle }),
    ).toBeVisible();
    await Promise.all([
      expect(
        viewerPage
          .locator('aside:visible')
          .getByText('Broadcast ended', { exact: true }),
      ).toBeVisible(),
      expect(
        hostPage
          .locator('aside:visible')
          .getByText('Broadcast ended', { exact: true }),
      ).toBeVisible(),
      expect(
        viewerPage
          .getByText('Chat closed when this broadcast ended.')
          .filter({ visible: true }),
      ).toBeVisible(),
      expect(
        hostPage
          .getByText('Chat closed when this broadcast ended.')
          .filter({ visible: true }),
      ).toBeVisible(),
    ]);

    await viewerPage.reload();
    await expect(
      viewerPage
        .locator('aside:visible')
        .getByText('Broadcast ended', { exact: true }),
    ).toBeVisible();
    await expect(
      viewerPage
        .locator('aside:visible')
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
  // The isolated browser stack has no LiveKit credentials. Create the room
  // through the API so this test can cover chat, moderation, and history.
  await page.evaluate(async (title) => {
    const roomsResponse = await fetch('/api/v1/rooms/mine', {
      credentials: 'include',
    });
    const rooms = (await roomsResponse.json()) as {
      items: Array<{
        id: string;
        status: string;
        title: string;
        version: number;
      }>;
    };
    for (const active of rooms.items.filter((room) => room.status === 'LIVE')) {
      const ended = await fetch(`/api/v1/rooms/${active.id}`, {
        body: JSON.stringify({
          expectedVersion: active.version,
          status: 'ENDED',
        }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      if (!ended.ok) throw new Error('The seeded broadcast could not end');
    }

    const created = await fetch('/api/v1/rooms', {
      body: JSON.stringify({
        description:
          'A browser-tested room for the complete MVP interaction flow.',
        title,
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!created.ok) throw new Error('The E2E room could not be created');
    const { room } = (await created.json()) as {
      room: { id: string; version: number };
    };

    const updateResponse = await fetch(`/api/v1/rooms/${room.id}`, {
      body: JSON.stringify({
        expectedVersion: room.version,
        status: 'LIVE',
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });

    if (!updateResponse.ok) {
      throw new Error('The E2E room could not be moved live');
    }
  }, roomTitle);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Reconnect broadcast' }),
  ).toBeVisible();
}

async function signInViewer(page: Page): Promise<void> {
  const email = 'viewer@livepulse.local';
  await page.goto('/auth');
  const form = page.locator('form');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(demoPassword);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('button', { name: `Account menu for ${email}` }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeHidden();
}

async function sendMessage(page: Page, message: string): Promise<void> {
  await page
    .getByLabel('Chat message', { exact: true })
    .filter({ visible: true })
    .fill(message);
  await page
    .getByRole('button', { name: 'Send' })
    .filter({ visible: true })
    .click();
  await expect(
    page.locator('aside:visible').getByText(message, { exact: true }),
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
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/studio$/);
  const accountDestination = email.startsWith('admin@')
    ? 'Moderation'
    : 'Creator studio';
  await page.getByRole('button', { name: `Account menu for ${email}` }).click();
  await expect(
    page.getByRole('link', { name: accountDestination }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for browser end-to-end tests`);
  }
  return value;
}
