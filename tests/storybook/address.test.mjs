import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storybookAddress } from '../../scripts/storybook-address.mjs';

test('dedicated Storybook ports retain loopback binding', () => {
  assert.deepEqual(storybookAddress('6007'), { port: 6007, url: 'http://127.0.0.1:6007' });
  assert.deepEqual(storybookAddress('6008'), { port: 6008, url: 'http://127.0.0.1:6008' });
});

test('invalid ports cannot silently select an ephemeral port or remote host', () => {
  for (const port of ['', '0', '80', '-1', '6008.5', '65536', '6008x', 'example.com:6008']) {
    assert.throws(() => storybookAddress(port), /STORYBOOK_TEST_PORT/);
  }
});
