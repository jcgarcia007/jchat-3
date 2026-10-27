// Scenario 2 — REALTIME: one WebSocket per VU on the room's presence channel (Phoenix protocol v1 over the local Realtime), each
// tracking its presence, and ONE message every 30 s (a broadcast on the socket + the INSERT of a row in `messages`) for 2 minutes
// per session; the sockets listen to the INSERT through postgres_changes. LOCAL ONLY (lib/common.js refuses any other URL).
import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { ANON_KEY, API, ROOM_ID, VUS, WS, headers, loadOptions, myIndex, token, userId } from '../lib/common.js';

const joinMs = new Trend('realtime_join_ms', true);
const presenceMs = new Trend('realtime_first_presence_state_ms', true);
const insertToEventMs = new Trend('realtime_insert_to_event_ms', true);
const joined = new Rate('realtime_join_ok');
const received = new Counter('realtime_events_received');
const sent = new Counter('realtime_messages_sent');
const sockErrors = new Counter('realtime_socket_errors');

export const options = loadOptions(VUS, {
  thresholds: {
    realtime_join_ok: ['rate>0.99'],
    realtime_join_ms: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
});

const SESSION_MS = 120000;   // 2 minutes per socket
const MESSAGE_EVERY_MS = 30000;

export default function () {
  const me = userId(myIndex());
  const topic = `realtime:room-${ROOM_ID}`;
  const url = `${WS}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`;
  let ref = 0;
  const next = () => String(++ref + 1);
  const startedAt = Date.now();
  let joinedAt = 0;
  const sentAt = {};

  const res = ws.connect(url, null, (socket) => {
    const push = (event, payload) => socket.send(JSON.stringify({ topic, event, payload, ref: next(), join_ref: '1' }));

    socket.on('open', () => {
      socket.send(JSON.stringify({
        topic, event: 'phx_join', ref: '1', join_ref: '1',
        payload: {
          config: {
            broadcast: { self: true, ack: false },
            presence: { key: me },
            postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }],
            private: false,
          },
          access_token: token(),
        },
      }));
      socket.setInterval(() => socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: next() })), 25000);
    });

    socket.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.event === 'phx_reply' && m.ref === '1') {
        const ok = !!m.payload && m.payload.status === 'ok';
        joined.add(ok);
        if (ok) {
          joinedAt = Date.now();
          joinMs.add(joinedAt - startedAt);
          push('presence', { type: 'presence', event: 'track', payload: { user_id: me, online_at: new Date().toISOString() } });
        }
      } else if (m.event === 'presence_state') {
        if (joinedAt) presenceMs.add(Date.now() - joinedAt);
        received.add(1);
      } else if (m.event === 'postgres_changes' || m.event === 'broadcast') {
        received.add(1);
        const rec = m.payload && m.payload.data && m.payload.data.record;
        if (rec && rec.body && sentAt[rec.body]) { insertToEventMs.add(Date.now() - sentAt[rec.body]); delete sentAt[rec.body]; }
      }
    });

    socket.on('error', () => sockErrors.add(1));

    // one message every 30 s: a broadcast on the socket and a row in `messages` (the way the app writes it)
    socket.setInterval(() => {
      const body = `lt-${__VU}-${Date.now()}`;
      sentAt[body] = Date.now();
      push('broadcast', { type: 'broadcast', event: 'msg', payload: { body, from: me } });
      const r = http.post(`${API}/rest/v1/messages`, JSON.stringify({ room_id: ROOM_ID, user_id: me, body }), { headers: { ...headers(), Prefer: 'return=minimal' }, tags: { name: 'messages_insert' } });
      check(r, { 'message insert 2xx': (x) => x.status >= 200 && x.status < 300 });
      sent.add(1);
    }, MESSAGE_EVERY_MS);

    socket.setTimeout(() => {
      push('phx_leave', {});
      socket.close();
    }, SESSION_MS);
  });
  check(res, { 'socket upgraded (101)': (r) => r && r.status === 101 });
}
