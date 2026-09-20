import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('detail form refresh replaces content and history without a second navigation', async () => {
  let submit: (event: unknown) => Promise<void> = async () => {};
  let fetches = 0;
  let replacements = 0;
  let prevented = 0;
  const history = ['http://localhost/poems', 'http://localhost/poems/1'];
  const main = {};
  const form = {
    action: 'http://localhost/poems/1/ratings',
    matches: () => true,
  };
  runInNewContext(readFileSync('src/main/resources/static/js/server-app.js', 'utf8'), {
    URL, URLSearchParams,
    FormData: class { *[Symbol.iterator]() { yield ['_csrf', 'token']; yield ['score', '5']; } },
    DOMParser: class { parseFromString() { return { querySelector: () => main }; } },
    document: {
      addEventListener: (name: string, listener: typeof submit) => { if (name === 'submit') submit = listener; },
      querySelector: () => ({ replaceWith: (value: unknown) => { assert.equal(value, main); replacements++; } }),
    },
    location: { origin: 'http://localhost', pathname: '/poems/1', replace: () => assert.fail('unexpected navigation') },
    history: { state: null, replaceState: (_state: unknown, _title: string, url: string) => { history[history.length - 1] = url; } },
    fetch: async (_url: string, options: { method: string; headers: Record<string, string>; body: URLSearchParams }) => {
      fetches++;
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Poem-Interaction'], '1');
      assert.equal(options.body.get('score'), '5');
      return { ok: true, url: 'http://localhost/poems/1', text: async () => '<main>updated</main>' };
    },
  });
  const button = { disabled: false };
  const event = { target: form, submitter: button, preventDefault: () => { prevented++; } };
  await Promise.all([submit(event), submit(event)]);
  assert.equal(fetches, 1);
  assert.equal(replacements, 1);
  assert.equal(prevented, 2);
  assert.equal(button.disabled, false);
  history.pop(); // One back operation returns to the list.
  assert.deepEqual(history, ['http://localhost/poems']);
});
