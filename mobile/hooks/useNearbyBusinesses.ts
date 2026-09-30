import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchBusinesses,
  filterNearbyBusinesses,
  nearbyCategories,
  type NearbyBusiness,
} from '../services/nearby';

export function useNearbyBusinesses() {
  const [businesses, setBusinesses] = useState<NearbyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      setBusinesses(await fetchBusinesses());
    } finally {
      if (refresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => nearbyCategories(businesses), [businesses]);
  const filtered = useMemo(
    () => filterNearbyBusinesses(businesses, searchQuery, selectedCategory),
    [businesses, searchQuery, selectedCategory],
  );

  return {
    businesses,
    categories,
    filtered,
    loading,
    refreshing,
    searchQuery,
    selectedCategory,
    load,
    setSearchQuery,
    setSelectedCategory,
  };
}
