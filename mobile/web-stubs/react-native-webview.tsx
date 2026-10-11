/**
 * Web stub for react-native-webview (Metro alias, web only — see metro.config.js).
 * Renders an <iframe>. Covers the default export used by MenuWebPreviewScreen with the props
 * source.uri, style, onLoadStart/onLoadEnd/onError. onMessage, originWhitelist and
 * onShouldStartLoadWithRequest are accepted and ignored (cross-origin iframes cannot post
 * messages to the native bridge).
 */

import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

interface WebViewStubProps {
  source?: { uri?: string };
  style?: StyleProp<ViewStyle>;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: () => void;
  [prop: string]: unknown;
}

export default function WebView({
  source,
  style,
  onLoadStart,
  onLoadEnd,
  onError,
}: WebViewStubProps): React.ReactElement {
  const uri = source?.uri;

  useEffect(() => {
    if (uri) onLoadStart?.();
  }, [uri, onLoadStart]);

  return React.createElement('iframe', {
    src: uri,
    style: { border: 0, width: '100%', height: '100%', ...(StyleSheet.flatten(style) as object) },
    onLoad: () => onLoadEnd?.(),
    onError: () => onError?.(),
  });
}
