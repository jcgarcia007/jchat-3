// Merges artifacts/web-audit/data/*.json (written by web/audit.spec.ts) into artifacts/web-audit/REPORTE.md and
// docs/WEB_AUDIT_<date>.md. Duplicates are grouped: same kind + same normalized message + same target across
// screens / sizes / themes / languages becomes ONE row with the list of where it happens.
// Usage: node web/audit-report.mjs   (npm run web:audit calls it)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..', 'artifacts', 'web-audit');
const dataDir = path.join(dir, 'data');
if (!existsSync(dataDir)) {
  console.error('no audit data: run npm run web:audit first');
  process.exit(1);
}

const ORDER = ['bloqueante', 'alta', 'media', 'baja'];
const runs = readdirSync(dataDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')));
const all = runs.flatMap((r) => r.findings);
const screens = new Set(runs.map((r) => r.meta.suite + ' · ' + [...new Set(r.screens)].join(' | ')));
const noise = {};
for (const r of runs) for (const [k, v] of Object.entries(r.noise ?? {})) noise[k] = (noise[k] ?? 0) + v;

const norm = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\d+(\.\d+)?/g, '#').slice(0, 140);
const groups = new Map();
for (const f of all) {
  const key = [f.kind, norm(f.message), f.kind.startsWith('axe') ? '' : norm(f.target ?? '')].join('§');
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { ...f, where: [], shots: [] }));
  g.where.push([f.screen, f.size, f.theme, f.lang]);
  if (f.shot && g.shots.length < 3) g.shots.push(f.shot);
  if (ORDER.indexOf(f.severity) < ORDER.indexOf(g.severity)) g.severity = f.severity;
}
const allRows = [...groups.values()].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || b.where.length - a.where.length);

/** Probable component from testID / aria / text. Heuristic: confirm before fixing. */
const COMPONENTS = [
  [/setting-tab/i, 'mobile/screens/settings/PrivacyScreen.tsx (tabs de visibilidad sin texto/aria-label)'],
  [/Take part in games|Participar en juegos|Truth or Dare|"Match"/i, 'mobile/components/chat (aviso de entrada: filas con ThemedSwitch)'],
  [/^ul$|Personas en esta sala|People in this room/i, 'mobile/components/chat/ChatTopBar.tsx (lista de personas, accessibilityRole="list")'],
  [/chat-more|more-my-profile|ChatMoreSheet/i, 'mobile/components/chat/ChatMoreSheet.tsx'],
  [/chat-person|Personas en esta sala/i, 'mobile/components/chat (fila de personas)'],
  [/chat-message-avatar|Mantén presionado/i, 'mobile/components/chat (MessageBubble / avatar)'],
  [/profile-sheet|ProfileSheet/i, 'mobile/components/profile/ProfileSheetFrame.tsx'],
  [/menu-sheet/i, 'mobile/screens/menu/MenuSheetScreen.web.tsx'],
  [/chat-enter|Participar|switch/i, 'mobile/components/chat (entrada al local) · ThemedSwitch'],
  [/Ajustes|Settings/i, 'mobile/screens/settings/SettingsScreen.tsx'],
  [/DM|Mensajes/i, 'mobile/screens/dms'],
  [/entry-card|Bienvenida|Welcome|Inicio de sesión|Login|Registro/i, 'mobile/screens/auth'],
];
const NEXT = /^(Landing|Menú público|Términos|Privacidad|Soporte|Seguridad|Contacto|Eliminar|Precios|Cerca|Login \(solo|Ruta inexistente \(404\)$)/;
const probable = (g) => {
  const screen = g.where[0][0];
  if (NEXT.test(screen) && g.where.every((w) => NEXT.test(w[0]))) return 'web/app (Next): ' + screen;
  const hay = `${g.target ?? ''} ${screen}`;
  const hit = COMPONENTS.find(([re]) => re.test(hay));
  return hit ? hit[1] : '(por localizar)';
};

const rows = allRows.filter((r) => r.kind !== 'small-target');
const small = allRows.filter((r) => r.kind === 'small-target');
const uniq = (a) => [...new Set(a)];
const summary = Object.fromEntries(ORDER.map((s) => [s, allRows.filter((r) => r.severity === s).length]));
const rawBySev = Object.fromEntries(ORDER.map((s) => [s, all.filter((f) => f.severity === s).length]));
const date = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

let md = `# Auditoría web — ${date}\n\n`;
md += `Solo lectura. Herramientas: Playwright CLI (\`@playwright/cli\`) para explorar, \`npx playwright test -c web.config.ts web/audit.spec.ts\` para la suite y \`@axe-core/playwright\` para accesibilidad.\n\n`;
md += `**Hallazgos agrupados:** ${allRows.length} (${rows.length} sin contar objetivos táctiles pequeños) (${ORDER.map((s) => `${summary[s]} ${s}`).join(' · ')}) — ${all.length} apariciones en bruto.\n\n`;
md += `Ejecuciones: ${runs.map((r) => `${r.meta.suite} ${r.meta.size} ${r.meta.theme}/${r.meta.lang}`).join('; ')}\n\n`;
md += `## Tabla de hallazgos\n\n| # | Gravedad | Tipo | Pantalla(s) | Tamaño(s) | Tema | Idioma | Descripción | Captura | Archivo / componente probable |\n|---|---|---|---|---|---|---|---|---|---|\n`;
rows.forEach((g, i) => {
  const screensOf = uniq(g.where.map((w) => w[0]));
  const sc = screensOf.length > 4 ? `${screensOf.slice(0, 4).join(', ')} … (+${screensOf.length - 4})` : screensOf.join(', ');
  md += `| ${i + 1} | ${g.severity} | ${g.kind} | ${esc(sc)} | ${uniq(g.where.map((w) => w[1])).join(', ')} | ${uniq(g.where.map((w) => w[2])).join(', ')} | ${uniq(g.where.map((w) => w[3])).join(', ')} | ${esc(g.message)}${g.target ? ` — \`${esc(g.target).slice(0, 90)}\`` : ''}${g.detail ? ` (${esc(g.detail).slice(0, 100)})` : ''} ×${g.where.length} | ${g.shots[0] ? '`' + g.shots[0] + '`' : ''} | ${esc(probable(g))} |\n`;
});
md += `\n## Objetivos táctiles < 40×40 en móvil (lista, baja; ${small.length} elementos distintos)\n\n| Elemento | Tamaño | Veces | Pantallas |\n|---|---|---|---|\n`;
for (const g of small.slice(0, 60)) md += `| ${esc(g.target).slice(0, 80)} | ${esc(g.message.replace('objetivo táctil ', '').replace(' < 40×40', ''))} | ${g.where.length} | ${esc(uniq(g.where.map((w) => w[0])).slice(0, 3).join(', '))} |\n`;
if (small.length > 60) md += `\n… y ${small.length - 60} más (ver data/*.json).\n`;
md += `\n## Ruido esperado (no es hallazgo)\n\n${Object.entries(noise).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (ninguno)'}\n`;
md += `\n## Pantallas recorridas\n\n${[...screens].map((s) => `- ${s}`).join('\n')}\n`;
md += `\nCapturas: \`e2e/artifacts/web-audit/shots/<suite>/<tamaño>-<tema>-<idioma>/\` (ignoradas por git). Reporte HTML de Playwright: \`npx playwright show-report artifacts/web-audit/html\`.\n`;

md += `
## Notas y límites del pase

- **Idioma de la sesión con login:** el idioma es \`users.language\` (ajuste de cuenta en el servidor), así que el recorrido con sesión corre solo en el idioma de la cuenta de prueba (\`AUDIT_APP_LANG\`, por defecto en) y varía el tema; es/en se cubre sin sesión (app pública y jchat.cloud). La suite NUNCA pulsa selectores, interruptores ni filas de ajustes (solo abre pantallas de una lista blanca y las cierra).
- **Menú del local (hoja):** \`npm run web:audit\` exporta la app con \`EXPO_PUBLIC_MENU_BASE_URL\` apuntando a un Next local (puerto 3100) y lo arranca, así la hoja se prueba contra el código nuevo. En producción \`jchat.cloud/m/...\` sigue con \`frame-ancestors 'none'\` hasta desplegar \`web/\`.
- **Cuenta compartida:** los recorridos con sesión usan la misma cuenta; se ejecutan de uno en uno (candado) para no pelear por la presencia de Realtime.
- **404 esperado:** la ruta inexistente de jchat.cloud es una sonda; su 404 no cuenta.
- **No cubierto:** envío de formularios, registro paso 2, Match / Truth or Dare por dentro, visor de imágenes, DM con foto sensible, panel de dueño/POS.
- Heurística de "componente probable": confirmar con grep antes de arreglar.
`;
writeFileSync(path.join(dir, 'REPORTE.md'), md);
const docs = path.resolve(here, '..', '..', 'docs');
mkdirSync(docs, { recursive: true });
writeFileSync(path.join(docs, `WEB_AUDIT_${date}.md`), md);
console.log(`REPORTE.md: ${rows.length} grouped findings`, summary, 'raw', rawBySev);
