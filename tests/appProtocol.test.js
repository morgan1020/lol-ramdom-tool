import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveAsset } from '../src/desktop/appProtocol.js';

test('desktop serves only files inside the bundled web directory', () => {
  const root = path.resolve('dist');
  assert.equal(resolveAsset(root, 'lol-draw://app/'), path.join(root, 'index.html'));
  assert.equal(resolveAsset(root, 'lol-draw://app/assets/main.js'), path.join(root, 'assets/main.js'));
  for (const url of ['https://app/index.html', 'lol-draw://other/index.html', 'lol-draw://app/%2e%2e%5cpackage.json', 'lol-draw://app/%2f..%2fpackage.json', 'lol-draw://app/%00', 'lol-draw://user:pass@app/index.html']) {
    assert.equal(resolveAsset(root, url), null, url);
  }
});
