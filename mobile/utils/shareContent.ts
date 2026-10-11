/**
 * JChat 3.0 — shareContent (iOS / Android): the system share sheet through React Native's Share.
 * The web build resolves shareContent.web.ts (Web Share API, clipboard fallback).
 */

import { Share } from 'react-native';

export interface ShareContent {
  message: string;
  title?: string;
  url?: string;
}

export async function shareContent({ message, title, url }: ShareContent): Promise<void> {
  await Share.share({ message, title, url });
}
