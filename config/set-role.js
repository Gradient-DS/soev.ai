/**
 * Set a user's role to ADMIN or USER
 * Usage: node config/set-role.js <email> <role>
 * Example: node config/set-role.js lex@gradient-ds.com ADMIN
 */
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const connect = require('./connect');

const VALID_ROLES = ['ADMIN', 'USER'];

const setRole = async () => {
  const email = process.argv[2];
  const role = process.argv[3]?.toUpperCase();

  if (!email || !role) {
    console.error('Usage: node config/set-role.js <email> <role>');
    console.error('Example: node config/set-role.js lex@gradient-ds.com ADMIN');
    console.error('Valid roles: ADMIN, USER');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}`);
    console.error('Valid roles: ADMIN, USER');
    process.exit(1);
  }

  try {
    await connect();

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    const previousRole = user.role;
    user.role = role;
    await user.save();

    console.log(`\nUser role updated successfully!`);
    console.log(`Email: ${user.email}`);
    console.log(`Previous role: ${previousRole || 'USER'}`);
    console.log(`New role: ${role}`);

    process.exit(0);
  } catch (err) {
    console.error('Error updating user role:', err);
    process.exit(1);
  }
};

setRole();
