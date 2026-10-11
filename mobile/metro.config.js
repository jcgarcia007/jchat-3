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

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
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
