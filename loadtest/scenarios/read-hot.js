// Scenario 4 — HOT READS outside the room: what a person asks on the other tabs. LOCAL ONLY (lib/common.js refuses any other URL).
//   notifications (list + unread count) · my DM conversations · last message of one conversation · received gifts · my orders
// Needs the volume data described in docs/audits/2026-10-28/rendimiento.md (loadtest/seed.sql alone has no DMs / notifications).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, USERS, VUS, headers, loadOptions, myIndex, userId } from '../lib/common.js';

export const options = loadOptions(VUS, {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:notifications}': ['p(95)<500'],
    'http_req_duration{name:notifications_unread}': ['p(95)<500'],
    'http_req_duration{name:dm_list}': ['p(95)<500'],
    'http_req_duration{name:dm_last}': ['p(95)<500'],
    'http_req_duration{name:gifts_received}': ['p(95)<500'],
    'http_req_duration{name:my_orders}': ['p(95)<500'],
  },
});

export default function () {
  const h = { headers: headers() };
  const me = userId((myIndex() % USERS) + 1);

  const rs = http.batch([
    ['GET', `${API}/rest/v1/notifications?select=id,user_id,type,payload,is_read,created_at&order=created_at.desc&limit=50`, null, { ...h, tags: { name: 'notifications' } }],
    ['GET', `${API}/rest/v1/notifications?select=id&is_read=eq.false&limit=1`, null, { headers: { ...h.headers, Prefer: 'count=exact' }, tags: { name: 'notifications_unread' } }],
    ['GET', `${API}/rest/v1/dm_conversations?select=*&or=(user_a.eq.${me},user_b.eq.${me})&order=last_message_at.desc.nullslast&limit=30`, null, { ...h, tags: { name: 'dm_list' } }],
    ['GET', `${API}/rest/v1/gifts?select=*&to_user=eq.${me}&order=created_at.desc&limit=50`, null, { ...h, tags: { name: 'gifts_received' } }],
    ['GET', `${API}/rest/v1/orders?select=id,status,total_cents,created_at&user_id=eq.${me}&order=created_at.desc&limit=30`, null, { ...h, tags: { name: 'my_orders' } }],
  ]);
  rs.forEach((r, i) => check(r, { [`hot ${i} ok`]: (x) => x.status === 200 || x.status === 206 }));

  let convs = [];
  try { convs = rs[2].json(); } catch (e) { convs = []; }
  if (Array.isArray(convs) && convs.length > 0) {
    const c = convs[Math.floor(Math.random() * convs.length)];
    const last = http.get(`${API}/rest/v1/dm_messages?select=body,created_at&conversation_id=eq.${c.id}&order=created_at.desc&limit=1`, { ...h, tags: { name: 'dm_last' } });
    check(last, { 'dm_last 200': (r) => r.status === 200 });
  }
  sleep(1 + Math.random());
}
