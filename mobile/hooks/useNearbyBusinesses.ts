import { useCallback, useEffect, useMemo, useState } from 'react';

import { getCurrentPosition, hasForegroundPermission, type Coords } from '../services/geofence';
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
  const [position, setPosition] = useState<Coords | null>(null);
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

  // Distances: only when location is already allowed (this screen never prompts); a failure just hides them.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!(await hasForegroundPermission())) return;
        const coords = await Promise.race([
          getCurrentPosition(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('location_timeout')), 10000)),
        ]);
        if (alive) setPosition(coords);
      } catch {
        // No position: cards simply show no distance.
      }
    })();
    return () => { alive = false; };
  }, []);

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
    position,
    refreshing,
    searchQuery,
    selectedCategory,
    load,
    setSearchQuery,
    setSelectedCategory,
  };
}
