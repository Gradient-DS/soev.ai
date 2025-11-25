#!/bin/bash
# Disables upstream LibreChat workflows by renaming them to .disabled
# Run this script after merging from upstream to prevent unwanted workflow runs
#
# Usage: .github/scripts/disable-upstream-workflows.sh

set -euo pipefail

WORKFLOW_DIR=".github/workflows"

# Workflows to KEEP (soev.ai specific workflows)
KEEP_WORKFLOWS=(
  "soevai-images.yml"
  "deploy-soevai.yml"
)

cd "$(git rev-parse --show-toplevel)"

is_keep_workflow() {
  local file="$1"
  for keep in "${KEEP_WORKFLOWS[@]}"; do
    if [[ "$file" == "$keep" ]]; then
      return 0
    fi
  done
  return 1
}

echo "Disabling upstream LibreChat workflows..."
echo "Keeping: ${KEEP_WORKFLOWS[*]}"
echo

disabled_count=0
for workflow in "$WORKFLOW_DIR"/*.yml; do
  filename=$(basename "$workflow")
  
  if is_keep_workflow "$filename"; then
    echo "✓ Keeping: $filename"
  else
    if [[ -f "$workflow" ]]; then
      mv "$workflow" "$workflow.disabled"
      echo "✗ Disabled: $filename"
      ((disabled_count++))
    fi
  fi
done

echo
echo "Done. Disabled $disabled_count workflow(s)."
echo
echo "To re-enable a workflow, rename it back to .yml:"
echo "  mv .github/workflows/<name>.yml.disabled .github/workflows/<name>.yml"

