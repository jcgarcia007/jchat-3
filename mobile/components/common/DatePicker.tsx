/**
 * JChat 3.0 — DatePicker (native). Re-exports the community picker so screens import one
 * platform-neutral module; the web build resolves DatePicker.web.tsx (an <input type="date">).
 */

import DateTimePicker from '@react-native-community/datetimepicker';

export default DateTimePicker;
