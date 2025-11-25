require('module-alias/register');
const connect = require('./connect');
const Role = require('~/models/Role');

(async () => {
  await connect();

  console.log('\n=== Checking Prompt Permissions ===\n');

  const userRole = await Role.getRoleByName('USER');
  const adminRole = await Role.getRoleByName('ADMIN');

  console.log('USER Role Prompt Permissions:');
  console.log(JSON.stringify(userRole?.permissions?.prompts || {}, null, 2));

  console.log('\nADMIN Role Prompt Permissions:');
  console.log(JSON.stringify(adminRole?.permissions?.prompts || {}, null, 2));

  console.log('\n=== Permission Details ===');
  console.log('User has SHARED_GLOBAL:', userRole?.permissions?.prompts?.shared_global ?? false);
  console.log('User has CREATE:', userRole?.permissions?.prompts?.create ?? false);
  console.log('User has USE:', userRole?.permissions?.prompts?.use ?? false);

  console.log('\nAdmin has SHARED_GLOBAL:', adminRole?.permissions?.prompts?.shared_global ?? false);
  console.log('Admin has CREATE:', adminRole?.permissions?.prompts?.create ?? false);
  console.log('Admin has USE:', adminRole?.permissions?.prompts?.use ?? false);

  process.exit(0);
})();

