/**
 * JChat 3.0 — DatePicker (web). Native <input type="date"> exposing the subset of the
 * @react-native-community/datetimepicker interface the app uses: value, mode="date",
 * minimumDate/maximumDate and onChange(event, date). Selecting a date fires a 'set' event.
 */

import React, { useEffect, useRef } from 'react';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useThemeColors } from '../../theme/colors';

interface DatePickerProps {
  value: Date;
  mode?: 'date';
  minimumDate?: Date;
  maximumDate?: Date;
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  [prop: string]: unknown;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local-calendar YYYY-MM-DD (toISOString would shift the day across timezones). */
function toInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromInputValue(v: string): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DatePicker({
  value,
  minimumDate,
  maximumDate,
  onChange,
}: DatePickerProps): React.ReactElement {
  const c = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);

  // Open the browser's picker right away when supported; otherwise the visible input is the fallback.
  useEffect(() => {
    const input = inputRef.current;
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // showPicker needs a recent user gesture; the input stays visible and clickable.
      }
    }
  }, []);

  return React.createElement('input', {
    ref: inputRef,
    type: 'date',
    value: toInputValue(value),
    min: minimumDate ? toInputValue(minimumDate) : undefined,
    max: maximumDate ? toInputValue(maximumDate) : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.value) return;
      const date = fromInputValue(e.target.value);
      onChange?.(
        {
          type: 'set',
          nativeEvent: { timestamp: date.getTime(), utcOffset: -date.getTimezoneOffset() },
        } as DateTimePickerEvent,
        date,
      );
    },
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: 12,
      fontSize: 16,
      borderRadius: 12,
      border: `1px solid ${c.borderSubtle}`,
      backgroundColor: c.bgSurface,
      color: c.textPrimary,
    },
  });
}
