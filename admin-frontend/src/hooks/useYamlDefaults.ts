import { useState, useEffect, useCallback } from 'react';

async function getAuthToken(): Promise<string> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to refresh auth token');
  }

  // Check content type - the endpoint may return plain text on error
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Authentication required');
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('Authentication required');
  }
  return data.token;
}

interface YamlDefaultsState {
  defaults: Record<string, any>;
  loading: boolean;
  error: string | null;
  revertSetting: (key: string) => Promise<void>;
  revertAllSettings: () => Promise<void>;
  reverting: boolean;
}

export function useYamlDefaults(): YamlDefaultsState {
  const [defaults, setDefaults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  const fetchDefaults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAuthToken();
      const response = await fetch('/admin/settings/yamlDefaults', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch YAML defaults: ${response.statusText}`);
      }

      const data = await response.json();
      setDefaults(data.defaults || {});
    } catch (err) {
      console.error('[useYamlDefaults] Error fetching defaults:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch YAML defaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDefaults();
  }, [fetchDefaults]);

  const revertSetting = useCallback(async (key: string) => {
    try {
      setReverting(true);
      setError(null);
      const token = await getAuthToken();
      const response = await fetch(`/admin/settings/revert/${key}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to revert setting: ${response.statusText}`);
      }

      // Refresh defaults after revert
      await fetchDefaults();
    } catch (err) {
      console.error('[useYamlDefaults] Error reverting setting:', err);
      setError(err instanceof Error ? err.message : 'Failed to revert setting');
      throw err;
    } finally {
      setReverting(false);
    }
  }, [fetchDefaults]);

  const revertAllSettings = useCallback(async () => {
    try {
      setReverting(true);
      setError(null);
      const token = await getAuthToken();
      const response = await fetch('/admin/settings/revert-all', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to revert all settings: ${response.statusText}`);
      }

      // Refresh defaults after revert
      await fetchDefaults();
    } catch (err) {
      console.error('[useYamlDefaults] Error reverting all settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to revert all settings');
      throw err;
    } finally {
      setReverting(false);
    }
  }, [fetchDefaults]);

  return {
    defaults,
    loading,
    error,
    revertSetting,
    revertAllSettings,
    reverting,
  };
}
