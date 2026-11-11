import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRoomInvitation, parseRoomInvitation, validateRoomServiceUrl } from '../src/domain/roomInvitation.js';

test('邀請往返保留服務與房碼，捨棄輸入的其他欄位', () => {
  for (const url of ['ws://127.0.0.1:8787/sync', 'wss://example.workers.dev/rooms', 'ws://localhost:8788/rooms']) {
    const text = formatRoomInvitation({ url, roomId: 'a123456789', token: 'never-copy-this', name: '私人#TW1' });
    assert.deepEqual(parseRoomInvitation(text), { url, roomId: 'A123456789' });
    assert.equal(text.includes('never-copy-this'), false);
    assert.equal(text.includes('私人'), false);
    assert.deepEqual(parseRoomInvitation(text.replaceAll('\n', '\r\n')), { url, roomId: 'A123456789' });
  }
});

test('邀請拒絕憑證、query、外部明文連線與額外欄位', () => {
  for (const url of ['https://example/rooms', 'lol-room://example/rooms', 'ws://example/rooms', 'wss://user:secret@example/rooms', 'wss://example/rooms?token=secret', 'wss://example/rooms#secret', 'wss://exa\nmple/rooms']) {
    assert.throws(() => formatRoomInvitation({ url, roomId: 'A123456789' }));
  }
  const text = formatRoomInvitation({ url: 'wss://example/rooms', roomId: 'A123456789' });
  for (const invalid of [text + '\ntoken：secret', 'A123456789', text.replace('房碼：', '其他：'), 'x'.repeat(4097)]) {
    assert.throws(() => parseRoomInvitation(invalid));
  }
});

test('雲端房碼限制與尾斜線正規化，local sync保留既有規則', () => {
  assert.equal(validateRoomServiceUrl('wss://example/rooms/'), 'wss://example/rooms');
  assert.throws(() => formatRoomInvitation({ url: 'wss://example/rooms', roomId: 'ABCDEFGHIJ' }), /房間代碼/);
  assert.equal(parseRoomInvitation(formatRoomInvitation({ url: 'ws://localhost/sync', roomId: 'ROOM123' })).roomId, 'ROOM123');
});

test('邀請拒絕空白的查詢或片段', () => {
  for (const suffix of ['?', '#']) {
    const url = `wss://example/rooms/${suffix}`;
    assert.throws(() => formatRoomInvitation({ url, roomId: 'A123456789' }), /查詢或片段/);
    assert.throws(() => parseRoomInvitation(`英雄聯盟抽籤工具房間邀請\n服務：${url}\n房碼：A123456789`), /查詢或片段/);
  }
});
