/**
 * JChat 3.0 — CategoryTabs (Task 3.2)
 *
 * Horizontal scrollable tabs for menu categories.
 * Tapping a tab invokes onSelect(categoryId) so the parent can scroll the list.
 * (Category names come from the DB — no static strings to translate here.)
 */

import React, { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

export interface CategoryTabItem {
  id: string;
  name: string;
}

interface CategoryTabsProps {
  categories: CategoryTabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function CategoryTabs({ categories, activeId, onSelect }: CategoryTabsProps) {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);

  if (categories.length === 0) return null;

  return (
    <View style={[styles.wrapper, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((cat) => {
          const isActive = cat.id === activeId;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onSelect(cat.id)}
              style={[
                styles.tab,
                isActive && { borderBottomColor: palette.brand, borderBottomWidth: 2 },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? palette.brand : c.textSecondary },
                ]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
