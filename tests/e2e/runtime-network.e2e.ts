import { expect, test } from '@playwright/test';

const FORBIDDEN_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

test('production preview has no third-party runtime asset requests', async ({ page }) => {
  const httpRequests = new Set<string>();
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('http://') || url.startsWith('https://')) httpRequests.add(url);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();

  const appOrigin = new URL(page.url()).origin;
  const thirdPartyRequests = [...httpRequests].filter(url => new URL(url).origin !== appOrigin);
  expect(thirdPartyRequests).toEqual([]);
  expect(
    [...httpRequests].filter(url => FORBIDDEN_HOSTS.has(new URL(url).hostname)),
  ).toEqual([]);
});
