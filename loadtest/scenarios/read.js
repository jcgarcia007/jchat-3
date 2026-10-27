// Scenario 1 — READS: what a person in the room asks while it is open. LOCAL ONLY (lib/common.js refuses any other URL).
//   room messages · room list · menu · venue_present_users (100 ids) · gift_available
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BUSINESS_ID, ROOM_ID, USERS, VUS, headers, loadOptions, myIndex, userId } from '../lib/common.js';

export const options = loadOptions(VUS, {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:messages}': ['p(95)<500'],
    'http_req_duration{name:rooms}': ['p(95)<500'],
    'http_req_duration{name:menu}': ['p(95)<500'],
    'http_req_duration{name:venue_present_users}': ['p(95)<500'],
    'http_req_duration{name:gift_available}': ['p(95)<500'],
  },
});

const ids100 = Array.from({ length: 100 }, (_, i) => userId(i + 1));

export default function () {
  const h = { headers: headers() };
  const me = myIndex();
  const peer = userId((me % USERS) + 1);
  const rs = http.batch([
    ['GET', `${API}/rest/v1/messages?room_id=eq.${ROOM_ID}&select=id,user_id,body,created_at&order=created_at.desc&limit=50`, null, { ...h, tags: { name: 'messages' } }],
    ['GET', `${API}/rest/v1/rooms?business_id=eq.${BUSINESS_ID}&is_active=eq.true&select=id,name`, null, { ...h, tags: { name: 'rooms' } }],
    ['GET', `${API}/rest/v1/menu_items?business_id=eq.${BUSINESS_ID}&select=id,name,price_cents,category_id&limit=100`, null, { ...h, tags: { name: 'menu' } }],
  ]);
  check(rs[0], { 'messages 200': (r) => r.status === 200 });
  check(rs[1], { 'rooms 200': (r) => r.status === 200 });
  check(rs[2], { 'menu 200': (r) => r.status === 200 });

  const pu = http.post(`${API}/rest/v1/rpc/venue_present_users`, JSON.stringify({ p_business_id: BUSINESS_ID, p_user_ids: ids100 }), { ...h, tags: { name: 'venue_present_users' } });
  check(pu, { 'venue_present_users 200': (r) => r.status === 200 });
  const ga = http.post(`${API}/rest/v1/rpc/gift_available`, JSON.stringify({ p_business_id: BUSINESS_ID, p_other_user_id: peer }), { ...h, tags: { name: 'gift_available' } });
  check(ga, { 'gift_available true': (r) => r.status === 200 && r.body === 'true' });
  sleep(1 + Math.random());
}
