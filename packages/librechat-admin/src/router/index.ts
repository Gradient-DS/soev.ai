import express, { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { resolveFromRoot } from '../utils/paths';
import {
  getRolePermissions,
  updateRolePermission,
  getAllRolePermissions,
  PERMISSION_FEATURES,
  ROLES,
} from '../services/configService';

/**
 * Factory to build an Express router for the soev.ai admin plugin.
 * The JWT-based authentication middleware from LibreChat core **must** be
 * provided by the caller (see packages/custom/mount.js).
 */
export function buildAdminRouter(
  requireJwtAuth: (req: Request, res: Response, next: NextFunction) => void,
): Router {
  const router = express.Router();

  // Importing enums/constants that are safe to resolve directly
  const { SystemRoles } = require('librechat-data-provider');

  const protectedPaths = ['/health', '/roles*', '/settings*', '/users*'];

  router.use(protectedPaths, (req: any, res: any, next: any) => {
    requireJwtAuth(req, res, (err?: any) => {
      if (err) {
        return next(err);
      }
      next();
    });
  });

  // Custom admin check middleware (only for protected API endpoints)
  router.use(protectedPaths, (req: any, res: any, next: any) => {
    try {
      if (!req.user) {
        const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
        if (isHtmlRequest) {
          return res.redirect('/login');
        } else {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }

      if (req.user.role !== SystemRoles.ADMIN) {
        const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
        if (isHtmlRequest) {
          return res.redirect('/login');
        } else {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }

      next();
    } catch (error) {
      const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
      if (isHtmlRequest) {
        return res.redirect('/login');
      } else {
        res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  });

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ plugin: 'soevai-admin', status: 'ok' });
  });

  // ---------- Role Permission Endpoints ----------

  // Get all role permissions with feature metadata
  router.get('/roles/permissions', async (_req, res) => {
    try {
      const permissions = await getAllRolePermissions();
      res.json({
        permissions,
        features: PERMISSION_FEATURES,
        roles: ROLES,
      });
    } catch (err: any) {
      console.error('[admin/roles/permissions] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get permissions for a specific role
  router.get('/roles/:roleName/permissions', async (req, res) => {
    try {
      const { roleName } = req.params;
      if (!ROLES.includes(roleName as any)) {
        return res.status(400).json({ message: `Invalid role: ${roleName}` });
      }
      const permissions = await getRolePermissions(roleName);
      res.json({ permissions });
    } catch (err: any) {
      console.error('[admin/roles/:roleName/permissions] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update a permission for a role
  router.put('/roles/:roleName/permissions', async (req, res) => {
    try {
      const { roleName } = req.params;
      const { permissionType, permission, value } = req.body;

      if (!ROLES.includes(roleName as any)) {
        return res.status(400).json({ message: `Invalid role: ${roleName}` });
      }

      if (!permissionType || !permission || typeof value !== 'boolean') {
        return res.status(400).json({
          message: 'Required: permissionType, permission, and value (boolean)',
        });
      }

      await updateRolePermission(roleName, permissionType, permission, value);

      // Return updated permissions
      const permissions = await getRolePermissions(roleName);
      res.json({
        message: `Permission updated for ${roleName}`,
        permissions,
      });
    } catch (err: any) {
      console.error('[admin/roles/:roleName/permissions] update error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // ---------- Admin Settings Endpoints (DB-first config) ----------
  const {
    getAllYamlDefaults,
    getAdminSettings,
    setAdminSetting,
    revertToYamlDefault,
    revertAllToYamlDefaults,
    isAdminManagedKey,
    ADMIN_MANAGED_KEYS,
  } = require('../services/adminSettingsService');

  // Get all admin settings with YAML defaults
  router.get('/settings/all', async (_req, res) => {
    try {
      const settings = await getAdminSettings('global');
      const defaults = await getAllYamlDefaults();
      res.json({
        settings: Object.fromEntries(settings),
        defaults,
        managedKeys: ADMIN_MANAGED_KEYS,
      });
    } catch (err: any) {
      console.error('[admin/settings/all] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get YAML defaults only - reads directly from app config
  router.get('/settings/yamlDefaults', async (_req, res) => {
    try {
      // Get the app config which contains the YAML interface settings
      const { getAppConfig } = require('~/server/services/Config/app');
      const appConfig = await getAppConfig();
      const interfaceConfig = appConfig?.interfaceConfig || {};

      // Extract only the keys we manage
      const defaults: Record<string, any> = {
        prompts: interfaceConfig.prompts,
        agents: interfaceConfig.agents,
        webSearch: interfaceConfig.webSearch,
      };

      res.json({ defaults });
    } catch (err: any) {
      console.error('[admin/settings/yamlDefaults] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update a specific interface setting
  router.put('/settings/interface/:key', async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value, yamlDefault } = req.body;
      const fullKey = `interface.${key}`;

      if (!isAdminManagedKey(fullKey)) {
        return res.status(400).json({ message: `Key not allowed: ${key}` });
      }

      await setAdminSetting(fullKey, value, yamlDefault, {
        updatedBy: req.user?.id || null,
      });

      res.json({ key, value, success: true });
    } catch (err: any) {
      console.error('[admin/settings/interface/:key] update error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Revert a specific setting to YAML default
  router.post('/settings/revert/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const fullKey = `interface.${key}`;

      if (!isAdminManagedKey(fullKey)) {
        return res.status(400).json({ message: `Key not allowed: ${key}` });
      }

      const newValue = await revertToYamlDefault(fullKey);
      res.json({ key, value: newValue, reverted: true });
    } catch (err: any) {
      console.error('[admin/settings/revert/:key] error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Revert all settings to YAML defaults
  router.post('/settings/revert-all', async (_req, res) => {
    try {
      await revertAllToYamlDefaults();
      res.json({ success: true, message: 'All settings reverted to YAML defaults' });
    } catch (err: any) {
      console.error('[admin/settings/revert-all] error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // ---------- User Management Endpoints ----------
  const {
    listUsers,
    getUser,
    createUser: createUserSvc,
    updateUserById,
    deleteUserCompletely,
    getUserBalance,
    updateUserBalance,
    getUserStats,
  } = require('../services/userService');

  // List users with pagination / search
  router.get('/users', async (req, res) => {
    try {
      const { page = '1', limit = '20', search = '' } = req.query as Record<string, string>;
      const result = await listUsers({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search,
      });
      res.json(result);
    } catch (err: any) {
      console.error('[admin/users] list error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Create user
  router.post('/users', async (req, res) => {
    try {
      const user = await createUserSvc(req.body);
      res.status(201).json(user);
    } catch (err: any) {
      console.error('[admin/users] create error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // User statistics for dashboard cards (place BEFORE /users/:id)
  router.get('/users/stats', async (_req, res) => {
    try {
      const stats = await getUserStats();
      res.json(stats);
    } catch (err: any) {
      console.error('[admin/users] stats error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get user detail
  router.get('/users/:id', async (req, res) => {
    try {
      const user = await getUser(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (err: any) {
      console.error('[admin/users] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update user
  router.put('/users/:id', async (req, res) => {
    try {
      const updated = await updateUserById(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      console.error('[admin/users] update error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // Delete user
  router.delete('/users/:id', async (req, res) => {
    try {
      await deleteUserCompletely(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      console.error('[admin/users] delete error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Balance endpoints
  router.get('/users/:id/balance', async (req, res) => {
    try {
      const balance = await getUserBalance(req.params.id);
      // If no balance record exists, respond with default zero credits instead of 404
      if (!balance) return res.json({ tokenCredits: 0 });
      res.json(balance);
    } catch (err: any) {
      console.error('[admin/users] balance get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.put('/users/:id/balance', async (req, res) => {
    try {
      const balance = await updateUserBalance(req.params.id, req.body);
      res.json(balance);
    } catch (err: any) {
      console.error('[admin/users] balance update error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // ---------- Static Frontend Serving ----------
  const distPath = resolveFromRoot('admin-frontend', 'dist');
  console.log('Admin frontend dist path:', distPath);

  // Serve React index for the base paths before static middleware
  router.get(['', '/'], (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  if (fs.existsSync(distPath)) {
    // Serve static assets (these will be protected by the middleware above)
    router.use('/', express.static(distPath));

    // Handle HTML requests - if we reach here, authentication passed
    router.get('*', (req, res, next) => {
      const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
      if (isHtmlRequest) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        next();
      }
    });
  } else {
    console.warn('WARNING: Admin frontend dist folder not found!');
  }

  return router;
}
