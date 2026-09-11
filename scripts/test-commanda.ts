#!/usr/bin/env ts-node
/**
 * test-commanda.ts
 *
 * Genera el archivo ESC/POS de una comanda de cocina de prueba
 * y lo manda por TCP a la impresora.
 *
 * Uso:
 *   cd mobile
 *   npx ts-node ../scripts/test-commanda.ts [HOST] [PORT]
 *
 * Ejemplo:
 *   npx ts-node ../scripts/test-commanda.ts 192.168.1.100 9100
 *
 * Si omites HOST/PORT usa los valores hardcoded abajo.
 * También puedes mandar el .bin a mano:
 *   npx ts-node ../scripts/test-commanda.ts --save-only
 *   nc 192.168.1.100 9100 < /tmp/test-commanda.bin
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { buildKitchenTicketEscPos } from '../mobile/services/escpos';

// ── Configuración ──────────────────────────────────────────────────────────────
const PRINTER_HOST = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : '192.168.1.100';  // ← cambia a tu IP real
const PRINTER_PORT = parseInt(process.argv[3] ?? '9100', 10);
const SAVE_ONLY    = process.argv.includes('--save-only');
const OUT_FILE     = '/tmp/test-commanda.bin';

// ── Datos de prueba reales (Pizza de Trufa, T1, silla 4) ──────────────────────
const buffer = buildKitchenTicketEscPos({
  stationLabel: 'COCINA',
  tableLabel:   'Mesa T1 · Silla 4',
  serverName:   'Juan',
  items: [
    {
      qty:  1,
      name: 'Pizza de Trufa',
      options: JSON.stringify({
        modifiers: [
          { group_label: 'Tamaño',       choice_labels: ['Grande 16 pulg']                                                      },
          { group_label: 'Masa',         choice_labels: ['Sin gluten']                                                           },
          { group_label: 'Agrega extras',choice_labels: ['Champiñón extra','Aceite de trufa extra','Rúcula','Parmesano extra']  },
        ],
      }),
      special_instructions: 'Sin sal en el borde',
      seat: 4,
    },
    {
      qty:  2,
      name: 'Agua mineral',
      options: null,
      seat: 4,
    },
  ],
});

// ── Guardar binario ────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_FILE, Buffer.from(buffer));
console.log(`✅ Binario guardado: ${OUT_FILE} (${buffer.length} bytes)`);
console.log(`   nc ${PRINTER_HOST} ${PRINTER_PORT} < ${OUT_FILE}`);

if (SAVE_ONLY) {
  console.log('\n--save-only: no se envía por red.');
  process.exit(0);
}

// ── Enviar por TCP ─────────────────────────────────────────────────────────────
console.log(`\n📡 Enviando a ${PRINTER_HOST}:${PRINTER_PORT}...`);
const sock = net.createConnection({ host: PRINTER_HOST, port: PRINTER_PORT }, () => {
  sock.write(Buffer.from(buffer), () => {
    sock.end();
    console.log('🖨️  Enviado. Revisa la impresora.');
  });
});
sock.on('error', (err) => {
  console.error(`❌ Error de conexión: ${err.message}`);
  console.log(`   Intenta con: nc ${PRINTER_HOST} ${PRINTER_PORT} < ${OUT_FILE}`);
  process.exit(1);
});
