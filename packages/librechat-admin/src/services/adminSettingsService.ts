import AdminSettings, { SettingScope, SettingSource } from '../models/AdminSettings';

// Plain object type for lean() queries (without Document methods)
interface AdminSettingsLean {
  _id: any;
  key: string;
  value: any;
  yamlDefault: any;
  source: SettingSource;
  scope: SettingScope;
  scopeId: string | null;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

// Keys managed by admin panel - extend this list to add new config flags
export const ADMIN_MANAGED_KEYS = [
  'interface.prompts',
  'interface.agents',
  'interface.webSearch',
] as const;

export type AdminManagedKey = (typeof ADMIN_MANAGED_KEYS)[number];

/**
 * Check if a key is managed by admin panel
 */
export function isAdminManagedKey(key: string): key is AdminManagedKey {
  return ADMIN_MANAGED_KEYS.includes(key as AdminManagedKey);
}

/**
 * Get all admin-managed settings for a given scope
 */
export async function getAdminSettings(
  scope: SettingScope = 'global',
  scopeId?: string | null
): Promise<Map<string, any>> {
  const query: any = { scope, scopeId: scopeId || null };

  const settings = (await AdminSettings.find(query).lean()) as unknown as AdminSettingsLean[];
  const map = new Map<string, any>();

  for (const setting of settings) {
    map.set(setting.key, setting.value);
  }

  return map;
}

/**
 * Get a single admin setting
 */
export async function getAdminSetting(
  key: string,
  scope: SettingScope = 'global',
  scopeId?: string | null
): Promise<{ value: any; yamlDefault: any; source: SettingSource } | null> {
  const query: any = { key, scope, scopeId: scopeId || null };

  const setting = (await AdminSettings.findOne(query).lean()) as AdminSettingsLean | null;
  if (!setting) return null;

  return {
    value: setting.value,
    yamlDefault: setting.yamlDefault,
    source: setting.source,
  };
}

/**
 * Set an admin setting with YAML default preservation
 */
export async function setAdminSetting(
  key: string,
  value: any,
  yamlDefault: any,
  options: {
    scope?: SettingScope;
    scopeId?: string | null;
    updatedBy?: string | null;
  } = {}
): Promise<void> {
  const { scope = 'global', scopeId = null, updatedBy = null } = options;

  await AdminSettings.findOneAndUpdate(
    { key, scope, scopeId },
    {
      key,
      value,
      yamlDefault,
      source: 'admin',
      scope,
      scopeId,
      updatedBy,
    },
    { upsert: true, new: true }
  );
}

/**
 * Get LibreChat's Role functions using module-alias path.
 */
function getRoleFunctions() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const roleModule = require('~/models/Role');
  return {
    updateAccessPermissions: roleModule.updateAccessPermissions as (
      roleName: string,
      permissionsUpdate: Record<string, Record<string, boolean>>,
      roleData?: any
    ) => Promise<void>,
  };
}

/**
 * Map admin setting key to permission type and update roles
 */
async function updateRolePermissionsForKey(key: string, value: boolean): Promise<void> {
  const keyToPermission: Record<string, { type: string; permission: string }> = {
    'interface.prompts': { type: 'PROMPTS', permission: 'USE' },
    'interface.agents': { type: 'AGENTS', permission: 'USE' },
    'interface.webSearch': { type: 'WEB_SEARCH', permission: 'USE' },
  };

  const mapping = keyToPermission[key];
  if (!mapping) return;

  const { updateAccessPermissions } = getRoleFunctions();

  // Update both ADMIN and USER roles
  await updateAccessPermissions('ADMIN', {
    [mapping.type]: { [mapping.permission]: value },
  });
  await updateAccessPermissions('USER', {
    [mapping.type]: { [mapping.permission]: value },
  });
}

/**
 * Get YAML defaults from app config
 */
async function getYamlDefaultsFromConfig(): Promise<Record<string, boolean>> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAppConfig } = require('~/server/services/Config/app');
  const appConfig = await getAppConfig();
  const interfaceConfig = appConfig?.interfaceConfig || {};

  return {
    'interface.prompts': interfaceConfig.prompts ?? true,
    'interface.agents': interfaceConfig.agents ?? true,
    'interface.webSearch': interfaceConfig.webSearch ?? true,
  };
}

/**
 * Revert a setting to its YAML default
 */
export async function revertToYamlDefault(
  key: string,
  scope: SettingScope = 'global',
  scopeId?: string | null
): Promise<any> {
  // Get the YAML default from app config
  const yamlDefaults = await getYamlDefaultsFromConfig();
  const yamlDefault = yamlDefaults[key];

  if (yamlDefault === undefined) {
    // No YAML default for this key - delete any stored setting
    await AdminSettings.deleteOne({ key, scope, scopeId: scopeId || null });
    return null;
  }

  // Update or create the setting with YAML default
  await AdminSettings.findOneAndUpdate(
    { key, scope, scopeId: scopeId || null },
    {
      key,
      value: yamlDefault,
      yamlDefault,
      source: 'yaml',
      scope,
      scopeId: scopeId || null,
    },
    { upsert: true }
  );

  // Also update the Role permissions
  if (typeof yamlDefault === 'boolean') {
    await updateRolePermissionsForKey(key, yamlDefault);
  }

  return yamlDefault;
}

/**
 * Revert all settings to their YAML defaults
 */
export async function revertAllToYamlDefaults(
  scope: SettingScope = 'global',
  scopeId?: string | null
): Promise<void> {
  // Get the YAML defaults from app config
  const yamlDefaults = await getYamlDefaultsFromConfig();

  // Revert each managed key
  for (const key of ADMIN_MANAGED_KEYS) {
    const yamlDefault = yamlDefaults[key];
    if (yamlDefault !== undefined) {
      // Update or create the setting with YAML default
      await AdminSettings.findOneAndUpdate(
        { key, scope, scopeId: scopeId || null },
        {
          key,
          value: yamlDefault,
          yamlDefault,
          source: 'yaml',
          scope,
          scopeId: scopeId || null,
        },
        { upsert: true }
      );

      // Also update the Role permissions
      if (typeof yamlDefault === 'boolean') {
        await updateRolePermissionsForKey(key, yamlDefault);
      }
    }
  }
}

/**
 * Get config overrides for injection into startup config
 * This is the main entry point for the config route overlay
 */
export async function getAdminConfigOverrides(): Promise<Map<string, any>> {
  try {
    // Get all global settings that were set by admin (source: 'admin')
    const settings = (await AdminSettings.find({
      scope: 'global',
      scopeId: null,
      source: 'admin',
    }).lean()) as unknown as AdminSettingsLean[];

    const overrides = new Map<string, any>();

    for (const setting of settings) {
      if (isAdminManagedKey(setting.key)) {
        overrides.set(setting.key, setting.value);
      }
    }

    return overrides;
  } catch (error) {
    console.error('[adminSettingsService] Failed to get config overrides:', error);
    return new Map();
  }
}

/**
 * Initialize admin settings from YAML config (called on first startup)
 * Only creates settings that don't already exist
 */
export async function initializeFromYaml(yamlInterface: any): Promise<void> {
  if (!yamlInterface) return;

  const mappings = [
    { key: 'interface.prompts', value: yamlInterface.prompts },
    { key: 'interface.agents', value: yamlInterface.agents },
    { key: 'interface.webSearch', value: yamlInterface.webSearch },
  ];

  for (const { key, value } of mappings) {
    if (value !== undefined) {
      // Only create if doesn't exist (don't overwrite admin changes)
      const existing = await AdminSettings.findOne({
        key,
        scope: 'global',
        scopeId: null,
      });

      if (!existing) {
        await AdminSettings.create({
          key,
          value,
          yamlDefault: value,
          source: 'yaml',
          scope: 'global',
          scopeId: null,
        });
      } else if (existing.yamlDefault === null || existing.yamlDefault === undefined) {
        // Backfill missing yamlDefault
        existing.yamlDefault = value;
        await existing.save();
      }
    }
  }
}

/**
 * Get YAML default for a specific key by reading from stored settings
 */
export async function getYamlDefault(key: string): Promise<any> {
  const setting = (await AdminSettings.findOne({
    key,
    scope: 'global',
    scopeId: null,
  }).lean()) as AdminSettingsLean | null;

  return setting?.yamlDefault ?? null;
}

/**
 * Get all YAML defaults for admin-managed keys
 */
export async function getAllYamlDefaults(): Promise<Record<string, any>> {
  const settings = (await AdminSettings.find({
    scope: 'global',
    scopeId: null,
    key: { $in: ADMIN_MANAGED_KEYS },
  }).lean()) as unknown as AdminSettingsLean[];

  const defaults: Record<string, any> = {};
  for (const setting of settings) {
    // Extract the key without 'interface.' prefix for frontend use
    const shortKey = setting.key.replace('interface.', '');
    defaults[shortKey] = setting.yamlDefault;
  }

  return defaults;
}

/**
 * Check if a setting has been modified from its YAML default
 */
export async function isModifiedFromYaml(
  key: string,
  scope: SettingScope = 'global',
  scopeId?: string | null
): Promise<boolean> {
  const setting = (await AdminSettings.findOne({
    key,
    scope,
    scopeId: scopeId || null,
  }).lean()) as AdminSettingsLean | null;

  if (!setting) return false;
  return setting.source === 'admin' && setting.value !== setting.yamlDefault;
}
