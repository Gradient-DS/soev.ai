/**
 * Custom Extensions Mount Point
 * Handles mounting of all custom modules for soev.ai
 *
 * NOTE: This module is loaded AFTER api/server/index.js initializes module-alias,
 * so we can use the '~/' prefix to reference api/ modules cleanly.
 */

const path = require('path');

module.exports = (app) => {
  // Use module-alias paths (configured by api/server/index.js)
  const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
  const checkAdmin = require('~/server/middleware/roles/admin');

  if (!requireJwtAuth) {
    throw new Error('requireJwtAuth middleware not found');
  }

  const modules = [
    {
      name: 'Admin',
      // Point directly to the compiled router factory
      path: path.resolve(__dirname, '..', 'librechat-admin', 'dist', 'router'),
      route: '/admin',
    },
    // Future modules can be added here:
    // {
    //   name: 'Analytics',
    //   path: path.resolve(__dirname, '..', 'analytics', 'dist', 'router'),
    //   route: '/analytics',
    // },
  ];

  modules.forEach(({ name, path: modulePath, route }) => {
    try {
      const mod = require(modulePath);

      let router;
      if (typeof mod === 'function') {
        // Legacy default export (back-compat)
        router = mod(requireJwtAuth);
      } else if (mod?.buildAdminRouter) {
        router = mod.buildAdminRouter(requireJwtAuth);
      } else {
        throw new Error('Expected router factory not found');
      }

      app.use(route, router);
      console.info(`[${name}] routes mounted at ${route}`);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') {
        console.error(`[${name}] Mount error:`, e);
      } else {
        console.warn(`[${name}] Module not found at ${modulePath}`);
      }
    }
  });

  /**
   * Reloads server configuration and caches without exiting the process.
   * Used by soev.ai admin panel to apply config changes without restart.
   *
   * NOTE: We intentionally do NOT call updateInterfacePermissions here.
   * Admin-managed permissions are stored in AdminSettings and preserved
   * via the hasAdminOverride check in permissions.ts.
   */
  app.post('/api/reload', requireJwtAuth, checkAdmin, async (req, res) => {
    try {
      // Use module-alias paths for clean imports
      const { CacheKeys } = require('librechat-data-provider');
      const getLogStores = require('~/cache/getLogStores');
      const { getAppConfig, clearAppConfigCache } = require('~/server/services/Config');
      const initializeMCPs = require('~/server/services/initializeMCPs');

      const configCache = getLogStores(CacheKeys.CONFIG_STORE);
      const staticCache = getLogStores(CacheKeys.STATIC_CONFIG);

      const keysToDelete = [
        CacheKeys.APP_CONFIG,
        CacheKeys.STARTUP_CONFIG,
        CacheKeys.MODELS_CONFIG,
        CacheKeys.ENDPOINT_CONFIG,
        CacheKeys.TOOLS,
        CacheKeys.PLUGINS,
        CacheKeys.CUSTOM_CONFIG,
        CacheKeys.PROMPTS_CONFIG,
      ];
      for (const key of keysToDelete) {
        await configCache.delete(key);
      }
      if (staticCache) {
        await staticCache.delete(CacheKeys.LIBRECHAT_YAML_CONFIG);
      }

      await clearAppConfigCache();
      await getAppConfig({ refresh: true });
      // NOTE: Removed updateInterfacePermissions call - admin overrides preserved via permissions.ts
      await initializeMCPs();

      res.status(200).json({ message: 'Configuration reloaded successfully.' });
    } catch (error) {
      console.error('[Custom] Reload failed:', error);
      res.status(500).json({ error: 'Reload failed', details: error?.message });
    }
  });
  console.info('[Custom] Reload endpoint mounted at /api/reload');

  app.post('/api/restart', requireJwtAuth, checkAdmin, (req, res) => {
    res.status(200).json({ message: 'Restarting server...' });
    // Allow response to flush before exiting.
    setTimeout(() => process.exit(0), 100);
  });
  console.info('[Custom] Restart endpoint mounted at /api/restart');
};
