const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Native-only packages that cannot run in the browser. On web they are redirected to
// inert stubs in ./web-stubs so the shared React Native code still bundles. Native
// (ios/android) resolution is untouched. Each stub's header lists the exports it covers.
const WEB_STUBS = {
  'react-native-maps': 'react-native-maps.tsx',
  '@stripe/stripe-react-native': 'stripe-react-native.tsx',
  '@stripe/stripe-terminal-react-native': 'stripe-terminal-react-native.ts',
  'react-native-bluetooth-classic': 'react-native-bluetooth-classic.ts',
  'react-native-tcp-socket': 'react-native-tcp-socket.ts',
  'react-native-webview': 'react-native-webview.tsx',
};

// Web only: '@tabler/icons-react-native' (the whole icon set, ~47 % of the web bundle) resolves to a generated
// module that re-exports just the icons the code imports. Exact match only: the generated module itself imports
// '@tabler/icons-react-native/<Icon>' (per-icon subpath exports), which must reach the real package.
// Regenerate with `node scripts/gen-tabler-icons.mjs` (scripts/tabler-icons.test.mjs fails when it is stale).
const TABLER_WEB_STUB = path.resolve(__dirname, 'web-stubs', 'tabler-icons.web.ts');

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === '@tabler/icons-react-native') {
      return context.resolveRequest(context, TABLER_WEB_STUB, platform);
    }
    const pkg = Object.keys(WEB_STUBS).find(
      (name) => moduleName === name || moduleName.startsWith(`${name}/`),
    );
    if (pkg) {
      return context.resolveRequest(
        context,
        path.resolve(__dirname, 'web-stubs', WEB_STUBS[pkg]),
        platform,
      );
    }
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
