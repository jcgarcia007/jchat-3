#!/usr/bin/env node
// The report reasons module lives twice (mobile and web: no shared package). They must stay byte-identical.
import { readFileSync } from 'node:fs';
const a = readFileSync(new URL('../mobile/utils/reportReasons.ts', import.meta.url), 'utf8');
const b = readFileSync(new URL('../web/lib/reportReasons.ts', import.meta.url), 'utf8');
if (a !== b) { console.error('mobile/utils/reportReasons.ts and web/lib/reportReasons.ts differ'); process.exit(1); }
console.log('report reasons copies are identical');
