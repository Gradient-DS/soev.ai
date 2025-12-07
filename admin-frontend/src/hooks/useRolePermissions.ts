import { useState, useEffect, useCallback } from 'react';

interface FeatureInfo {
  id: string;
  type: string;
  permission: string;
  label: string;
  description: string;
}

interface RolePermissions {
  [permissionType: string]: {
    [permission: string]: boolean;
  };
}

interface PermissionsData {
  permissions: {
    ADMIN: RolePermissions;
    USER: RolePermissions;
  };
  features: FeatureInfo[];
  roles: string[];
}

interface UseRolePermissionsReturn {
  permissions: PermissionsData['permissions'] | null;
  features: FeatureInfo[];
  roles: string[];
  loading: boolean;
  error: string | null;
  updating: boolean;
  updatePermission: (
    roleName: string,
    permissionType: string,
    permission: string,
    value: boolean
  ) => Promise<void>;
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

export function useRolePermissions(): UseRolePermissionsReturn {
  const [permissions, setPermissions] = useState<PermissionsData['permissions'] | null>(null);
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      const response = await fetch('/admin/roles/permissions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication required');
        }
        throw new Error(`Failed to fetch permissions: ${response.statusText}`);
      }

      const data: PermissionsData = await response.json();
      setPermissions(data.permissions);
      setFeatures(data.features);
      setRoles(data.roles as string[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePermission = useCallback(
    async (
      roleName: string,
      permissionType: string,
      permission: string,
      value: boolean
    ) => {
      try {
        setUpdating(true);

        const token = await getAuthToken();
        const response = await fetch(`/admin/roles/${roleName}/permissions`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ permissionType, permission, value }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update permission: ${response.statusText}`);
        }

        // Update local state optimistically
        setPermissions((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [roleName]: {
              ...prev[roleName as keyof typeof prev],
              [permissionType]: {
                ...prev[roleName as keyof typeof prev]?.[permissionType],
                [permission]: value,
              },
            },
          };
        });
      } catch (err: any) {
        setError(err.message);
        // Refetch to ensure we have correct state
        await fetchPermissions();
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [fetchPermissions]
  );

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    features,
    roles,
    loading,
    error,
    updating,
    updatePermission,
    refetch: fetchPermissions,
  };
}

export default useRolePermissions;
