import AdminSettings from '../models/AdminSettings';

// Feature permission types that map to LibreChat Role permissions
// NOTE: LibreChat uses UPPERCASE keys for permission types and permissions
export const PERMISSION_FEATURES = [
  {
    id: 'PROMPTS' as const,
    type: 'PROMPTS',
    permission: 'USE',
    label: 'Prompt Library',
    description: 'Access to shared prompt templates',
  },
  {
    id: 'AGENTS' as const,
    type: 'AGENTS',
    permission: 'USE',
    label: 'AI Agents',
    description: 'Create and use AI agents',
  },
  {
    id: 'WEB_SEARCH' as const,
    type: 'WEB_SEARCH',
    permission: 'USE',
    label: 'Web Search',
    description: 'Search the web during conversations',
  },
] as const;

export type FeatureId = typeof PERMISSION_FEATURES[number]['id'];

// MCP Server permission type - stored under role.permissions.MCP_SERVERS
export const MCP_SERVERS_PERMISSION_TYPE = 'MCP_SERVERS';

// Roles that can have feature overrides
export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = typeof ROLES[number];

/**
 * Get LibreChat's Role functions using module-alias path.
 *
 * NOTE: This module is loaded AFTER api/server/index.js initializes module-alias,
 * so we can use the '~/' prefix to reference api/ modules cleanly.
 * The '~' alias points to the api/ folder.
 */
function getRoleFunctions() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const roleModule = require('~/models/Role');
  return {
    getRoleByName: roleModule.getRoleByName as (
      roleName: string,
      fieldsToSelect?: string | string[]
    ) => Promise<any>,
    updateAccessPermissions: roleModule.updateAccessPermissions as (
      roleName: string,
      permissionsUpdate: Record<string, Record<string, boolean>>,
      roleData?: any
    ) => Promise<void>,
  };
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(roleName: string): Promise<Record<string, any>> {
  const { getRoleByName } = getRoleFunctions();
  const role = await getRoleByName(roleName);
  return role?.permissions || {};
}

/**
 * Update a single permission for a role
 * Also marks this setting in AdminSettings so it won't be overwritten by YAML on restart
 */
export async function updateRolePermission(
  roleName: string,
  permissionType: string,
  permission: string,
  value: boolean
): Promise<void> {
  const { updateAccessPermissions } = getRoleFunctions();
  await updateAccessPermissions(roleName, {
    [permissionType]: { [permission]: value },
  });

  // Map permission type to AdminSettings key
  const keyMap: Record<string, string> = {
    PROMPTS: 'interface.prompts',
    AGENTS: 'interface.agents',
    WEB_SEARCH: 'interface.webSearch',
  };

  const adminKey = keyMap[permissionType];
  if (adminKey) {
    // Mark this permission as admin-managed so it survives restart
    // We store the value (true = enabled, false = disabled)
    await AdminSettings.findOneAndUpdate(
      { key: adminKey, scope: 'global', scopeId: null },
      {
        key: adminKey,
        value,
        source: 'admin',
        scope: 'global',
        scopeId: null,
      },
      { upsert: true }
    );
  }
}

/**
 * Get all permissions for both ADMIN and USER roles
 */
export async function getAllRolePermissions(): Promise<Record<Role, Record<string, any>>> {
  const [adminPerms, userPerms] = await Promise.all([
    getRolePermissions('ADMIN'),
    getRolePermissions('USER'),
  ]);

  return {
    ADMIN: adminPerms,
    USER: userPerms,
  };
}

/**
 * Update MCP server permission for a role
 * Stores under role.permissions.MCP_SERVERS[serverName] = enabled
 */
export async function updateMCPServerPermission(
  roleName: string,
  serverName: string,
  enabled: boolean
): Promise<void> {
  const { updateAccessPermissions } = getRoleFunctions();
  await updateAccessPermissions(roleName, {
    [MCP_SERVERS_PERMISSION_TYPE]: { [serverName]: enabled },
  });

  // Store in AdminSettings for tracking/reverting
  const adminKey = `mcp.${serverName}`;
  await AdminSettings.findOneAndUpdate(
    { key: adminKey, scope: 'role', scopeId: roleName },
    {
      key: adminKey,
      value: enabled,
      yamlDefault: true, // YAML default is always enabled
      source: 'admin',
      scope: 'role',
      scopeId: roleName,
    },
    { upsert: true }
  );
}

/**
 * Get MCP server permissions for a role
 * Returns object mapping serverName -> enabled (undefined = enabled by default)
 */
export async function getMCPServerPermissions(roleName: string): Promise<Record<string, boolean>> {
  const permissions = await getRolePermissions(roleName);
  return permissions?.[MCP_SERVERS_PERMISSION_TYPE] || {};
}

/**
 * Revert all MCP server permissions to defaults (all enabled)
 * Since updateAccessPermissions merges permissions, we need to use
 * direct MongoDB update to clear the MCP_SERVERS object completely.
 */
export async function revertMCPServerPermissions(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Role } = require('~/db/models');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const getLogStores = require('~/cache/getLogStores');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CacheKeys } = require('librechat-data-provider');

  // Directly unset MCP_SERVERS from permissions for both roles
  await Role.updateMany(
    { name: { $in: ['ADMIN', 'USER'] } },
    { $unset: { [`permissions.${MCP_SERVERS_PERMISSION_TYPE}`]: 1 } }
  );

  // Clear cache for both roles
  const cache = getLogStores(CacheKeys.ROLES);
  const [adminRole, userRole] = await Promise.all([
    Role.findOne({ name: 'ADMIN' }).lean().exec(),
    Role.findOne({ name: 'USER' }).lean().exec(),
  ]);
  await Promise.all([
    cache.set('ADMIN', adminRole),
    cache.set('USER', userRole),
  ]);

  // Remove all MCP-related AdminSettings
  await AdminSettings.deleteMany({ key: { $regex: /^mcp\./ } });
}
