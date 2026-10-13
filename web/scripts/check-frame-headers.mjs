// Checks the framing headers of a RUNNING Next server (next start / dev / a deployment). Run from web/:
//   node scripts/check-frame-headers.mjs [BASE_URL] [SLUG]       (default http://127.0.0.1:3100, slug bar-xzx-omd2)
// Expectations: /m/<slug> is embeddable by our own domains only (no X-Frame-Options, CSP frame-ancestors = allow-list);
// every other page (/dashboard, /auth/login, /c/*, /) keeps X-Frame-Options: DENY and frame-ancestors 'none'.

const base = (process.argv[2] ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const slug = process.argv[3] ?? 'bar-xzx-omd2';
const prod = process.env.EXPECT_PRODUCTION !== '0';

const ancestorsOf = (csp) => (csp ?? '').split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-ancestors '))?.slice('frame-ancestors '.length) ?? null;
let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' → ' + detail}`);
  if (!ok) failed += 1;
};

for (const path of [`/m/${slug}`, `/m/${slug}?embed=1`]) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const csp = res.headers.get('content-security-policy');
  const fa = ancestorsOf(csp);
  check(`${path}: no X-Frame-Options`, res.headers.get('x-frame-options') === null, res.headers.get('x-frame-options'));
  check(`${path}: frame-ancestors is the allow-list`, !!fa && fa.startsWith("'self' https://jchat.cloud https://jchat-app-web.vercel.app https://*.jchat.cloud"), fa);
  check(`${path}: no *.vercel.app, no bare *`, !!fa && !fa.includes('*.vercel.app') && !/(^| )\*( |$)/.test(fa), fa);
  if (prod) check(`${path}: no localhost in production`, !!fa && !fa.includes('localhost'), fa);
}
for (const path of ['/dashboard', '/auth/login', '/c/anything', '/', '/pricing', '/nearby']) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const fa = ancestorsOf(res.headers.get('content-security-policy'));
  check(`${path}: X-Frame-Options DENY`, res.headers.get('x-frame-options') === 'DENY', res.headers.get('x-frame-options'));
  check(`${path}: frame-ancestors 'none'`, fa === "'none'", fa);
}
process.exit(failed ? 1 : 0);
