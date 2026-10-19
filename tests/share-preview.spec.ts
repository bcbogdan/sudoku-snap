import { expect, test } from '@playwright/test';
import { encodePuzzle } from '../lib/sharing';
import clues from './fixtures/expected.json';

test('server previews preserve compact and legacy links independently of the browser engine', async ({
  request,
}) => {
  for (const encoded of [encodePuzzle(clues), Buffer.from(clues.join('')).toString('base64url')]) {
    const response = await request.get('/api/puzzle-preview', { params: { p: encoded } });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\/png\b/);
    expect(response.headers()['cache-control']).toBe('public, max-age=3600, s-maxage=86400');
    const png = await response.body();
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(630);
    expect(png.readUInt32BE(20)).toBe(630);
  }
  for (const query of ['', '?p=invalid', '?p=1.L']) {
    const response = await request.get(`/api/puzzle-preview${query}`);
    expect(response.status()).toBe(400);
    expect(await response.text()).toBe('Invalid puzzle');
  }
});
