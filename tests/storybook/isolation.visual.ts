import { expect, test } from '@playwright/test';

test('static server exposes only built Storybook files and read-only requests', async ({
  request,
}) => {
  const index = await request.get('/index.json');
  expect(index.ok()).toBe(true);
  expect((await index.json()).entries).toBeDefined();

  const font = await request.get('/fonts/bricolage-grotesque-latin-wght.woff2');
  expect(font.ok()).toBe(true);
  expect(font.headers()['content-type']).toContain('font/woff2');
  expect((await font.body()).subarray(0, 4).toString()).toBe('wOF2');

  for (const path of [
    '/vendor/opencv.js',
    '/vendor/worker.min.js',
    '/vendor/eng.traineddata.gz',
    '/api/puzzle-preview?p=1.0',
    '/app/SudokuApp.tsx',
    '/package.json',
    '/%2e%2e%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fetc/passwd',
  ]) {
    const response = await request.get(path);
    expect([403, 404], path).toContain(response.status());
  }
  expect((await request.get('/%ZZ')).status()).toBe(400);
  const post = await request.post('/index.html', { data: 'not allowed' });
  expect(post.status()).toBe(405);
  expect(post.headers().allow).toBe('GET, HEAD');
  const head = await request.head('/iframe.html');
  expect(head.status()).toBe(200);
  expect(await head.body()).toHaveLength(0);
});
