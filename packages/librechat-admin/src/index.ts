/**
 * soev.ai Admin Plugin
 *
 * Simplified admin panel for:
 * - User management (CRUD, token balance)
 * - Feature flags (prompts, agents, customWelcome, webSearch) per role
 * - MCP server access control per role
 */

export { buildAdminRouter } from './router';

// Services
export {
  getAdminConfigOverrides,
  getYamlDefault,
  getAllYamlDefaults,
  revertToYamlDefault,
  revertAllToYamlDefaults,
} from './services/adminSettingsService';

export {
  PERMISSION_FEATURES,
  MCP_SERVERS_PERMISSION_TYPE,
  ROLES,
  getRolePermissions,
  updateRolePermission,
  getAllRolePermissions,
  updateMCPServerPermission,
  getMCPServerPermissions,
  revertMCPServerPermissions,
} from './services/configService';
