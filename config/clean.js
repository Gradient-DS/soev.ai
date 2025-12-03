/**
 * Clean script for removing node_modules, package-lock.json, and dist folders.
 * Used before upstream merges or when a full reinstall is needed.
 * Excludes the firecrawl submodule.
 */
const fs = require('fs');
const path = require('path');

require('./helpers');

const rootDir = path.resolve(__dirname, '..');

const excludeDirs = ['firecrawl', '.git'];

function shouldExclude(filePath) {
  return excludeDirs.some((exclude) => filePath.includes(path.sep + exclude + path.sep) || filePath.endsWith(path.sep + exclude));
}

function deleteIfExists(targetPath, label) {
  if (fs.existsSync(targetPath) && !shouldExclude(targetPath)) {
    console.purple(`Deleting ${label}: ${path.relative(rootDir, targetPath)}`);
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function findAndDelete(dir, targetName, isDirectory) {
  let count = 0;
  
  if (shouldExclude(dir)) {
    return count;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (shouldExclude(fullPath)) {
        continue;
      }

      if (entry.name === targetName) {
        if ((isDirectory && entry.isDirectory()) || (!isDirectory && entry.isFile())) {
          if (deleteIfExists(fullPath, targetName)) {
            count++;
          }
          continue;
        }
      }

      if (entry.isDirectory() && entry.name !== 'node_modules') {
        count += findAndDelete(fullPath, targetName, isDirectory);
      }
    }
  } catch (err) {
    console.red(`Error reading directory ${dir}: ${err.message}`);
  }

  return count;
}

console.green('🧹 Starting clean...\n');

console.cyan('Removing node_modules directories...');
const nodeModulesCount = findAndDelete(rootDir, 'node_modules', true);
console.gray(`  Removed ${nodeModulesCount} node_modules directories\n`);

console.cyan('Removing package-lock.json files...');
const lockfileCount = findAndDelete(rootDir, 'package-lock.json', false);
console.gray(`  Removed ${lockfileCount} package-lock.json files\n`);

console.cyan('Removing dist directories...');
const distCount = findAndDelete(rootDir, 'dist', true);
console.gray(`  Removed ${distCount} dist directories\n`);

console.green('✅ Clean complete!\n');
console.cyan('Next steps:');
console.white('  npm install');
console.white('  npm run soev');

