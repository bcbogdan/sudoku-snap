export function storybookAddress(port = process.env.STORYBOOK_TEST_PORT ?? '6007') {
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error('STORYBOOK_TEST_PORT must be an integer between 1024 and 65535');
  }
  return { port: Number(port), url: `http://127.0.0.1:${Number(port)}` };
}
