import { useState, useCallback } from 'react';
import { mapApi } from '@/api';
import type { SearchResult } from '@/types';

export function useAddressSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await mapApi.searchAddress(q);
      setResults(data?.features?.map((f: any) => ({
        id: f.id,
        place_name: f.place_name,
        center: f.center,
      })) ?? []);
    } catch (_) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, search, setResults };
}
