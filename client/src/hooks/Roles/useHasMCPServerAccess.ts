import { useMemo, useCallback, useContext } from 'react';
import { PermissionTypes } from 'librechat-data-provider';
import { AuthContext } from '~/hooks/AuthContext';

/**
 * soev.ai: Hook to check if the current user has access to a specific MCP server.
 * MCP_SERVERS permissions are stored as { serverName: boolean } where:
 * - true or undefined = enabled (default)
 * - false = disabled
 */
const useHasMCPServerAccess = (serverName: string) => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  const roles = authContext?.roles;
  const isAuthenticated = authContext?.isAuthenticated || false;

  const hasAccess = useMemo(() => {
    if (!authContext || !isAuthenticated || !user?.role || !roles) {
      // Default to enabled if not authenticated (will be checked server-side anyway)
      return true;
    }

    const mcpPermissions = roles[user.role]?.permissions?.[PermissionTypes.MCP_SERVERS];

    // If no MCP_SERVERS permissions defined, or server not in list, default to enabled
    if (!mcpPermissions || mcpPermissions[serverName] === undefined) {
      return true;
    }

    // Explicitly check for false (disabled)
    return mcpPermissions[serverName] !== false;
  }, [authContext, isAuthenticated, user?.role, roles, serverName]);

  return hasAccess;
};

/**
 * soev.ai: Hook to get a function that checks MCP server access.
 * Useful when you need to check multiple servers.
 */
export const useCheckMCPServerAccess = () => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  const roles = authContext?.roles;
  const isAuthenticated = authContext?.isAuthenticated || false;

  const checkAccess = useCallback(
    (serverName: string): boolean => {
      if (!authContext || !isAuthenticated || !user?.role || !roles) {
        return true;
      }

      const mcpPermissions = roles[user.role]?.permissions?.[PermissionTypes.MCP_SERVERS];

      if (!mcpPermissions || mcpPermissions[serverName] === undefined) {
        return true;
      }

      return mcpPermissions[serverName] !== false;
    },
    [authContext, isAuthenticated, user?.role, roles],
  );

  return checkAccess;
};

export default useHasMCPServerAccess;
