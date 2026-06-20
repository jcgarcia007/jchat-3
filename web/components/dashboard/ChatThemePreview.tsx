/**
 * JChat 3.0 — ChatThemePreview (Task 0.4)
 * Miniature read-only preview of a chat room theme for the dashboard selector.
 * Colors come exclusively from the ChatTheme object — no new hardcoded hex.
 *
 * TODO(Stage 2): persist chat_theme_id to rooms table via Supabase Edge Function.
 *
 * Usage:
 *   import { ChatThemePreview } from '@/components/dashboard/ChatThemePreview';
 *   import { getChatTheme } from '@/constants/chatThemes';
 *   <ChatThemePreview themeId={3} />
 *   // or pass the object directly:
 *   <ChatThemePreview theme={getChatTheme(3)} />
 */

import React from 'react';
import { getChatTheme, type ChatTheme } from '@/constants/chatThemes';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props =
  | { themeId: number; theme?: never }
  | { theme: ChatTheme; themeId?: never };

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatThemePreview({ themeId, theme: themeProp }: Props) {
  const theme: ChatTheme =
    themeProp !== undefined ? themeProp : getChatTheme(themeId ?? 1);

  return (
    <div
      style={{
        width: 120,
        height: 160,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: `1.5px solid ${theme.border}`,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
      aria-label={`Theme preview: ${theme.name}`}
    >
      {/* Header bar */}
      <div
        style={{
          background: theme.topBg,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          flexShrink: 0,
          borderBottom: `1px solid ${theme.border}`,
          gap: 4,
        }}
      >
        {/* Avatar dot */}
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: theme.accent,
            flexShrink: 0,
          }}
        />
        {/* Room name placeholder */}
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: theme.tabInactive,
            opacity: 0.7,
          }}
        />
      </div>

      {/* Message area */}
      <div
        style={{
          flex: 1,
          background: theme.bg,
          padding: '6px 6px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          overflow: 'hidden',
        }}
      >
        {/* Incoming bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div
            style={{
              background: theme.bubbleInBg,
              color: theme.bubbleInText,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px 10px 10px 2px',
              padding: '4px 7px',
              maxWidth: '72%',
              fontSize: 8,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            Hey! 👋
          </div>
        </div>

        {/* Outgoing bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              background: theme.bubbleOutBg,
              color: theme.bubbleOutText,
              borderRadius: '10px 10px 2px 10px',
              padding: '4px 7px',
              maxWidth: '72%',
              fontSize: 8,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            Hi there! 😊
          </div>
        </div>

        {/* Second incoming bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div
            style={{
              background: theme.bubbleInBg,
              color: theme.bubbleInText,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px 10px 10px 2px',
              padding: '4px 7px',
              maxWidth: '80%',
              fontSize: 8,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            Welcome!
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        style={{
          background: theme.topBg,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          gap: 4,
          borderTop: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        {/* Input field */}
        <div
          style={{
            flex: 1,
            height: 14,
            borderRadius: 7,
            background: theme.inputBg,
            border: `1px solid ${theme.border}`,
            opacity: 0.9,
          }}
        />
        {/* Send button dot */}
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: theme.accent,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Arrow icon as a tiny triangle */}
          <svg
            width={6}
            height={6}
            viewBox="0 0 6 6"
            fill="none"
            aria-hidden="true"
          >
            <path d="M1 5 L5 3 L1 1 Z" fill={theme.bubbleOutText} />
          </svg>
        </div>
      </div>

      {/* Theme name label */}
      <div
        style={{
          background: theme.topBg,
          color: theme.accent,
          fontSize: 7,
          fontWeight: 600,
          textAlign: 'center',
          padding: '2px 4px',
          letterSpacing: 0.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        {theme.name}
      </div>
    </div>
  );
}

export default ChatThemePreview;
