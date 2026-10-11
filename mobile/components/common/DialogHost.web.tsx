/**
 * JChat 3.0 — DialogHost (web). Renders the first queued dialog (see utils/dialog.web.ts) as an
 * accessible modal: role="dialog", aria-modal, focus on the first button with Tab trapped
 * inside, Escape closes (cancel button, else the only button, else onDismiss when cancelable).
 * Colors come from theme tokens; mount once in App.tsx under the providers.
 */

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  dismissDialog,
  getDialogSnapshot,
  subscribeDialogs,
  type DialogRequest,
} from '../../utils/dialogStore';
import type { DialogButton } from '../../utils/dialog.types';

export default function DialogHost(): React.ReactElement | null {
  const queue = useSyncExternalStore(subscribeDialogs, getDialogSnapshot, getDialogSnapshot);
  const current = queue[0];
  if (!current) return null;
  return createPortal(<DialogModal key={current.id} request={current} />, document.body);
}

function DialogModal({ request }: { request: DialogRequest }): React.ReactElement {
  const c = useThemeColors();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `jchat-dialog-title-${request.id}`;
  const messageId = `jchat-dialog-message-${request.id}`;
  const { buttons, options } = request;

  const press = (button?: DialogButton): void => {
    dismissDialog(request.id);
    void button?.onPress?.();
  };

  const dismiss = (): void => {
    const cancel = buttons.find((b) => b.style === 'cancel');
    if (cancel) return press(cancel);
    if (buttons.length === 1) return press(buttons[0]);
    if (options?.cancelable) {
      dismissDialog(request.id);
      options.onDismiss?.();
    }
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const colorFor = (button: DialogButton): string => {
    if (button.style === 'destructive') return palette.danger;
    if (button.style === 'cancel') return c.textSecondary;
    return palette.brand;
  };

  return (
    <div
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: palette.scrim,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.message ? messageId : undefined}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: c.bgElevated,
          border: `1px solid ${c.borderSubtle}`,
          color: c.textPrimary,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ padding: '20px 20px 16px' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {request.title}
          </h2>
          {request.message ? (
            <p
              id={messageId}
              style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.4, color: c.textSecondary, whiteSpace: 'pre-wrap' }}
            >
              {request.message}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: buttons.length > 2 ? 'column' : 'row' }}>
          {buttons.map((button, i) => (
            <button
              key={i}
              type="button"
              onClick={() => press(button)}
              style={{
                flex: 1,
                padding: '14px 12px',
                fontSize: 16,
                fontWeight: button.style === 'cancel' ? 400 : 600,
                color: colorFor(button),
                background: 'transparent',
                border: 'none',
                borderTop: `1px solid ${c.borderSubtle}`,
                borderLeft: buttons.length <= 2 && i > 0 ? `1px solid ${c.borderSubtle}` : 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {button.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
