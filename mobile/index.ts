// Must stay the FIRST import: it adds the WebCrypto pieces Hermes lacks before anything creates the Supabase client
// (PKCE needs crypto.subtle / getRandomValues / TextEncoder, see polyfills/installWebCrypto.ts).
import './polyfills/webcrypto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
