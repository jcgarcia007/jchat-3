/**
 * JChat 3.0 — POS hardware switch of the store build.
 *
 * false (store v1): the card reader (Stripe Terminal / Tap to Pay), network printers (ESC/POS over TCP) and Bluetooth printers are NOT in the binary
 * (package.json → expo.autolinking.exclude; metro.config.js resolves the three packages to inert stubs), so every entry that depends on them is hidden and
 * the comanda auto-print bridge does not run. Work Mode keeps what needs no hardware: tables, orders, kitchen display, cash / external card / QR / link payments.
 * To bring the hardware back: see the comment in metro.config.js (undo the exclude and the stubs first, then set this to true).
 */
export const POS_HARDWARE_ENABLED = false;
