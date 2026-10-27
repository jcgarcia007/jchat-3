// Scenario 3 — GIFTS: gift_offer_create → gift_offer_cancel, WITHOUT Stripe (the offer never gets a PaymentIntent). LOCAL ONLY.
// Every VU is a different sender gifting the next user in the ring; all of them are present in the venue.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BUSINESS_ID, USERS, VUS, headers, loadOptions, myIndex, userId } from '../lib/common.js';

export const options = loadOptions(VUS, {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:gift_offer_create}': ['p(95)<500'],
    'http_req_duration{name:gift_offer_cancel}': ['p(95)<500'],
  },
});

const ITEMS = [{ menu_item_id: 'e0000000-0000-4000-8000-000000000001', qty: 1 }];

export default function () {
  const h = { headers: headers() };
  const to = userId((myIndex() % USERS) + 1);
  const c = http.post(`${API}/rest/v1/rpc/gift_offer_create`, JSON.stringify({ p_business_id: BUSINESS_ID, p_to_user_id: to, p_items: ITEMS, p_note: 'load' }), { ...h, tags: { name: 'gift_offer_create' } });
  const ok = check(c, { 'create 200': (r) => r.status === 200, 'create has id': (r) => r.status === 200 && !!r.json('id') });
  if (ok) {
    const x = http.post(`${API}/rest/v1/rpc/gift_offer_cancel`, JSON.stringify({ p_offer_id: c.json('id') }), { ...h, tags: { name: 'gift_offer_cancel' } });
    check(x, { 'cancel 2xx': (r) => r.status >= 200 && r.status < 300 });
  }
  sleep(1 + Math.random());
}
