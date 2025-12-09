const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, getBalanceConfig } = require('@librechat/api');
const {
  Constants,
  CacheKeys,
  removeNullishValues,
  defaultSocialLogins,
} = require('librechat-data-provider');
const { getLdapConfig } = require('~/server/services/Config/ldap');
const { getAppConfig } = require('~/server/services/Config/app');
const { getProjectByName } = require('~/models/Project');
const { getMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');
const { mcpServersRegistry } = require('@librechat/api');

// soev.ai: Admin panel config overrides
let getAdminConfigOverrides = null;
try {
  getAdminConfigOverrides = require('@soev.ai/librechat-admin').getAdminConfigOverrides;
} catch (e) {
  logger.debug('[config] Admin module not loaded (getAdminConfigOverrides):', e.message);
}

/**
 * soev.ai: Apply admin panel overrides to config payload
 * DB settings take precedence over YAML config
 */
const applyAdminOverrides = async (payload) => {
  if (!getAdminConfigOverrides) return payload;
  try {
    const overrides = await getAdminConfigOverrides();
    if (!overrides || overrides.size === 0) return payload;

    // Deep clone to avoid mutation
    const result = { ...payload };
    if (!result.interface) result.interface = {};

    // Apply overrides
    for (const [key, value] of overrides) {
      if (key.startsWith('interface.')) {
        const interfaceKey = key.replace('interface.', '');
        result.interface[interfaceKey] = value;
      }
    }

    return result;
  } catch (error) {
    logger.warn('[config] Admin override error:', error.message);
    return payload;
  }
};

const router = express.Router();
const emailLoginEnabled =
  process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);
const passwordResetEnabled = isEnabled(process.env.ALLOW_PASSWORD_RESET);

const sharedLinksEnabled =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

const publicSharedLinksEnabled =
  sharedLinksEnabled &&
  (process.env.ALLOW_SHARED_LINKS_PUBLIC === undefined ||
    isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC));

const sharePointFilePickerEnabled = isEnabled(process.env.ENABLE_SHAREPOINT_FILEPICKER);
const openidReuseTokens = isEnabled(process.env.OPENID_REUSE_TOKENS);

// soev.ai: Get MCP server permissions for a role
let getMCPServerPermissionsForRole = null;
try {
  getMCPServerPermissionsForRole = require('@soev.ai/librechat-admin').getMCPServerPermissions;
} catch (e) {
  logger.debug('[config] Admin module not loaded (getMCPServerPermissions):', e.message);
}

/**
 * Fetches MCP servers from registry and adds them to the payload.
 * Registry now includes all configured servers (from YAML) plus inspection data when available.
 * Always fetches fresh to avoid caching incomplete initialization state.
 * soev.ai: Filters servers based on role permissions when available.
 */
const getMCPServers = async (payload, appConfig, userRole) => {
  try {
    if (appConfig?.mcpConfig == null) {
      return;
    }
    const mcpManager = getMCPManager();
    if (!mcpManager) {
      return;
    }
    const mcpServers = await mcpServersRegistry.getAllServerConfigs();
    if (!mcpServers) return;

    // soev.ai: Get MCP permissions for the user's role
    // Note: userRole may be undefined for unauthenticated requests (initial page load)
    // Client-side filtering handles UX; this provides defense-in-depth for authenticated requests
    let mcpPermissions = {};
    if (getMCPServerPermissionsForRole && userRole) {
      try {
        mcpPermissions = await getMCPServerPermissionsForRole(userRole);
        logger.debug(`[config] MCP permissions for role '${userRole}':`, mcpPermissions);
      } catch (err) {
        logger.warn('[config] Error fetching MCP permissions:', err.message);
      }
    }

    for (const serverName in mcpServers) {
      // soev.ai: Skip if server is explicitly disabled for this role
      // (undefined or true = enabled, false = disabled)
      if (mcpPermissions[serverName] === false) {
        logger.debug(`[config] Skipping MCP server '${serverName}' - disabled for role '${userRole}'`);
        continue;
      }

      if (!payload.mcpServers) {
        payload.mcpServers = {};
      }
      const serverConfig = mcpServers[serverName];
      payload.mcpServers[serverName] = removeNullishValues({
        startup: serverConfig?.startup,
        chatMenu: serverConfig?.chatMenu,
        isOAuth: serverConfig.requiresOAuth,
        customUserVars: serverConfig?.customUserVars,
      });
    }
  } catch (error) {
    logger.error('Error loading MCP servers', error);
  }
};

router.get('/', async function (req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);

  let cachedStartupConfig = await cache.get(CacheKeys.STARTUP_CONFIG);
  if (cachedStartupConfig) {
    // soev.ai: Clone the cached config to avoid mutating it (MCP servers are role-specific)
    const responsePayload = { ...cachedStartupConfig };
    delete responsePayload.mcpServers; // Clear any cached mcpServers
    // soev.ai: Apply admin panel overrides
    const finalPayload = await applyAdminOverrides(responsePayload);
    const appConfig = await getAppConfig({ role: req.user?.role });
    await getMCPServers(finalPayload, appConfig, req.user?.role);
    res.send(finalPayload);
    return;
  }

  const isBirthday = () => {
    const today = new Date();
    return today.getMonth() === 1 && today.getDate() === 11;
  };

  const instanceProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, '_id');

  const ldap = getLdapConfig();

  try {
    const appConfig = await getAppConfig({ role: req.user?.role });

    const isOpenIdEnabled =
      !!process.env.OPENID_CLIENT_ID &&
      !!process.env.OPENID_CLIENT_SECRET &&
      !!process.env.OPENID_ISSUER &&
      !!process.env.OPENID_SESSION_SECRET;

    const isSamlEnabled =
      !!process.env.SAML_ENTRY_POINT &&
      !!process.env.SAML_ISSUER &&
      !!process.env.SAML_CERT &&
      !!process.env.SAML_SESSION_SECRET;

    const balanceConfig = getBalanceConfig(appConfig);

    /** @type {TStartupConfig} */
    const payload = {
      appTitle: process.env.APP_TITLE || 'LibreChat',
      socialLogins: appConfig?.registration?.socialLogins ?? defaultSocialLogins,
      discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
      facebookLoginEnabled:
        !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
      githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
      googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      appleLoginEnabled:
        !!process.env.APPLE_CLIENT_ID &&
        !!process.env.APPLE_TEAM_ID &&
        !!process.env.APPLE_KEY_ID &&
        !!process.env.APPLE_PRIVATE_KEY_PATH,
      openidLoginEnabled: isOpenIdEnabled,
      openidLabel: process.env.OPENID_BUTTON_LABEL || 'Continue with OpenID',
      openidImageUrl: process.env.OPENID_IMAGE_URL,
      openidAutoRedirect: isEnabled(process.env.OPENID_AUTO_REDIRECT),
      samlLoginEnabled: !isOpenIdEnabled && isSamlEnabled,
      samlLabel: process.env.SAML_BUTTON_LABEL,
      samlImageUrl: process.env.SAML_IMAGE_URL,
      serverDomain: process.env.DOMAIN_SERVER || 'http://localhost:3080',
      emailLoginEnabled,
      registrationEnabled: !ldap?.enabled && isEnabled(process.env.ALLOW_REGISTRATION),
      socialLoginEnabled: isEnabled(process.env.ALLOW_SOCIAL_LOGIN),
      emailEnabled:
        (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
        !!process.env.EMAIL_USERNAME &&
        !!process.env.EMAIL_PASSWORD &&
        !!process.env.EMAIL_FROM,
      passwordResetEnabled,
      showBirthdayIcon:
        isBirthday() ||
        isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
        process.env.SHOW_BIRTHDAY_ICON === '',
      helpAndFaqURL: process.env.HELP_AND_FAQ_URL || 'https://librechat.ai',
      interface: appConfig?.interfaceConfig,
      turnstile: appConfig?.turnstileConfig,
      modelSpecs: appConfig?.modelSpecs,
      balance: balanceConfig,
      sharedLinksEnabled,
      publicSharedLinksEnabled,
      analyticsGtmId: process.env.ANALYTICS_GTM_ID,
      instanceProjectId: instanceProject._id.toString(),
      bundlerURL: process.env.SANDPACK_BUNDLER_URL,
      staticBundlerURL: process.env.SANDPACK_STATIC_BUNDLER_URL,
      sharePointFilePickerEnabled,
      sharePointBaseUrl: process.env.SHAREPOINT_BASE_URL,
      sharePointPickerGraphScope: process.env.SHAREPOINT_PICKER_GRAPH_SCOPE,
      sharePointPickerSharePointScope: process.env.SHAREPOINT_PICKER_SHAREPOINT_SCOPE,
      openidReuseTokens,
      conversationImportMaxFileSize: process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES
        ? parseInt(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES, 10)
        : 0,
    };

    const minPasswordLength = parseInt(process.env.MIN_PASSWORD_LENGTH, 10);
    if (minPasswordLength && !isNaN(minPasswordLength)) {
      payload.minPasswordLength = minPasswordLength;
    }

    const webSearchConfig = appConfig?.webSearch;
    if (
      webSearchConfig != null &&
      (webSearchConfig.searchProvider ||
        webSearchConfig.scraperProvider ||
        webSearchConfig.rerankerType)
    ) {
      payload.webSearch = {};
    }

    if (webSearchConfig?.searchProvider) {
      payload.webSearch.searchProvider = webSearchConfig.searchProvider;
    }
    if (webSearchConfig?.scraperProvider) {
      payload.webSearch.scraperProvider = webSearchConfig.scraperProvider;
    }
    if (webSearchConfig?.rerankerType) {
      payload.webSearch.rerankerType = webSearchConfig.rerankerType;
    }

    if (ldap) {
      payload.ldap = ldap;
    }

    if (typeof process.env.CUSTOM_FOOTER === 'string') {
      payload.customFooter = process.env.CUSTOM_FOOTER;
    }

    await cache.set(CacheKeys.STARTUP_CONFIG, payload);
    // soev.ai: Apply admin panel overrides before sending
    const finalPayload = await applyAdminOverrides(payload);
    await getMCPServers(finalPayload, appConfig, req.user?.role);
    return res.status(200).send(finalPayload);
  } catch (err) {
    logger.error('Error in startup config', err);
    return res.status(500).send({ error: err.message });
  }
});

module.exports = router;
