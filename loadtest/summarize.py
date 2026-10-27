#!/usr/bin/env python3
"""JChat 3.0 load test — turns loadtest/results/*.json (k6 --summary-export) into the Markdown table of the report.

    python3 loadtest/summarize.py            # prints the table

Columns: requests per second, p50 / p95 / p99 of http_req_duration (ms), % of failed requests, and whether the thresholds held
(p95 < 500 ms, errors < 1 %). The realtime scenario also reports the join and the INSERT -> event delay.
"""
import glob
import json
import os
import re

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
rows = []
for path in sorted(glob.glob(os.path.join(here, '*-*.json'))):
    m = re.match(r'(read|realtime|gifts)-(\d+)\.json$', os.path.basename(path))
    if not m:
        continue
    data = json.load(open(path))['metrics']
    d = data.get('http_req_duration', {})
    reqs = data.get('http_reqs', {})
    failed = data.get('http_req_failed', {}).get('value', 0)
    # in --summary-export a threshold maps to True when it was BREACHED
    broken = [k for k, v in data.items() if isinstance(v, dict) and any(v.get('thresholds', {}).values())]
    rows.append({'s': m.group(1), 'v': int(m.group(2)), 'rps': reqs.get('rate', 0), 'p50': d.get('med', 0), 'p95': d.get('p(95)', 0),
                 'p99': d.get('p(99)', 0), 'err': failed * 100, 'broken': broken, 'data': data})

order = {'read': 0, 'realtime': 1, 'gifts': 2}
rows.sort(key=lambda r: (order[r['s']], r['v']))
print('| scenario | VUs | req/s | p50 ms | p95 ms | p99 ms | % errors | thresholds |')
print('|---|---:|---:|---:|---:|---:|---:|---|')
for r in rows:
    ok = 'all held' if not r['broken'] else 'BROKEN: ' + ', '.join(sorted(r['broken']))
    print(f"| {r['s']} | {r['v']} | {r['rps']:.1f} | {r['p50']:.0f} | {r['p95']:.0f} | {r['p99']:.0f} | {r['err']:.2f} | {ok} |")
print()
for r in rows:
    if r['s'] != 'realtime':
        continue
    data = r['data']
    join = data.get('realtime_join_ms', {})
    ev = data.get('realtime_insert_to_event_ms', {})
    print(f"- realtime @ {r['v']}: joins ok {data.get('realtime_join_ok', {}).get('value', 0) * 100:.1f} %, join p95 {join.get('p(95)', 0):.0f} ms, "
          f"INSERT->event p50 {ev.get('med', 0):.0f} ms / p95 {ev.get('p(95)', 0):.0f} ms, events received {data.get('realtime_events_received', {}).get('count', 0)}, "
          f"messages sent {data.get('realtime_messages_sent', {}).get('count', 0)}, socket errors {data.get('realtime_socket_errors', {}).get('count', 0)}")
