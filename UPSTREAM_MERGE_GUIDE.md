# Upstream Merge Guide

Step-by-step guide for merging upstream changes into the soev.ai repository.

## Repository Structure

| Component | Origin (Fork) | Upstream (Source) |
|-----------|---------------|-------------------|
| Main repo | `https://github.com/Gradient-DS/soev.ai.git` | `https://github.com/danny-avila/LibreChat.git` |
| `firecrawl/` | N/A (submodule) | `https://github.com/mendableai/firecrawl.git` |
| `packages/agents/` | `https://github.com/gradient-ds/agents.git` | `https://github.com/danny-avila/agents.git` |

## Prerequisites

Ensure you have a clean working directory before starting:

```bash
git status
git stash  # if needed
```

## Merge Order

Always merge in this order to handle dependencies correctly:

1. **Firecrawl submodule** (independent, no internal dependencies)
2. **Agents package** (may have upstream API changes)
3. **LibreChat main repo** (depends on agents package)

---

## Step 1: Update Firecrawl Submodule

Firecrawl is a direct submodule without a fork. Update to the latest upstream commit.

```bash
cd firecrawl
git fetch origin
git checkout main
git pull origin main
cd ..
```

Stage the submodule update:

```bash
git add firecrawl
```

---

## Step 2: Update Agents Package

The agents package is a fork. Merge upstream changes into your fork first.

### 2.1 Add upstream remote (first time only)

```bash
cd packages/agents
git remote add upstream https://github.com/danny-avila/agents.git
```

### 2.2 Fetch and merge upstream

```bash
cd packages/agents
git fetch upstream
git checkout main
git merge upstream/main
```

### 2.3 Resolve conflicts

If conflicts occur:

1. Review conflicting files
2. Keep custom soev.ai modifications where appropriate
3. Accept upstream changes for bug fixes and improvements
4. Test the build after resolution

```bash
# After resolving conflicts
git add .
git commit -m "chore: merge upstream agents"
```

### 2.4 Push to fork

```bash
git push origin main
cd ../..
```

### 2.5 Stage the submodule update

```bash
git add packages/agents
```

---

## Step 3: Update LibreChat Main Repo

Merge the main LibreChat upstream into soev.ai.

### 3.1 Fetch upstream

```bash
git fetch upstream
```

### 3.2 Create merge branch (recommended)

```bash
git checkout -b merge/upstream-$(date +%Y%m%d)
```

### 3.3 Merge upstream

```bash
git merge upstream/main
```

### 3.4 Resolve conflicts

Common conflict areas:

- `package.json` - Keep soev.ai scripts and dependencies
- `librechat.yaml` files - Keep custom configuration
- `client/` - Watch for UI customizations
- `api/` - Watch for custom endpoints

After resolving:

```bash
git add .
git commit -m "chore: merge upstream LibreChat"
```

---

## Step 4: Build and Verify

### 4.1 Install dependencies

```bash
npm install
```

### 4.2 Build all packages

```bash
npm run frontend
```

This runs:
- `build:data-provider`
- `build:data-schemas`
- `build:api`
- `build:client-package`
- `client build`

### 4.3 Full soev.ai build (includes agents and admin)

```bash
npm run soev
```

This additionally builds:
- `build:agents`
- `build:admin-plugin`
- `build:admin-frontend`

### 4.4 Run linting

```bash
npm run lint
```

### 4.5 Run tests

```bash
npm run test:client
npm run test:api
```

---

## Step 5: Finalize

### 5.1 Commit all changes

```bash
git add .
git commit -m "chore: merge upstream changes $(date +%Y-%m-%d)"
```

### 5.2 Merge to main branch

```bash
git checkout main
git merge merge/upstream-$(date +%Y%m%d)
git push origin main
```

### 5.3 Clean up

```bash
git branch -d merge/upstream-$(date +%Y%m%d)
```

---

## Troubleshooting

### Submodule not updating

```bash
git submodule update --init --recursive
```

### Build failures after merge

1. Clear node_modules and reinstall:

```bash
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf client/node_modules
rm -rf api/node_modules
npm install
```

2. Clear build artifacts:

```bash
rm -rf packages/*/dist
rm -rf client/dist
```

3. Rebuild:

```bash
npm run soev
```

### Package version conflicts

Check for version mismatches in:
- Root `package.json`
- `packages/*/package.json`
- `client/package.json`
- `api/package.json`

### Agents package API changes

If upstream agents has breaking changes:

1. Check the agents changelog
2. Update usages in `api/` and `packages/api/`
3. Rebuild agents first: `npm run build:agents`

---

## Quick Reference

```bash
# Full upstream merge (all steps)
cd firecrawl && git pull origin main && cd ..
cd packages/agents && git fetch upstream && git merge upstream/main && git push origin main && cd ../..
git fetch upstream && git merge upstream/main
npm install
npm run soev
npm run lint
git add . && git commit -m "chore: merge upstream $(date +%Y-%m-%d)"
```

---

## Version History

| Date | LibreChat Version | Notes |
|------|-------------------|-------|
| Current | v0.8.1-rc1 | Base version |

