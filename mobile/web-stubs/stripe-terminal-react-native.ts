/**
 * Stub for @stripe/stripe-terminal-react-native (Metro alias on every platform; the package is not linked on devices).
 * services/terminalSdk.ts only require()s the SDK when NativeModules.StripeTerminalReactNative
 * exists, which is never true on web — but Metro still resolves the static require, so the
 * package needs an inert target. POS readers are out of scope for web v1.
 */

export {};
