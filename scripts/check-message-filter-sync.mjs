#!/usr/bin/env node
// The ES/EN message filter lives twice (mobile and web: no shared package). They must stay byte-identical.
import { readFileSync } from 'node:fs';
const a = readFileSync(new URL('../mobile/utils/messageFilter.ts', import.meta.url), 'utf8');
const b = readFileSync(new URL('../web/lib/messageFilter.ts', import.meta.url), 'utf8');
if (a !== b) { console.error('mobile/utils/messageFilter.ts and web/lib/messageFilter.ts differ'); process.exit(1); }
console.log('message filter copies are identical');
