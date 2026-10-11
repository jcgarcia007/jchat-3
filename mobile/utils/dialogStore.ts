/**
 * JChat 3.0 — in-memory queue behind the web dialogs. dialog.web.ts enqueues requests,
 * DialogHost.web.tsx renders the first one. Platform-neutral so both import the same module.
 */

import type { DialogButton, DialogOptions } from './dialog.types';

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options?: DialogOptions;
}

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function enqueueDialog(request: Omit<DialogRequest, 'id'>): void {
  queue = [...queue, { ...request, id: nextId++ }];
  emit();
}

export function dismissDialog(id: number): void {
  queue = queue.filter((request) => request.id !== id);
  emit();
}

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDialogSnapshot(): DialogRequest[] {
  return queue;
}
