import { WebSocket } from 'ws';

export function dropFirstHandshakeAck() {
  const observed = { ack: null, requests: [] };
  class DropAckSocket extends WebSocket {
    send(data) {
      observed.requests.push(JSON.parse(data));
      return super.send(data);
    }
    addEventListener(type, listener) {
      if (type !== 'message') return super.addEventListener(type, listener);
      return super.addEventListener(type, event => {
        const message = JSON.parse(event.data);
        if (!observed.ack && message.type === 'ack' && message.ok && message.token) {
          observed.ack = message;
          this.terminate();
          return;
        }
        listener(event);
      });
    }
  }
  return { observed, WebSocketImpl: DropAckSocket };
}
