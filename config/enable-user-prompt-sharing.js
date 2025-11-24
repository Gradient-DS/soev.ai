const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles, PermissionTypes, Permissions } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { updateAccessPermissions } = require('~/models/Role');

/**
 * Enable SHARED_GLOBAL permission for prompts on the USER role
 * This allows all regular users to share prompts globally with other users
 */
async function enableUserPromptSharing({ dryRun = true } = {}) {
  await connect();

  logger.info('=== Enable User Prompt Sharing Script ===', { dryRun });
  logger.info('This will grant all users the ability to share prompts globally');

  const permissionsUpdate = {
    [PermissionTypes.PROMPTS]: {
      [Permissions.SHARED_GLOBAL]: true,
      [Permissions.USE]: true,
      [Permissions.CREATE]: true,
    },
  };

  if (dryRun) {
    logger.info('\n=== DRY RUN MODE ===');
    logger.info(`Would update ${SystemRoles.USER} role with the following permissions:`);
    logger.info(JSON.stringify(permissionsUpdate, null, 2));
    logger.info('\nThis would allow all users to:');
    logger.info('  - Use prompts (PROMPTS.USE)');
    logger.info('  - Create prompts (PROMPTS.CREATE)');
    logger.info('  - Share prompts globally (PROMPTS.SHARED_GLOBAL)');
    logger.info('\nTo apply these changes, run without --dry-run flag');

    return {
      success: true,
      dryRun: true,
      changes: permissionsUpdate,
    };
  }

  try {
    logger.info(`Updating ${SystemRoles.USER} role permissions...`);
    await updateAccessPermissions(SystemRoles.USER, permissionsUpdate);
    logger.info('✓ Successfully updated USER role permissions');
    logger.info('All users now have the ability to share prompts globally');

    return {
      success: true,
      dryRun: false,
      changes: permissionsUpdate,
    };
  } catch (error) {
    logger.error('Failed to update USER role permissions:', error);
    throw error;
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  enableUserPromptSharing({ dryRun })
    .then((result) => {
      if (result.dryRun) {
        console.log('\n=== DRY RUN COMPLETE ===');
        console.log('No changes were made to the database');
      } else {
        console.log('\n=== UPDATE COMPLETE ===');
        console.log('✓ All users can now share prompts globally');
        console.log('\nUsers will be able to:');
        console.log('  1. Create their own prompts');
        console.log('  2. Share prompts with other users via the share dialog');
        console.log('  3. Make prompts publicly visible to all users in the instance');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n=== UPDATE FAILED ===');
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = { enableUserPromptSharing };

