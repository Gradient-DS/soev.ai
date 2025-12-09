import { Toggle } from './Toggle';
import { useRolePermissions, useYamlDefaults, useMCPServerPermissions } from '../hooks';
import { RefreshCw, AlertCircle, RotateCcw, Server } from 'lucide-react';

export function FeaturesTab() {
  const {
    permissions,
    features,
    roles,
    loading: permissionsLoading,
    error: permissionsError,
    updating,
    updatePermission,
    refetch: refetchPermissions,
  } = useRolePermissions();

  const {
    defaults: yamlDefaults,
    loading: defaultsLoading,
    reverting,
    revertSetting,
    revertAllSettings,
  } = useYamlDefaults();

  const {
    servers: mcpServers,
    permissions: mcpPermissions,
    loading: mcpLoading,
    error: mcpError,
    updating: mcpUpdating,
    updatePermission: updateMCPPermission,
    revertAll: revertMCPPermissions,
    refetch: refetchMCP,
  } = useMCPServerPermissions();

  const handleToggle = async (
    roleName: string,
    featureType: string,
    permission: string,
    currentValue: boolean
  ) => {
    try {
      await updatePermission(roleName, featureType, permission, !currentValue);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleRevertAll = async () => {
    if (!confirm('Are you sure you want to revert all settings to YAML defaults?')) {
      return;
    }
    try {
      await Promise.all([revertAllSettings(), revertMCPPermissions()]);
      // Refresh all data
      await Promise.all([refetchPermissions(), refetchMCP()]);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleMCPToggle = async (
    roleName: string,
    serverName: string,
    currentEnabled: boolean
  ) => {
    try {
      await updateMCPPermission(roleName, serverName, !currentEnabled);
    } catch {
      // Error is handled by the hook
    }
  };

  // Check if an MCP server permission differs from default (all enabled by default)
  const isMCPModified = (serverName: string): boolean => {
    for (const role of roles) {
      const enabled = mcpPermissions[role as keyof typeof mcpPermissions]?.[serverName];
      // undefined or true = default (enabled), false = modified
      if (enabled === false) return true;
    }
    return false;
  };

  // Get MCP permission value (undefined = enabled by default)
  const getMCPPermissionValue = (roleName: string, serverName: string): boolean => {
    const enabled = mcpPermissions[roleName as keyof typeof mcpPermissions]?.[serverName];
    return enabled !== false; // undefined or true = enabled
  };

  const getPermissionValue = (
    roleName: string,
    featureType: string,
    permission: string
  ): boolean => {
    if (!permissions) return false;
    const rolePerms = permissions[roleName as keyof typeof permissions];
    return rolePerms?.[featureType]?.[permission] ?? false;
  };

  // Check if a feature differs from YAML default (simplified check)
  const isDifferentFromDefault = (featureId: string): boolean => {
    // Map feature IDs to YAML default keys
    const keyMap: Record<string, string> = {
      'PROMPTS': 'prompts',
      'AGENTS': 'agents',
      'WEB_SEARCH': 'webSearch',
    };
    const yamlKey = keyMap[featureId];
    if (!yamlKey) return false;

    const defaultValue = yamlDefaults[yamlKey];
    if (defaultValue === undefined) return false;
    // Check if any role's value differs from default
    for (const role of roles) {
      const feature = features.find((f) => f.id === featureId);
      if (feature) {
        const currentValue = getPermissionValue(role, feature.type, feature.permission);
        if (currentValue !== defaultValue) return true;
      }
    }
    return false;
  };

  if (permissionsLoading || defaultsLoading || mcpLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading settings...</span>
      </div>
    );
  }

  if (permissionsError) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="ml-2 text-red-700 dark:text-red-400">
            {permissionsError}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Permissions Section */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Feature Permissions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Control which features are available to each role. Changes are saved automatically.
            </p>
          </div>
          <button
            onClick={handleRevertAll}
            disabled={reverting}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5"
          >
            {reverting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Revert All
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                  Feature
                </th>
                {roles.map((role) => (
                  <th
                    key={role}
                    className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    {role}
                  </th>
                ))}
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 w-20">
                  YAML
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {features.map((feature) => {
                // Map feature IDs to YAML default keys
                const keyMap: Record<string, string> = {
                  'PROMPTS': 'prompts',
                  'AGENTS': 'agents',
                  'WEB_SEARCH': 'webSearch',
                };
                const yamlKey = keyMap[feature.id] || feature.id.toLowerCase();
                const yamlDefault = yamlDefaults[yamlKey];
                const modified = isDifferentFromDefault(feature.id);

                return (
                  <tr
                    key={feature.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${modified ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                          {feature.label}
                          {modified && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                              Modified
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {feature.description}
                        </div>
                      </div>
                    </td>
                    {roles.map((role) => {
                      const enabled = getPermissionValue(role, feature.type, feature.permission);
                      return (
                        <td key={role} className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            <Toggle
                              enabled={enabled}
                              onChange={() =>
                                handleToggle(role, feature.type, feature.permission, enabled)
                              }
                              disabled={updating || reverting}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          yamlDefault === true
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : yamlDefault === false
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {yamlDefault === true ? 'ON' : yamlDefault === false ? 'OFF' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(updating || reverting) && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              {reverting ? 'Reverting...' : 'Saving...'}
            </div>
          </div>
        )}
      </div>

      {/* MCP Server Access Section */}
      {mcpServers.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  MCP Server Access
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Control which MCP servers are available to each role. Disabled servers won't appear in the chat menu or be usable by agents.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                    Server
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role}
                      className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
                    >
                      {role}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 w-20">
                    YAML
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {mcpServers.map((server) => {
                  const modified = isMCPModified(server.name);

                  return (
                    <tr
                      key={server.name}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${modified ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            {server.name}
                            {modified && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                Modified
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Type: {server.type}
                          </div>
                        </div>
                      </td>
                      {roles.map((role) => {
                        const enabled = getMCPPermissionValue(role, server.name);
                        return (
                          <td key={role} className="px-6 py-4 text-center">
                            <div className="flex justify-center">
                              <Toggle
                                enabled={enabled}
                                onChange={() =>
                                  handleMCPToggle(role, server.name, enabled)
                                }
                                disabled={mcpUpdating || reverting}
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ON
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {mcpUpdating && (
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </div>
            </div>
          )}
        </div>
      )}

      {/* MCP Error Display */}
      {mcpError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="ml-2 text-red-700 dark:text-red-400">
              MCP Error: {mcpError}
            </span>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Note:</strong> Changes take effect after refreshing the browser or starting a new chat session.
          Settings are persisted in the database and take precedence over the YAML configuration file.
        </p>
      </div>
    </div>
  );
}

export default FeaturesTab;
