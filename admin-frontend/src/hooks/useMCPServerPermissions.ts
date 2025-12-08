import { useState, useEffect, useCallback } from 'react';

interface MCPServer {
  name: string;
  chatMenu: boolean;
  type: string;
}

interface MCPPermissions {
  ADMIN: Record<string, boolean>;
  USER: Record<string, boolean>;
}

interface UseMCPServerPermissionsReturn {
  servers: MCPServer[];
  permissions: MCPPermissions;
  loading: boolean;
  error: string | null;
  updating: boolean;
  updatePermission: (roleName: string, serverName: string, enabled: boolean) => Promise<void>;
  revertAll: () => Promise<void>;
  refetch: () => Promise<void>;
}

async function getAuthToken(): Promise<string> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to refresh auth token');
  }

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

export function useMCPServerPermissions(): UseMCPServerPermissionsReturn {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [permissions, setPermissions] = useState<MCPPermissions>({ ADMIN: {}, USER: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();

      // Fetch both servers and permissions in parallel
      const [serversRes, permissionsRes] = await Promise.all([
        fetch('/admin/mcp/servers', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        }),
        fetch('/admin/mcp/permissions', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        }),
      ]);

      if (!serversRes.ok) {
        throw new Error(`Failed to fetch MCP servers: ${serversRes.statusText}`);
      }
      if (!permissionsRes.ok) {
        throw new Error(`Failed to fetch MCP permissions: ${permissionsRes.statusText}`);
      }

      const serversData = await serversRes.json();
      const permissionsData = await permissionsRes.json();

      setServers(serversData.servers || []);
      setPermissions(permissionsData.permissions || { ADMIN: {}, USER: {} });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePermission = useCallback(
    async (roleName: string, serverName: string, enabled: boolean) => {
      try {
        setUpdating(true);

        const token = await getAuthToken();
        const response = await fetch(`/admin/mcp/permissions/${roleName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ serverName, enabled }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update MCP permission: ${response.statusText}`);
        }

        // Update local state optimistically
        setPermissions((prev) => ({
          ...prev,
          [roleName]: {
            ...prev[roleName as keyof typeof prev],
            [serverName]: enabled,
          },
        }));
      } catch (err: any) {
        setError(err.message);
        await fetchData();
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [fetchData]
  );

  const revertAll = useCallback(async () => {
    try {
      setUpdating(true);

      const token = await getAuthToken();
      const response = await fetch('/admin/mcp/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to revert MCP permissions: ${response.statusText}`);
      }

      // Reset permissions to empty (all enabled by default)
      setPermissions({ ADMIN: {}, USER: {} });
    } catch (err: any) {
      setError(err.message);
      await fetchData();
      throw err;
    } finally {
      setUpdating(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    servers,
    permissions,
    loading,
    error,
    updating,
    updatePermission,
    revertAll,
    refetch: fetchData,
  };
}

export default useMCPServerPermissions;
