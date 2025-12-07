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
