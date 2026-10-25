import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { preferenceEndpoint, requestClient } from '../src/desktop/lcu.js';

test('LCU preference writes accept 201 with an empty body and stay confined to loopback PUT', async (t) => {
  for (const statusCode of [200, 201, 202, 204, 400, 403, 500]) {
    const requests = [];
    const mock = t.mock.method(https, 'request', (options, callback) => {
      const request = new EventEmitter();
      request.end = (body) => {
        requests.push({ options, body });
        queueMicrotask(() => {
          const response = new EventEmitter();
          response.statusCode = statusCode;
          response.setEncoding = () => {};
          callback(response);
          response.emit('end');
          request.emit('close');
        });
      };
      return request;
    });
    const promise = requestClient({ port: 12345, password: 'synthetic' }, preferenceEndpoint, {
      method: 'PUT', body: { firstPreference: 'TOP', secondPreference: 'MIDDLE' }
    });
    if (statusCode < 300) assert.equal(await promise, null);
    else await assert.rejects(promise, /拒絕套用/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.hostname, '127.0.0.1');
    assert.equal(requests[0].options.method, 'PUT');
    assert.equal(requests[0].options.path, preferenceEndpoint);
    assert.deepEqual(JSON.parse(requests[0].body), { firstPreference: 'TOP', secondPreference: 'MIDDLE' });
    mock.mock.restore();
  }
});
