import React from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { IconSearch, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import CategoryChip from './CategoryChip';

interface NearbyFiltersProps {
  allLabel: string;
  categories: string[];
  onChangeSearch: (value: string) => void;
  onSelectCategory: (value: string | null) => void;
  placeholder: string;
  searchQuery: string;
  selectedCategory: string | null;
}

export default function NearbyFilters({
  allLabel,
  categories,
  onChangeSearch,
  onSelectCategory,
  placeholder,
  searchQuery,
  selectedCategory,
}: NearbyFiltersProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.root}>
      <View style={[styles.search, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
        <IconSearch size={16} color={colors.textTertiary} strokeWidth={2} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeSearch}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          style={[styles.input, { color: colors.textPrimary }]}
          value={searchQuery}
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity hitSlop={8} onPress={() => onChangeSearch('')}>
            <IconX size={14} color={colors.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <CategoryChip
            active={selectedCategory === null}
            label={allLabel}
            onPress={() => onSelectCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category}
              active={selectedCategory === category}
              label={category}
              onPress={() => onSelectCategory(selectedCategory === category ? null : category)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  search: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 15, padding: 0, margin: 0 },
  chips: { alignItems: 'center', gap: 8, flexDirection: 'row' },
});
