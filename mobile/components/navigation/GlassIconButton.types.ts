import type { ReactNode } from 'react';

export interface GlassIconButtonProps {
  accessibilityLabel: string;
  children: ReactNode;
  onPress: () => void;
}
