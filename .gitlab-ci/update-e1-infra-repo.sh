set -euo pipefail
e1_version="$(sh "$(dirname "$0")/resolve-version.sh" e1)"
git clone --verbose --progress "$REPO_URL"
cd "$REPO_DIRECTORY"

echo "DEBUG before:"
grep -E '^\s*image:\s*'"$CI_REGISTRY_IMAGE"':' docker-compose.yml || true

# Replace the tag for that exact image path
# ^\s*image:\s*  (keep indent/spacing)
# (gitlab.../amaia/amaia-backend):[^[:space:]]+  (same path, any old tag)
# → same path with the resolved E1 version
sed -i -E "s|(^[[:space:]]*image:[[:space:]]*)($CI_REGISTRY_IMAGE):[^[:space:]]+|\1\2:$e1_version|g" docker-compose.yml

echo "DEBUG after:"
grep -E '^\s*image:\s*'"$CI_REGISTRY_IMAGE"':' docker-compose.yml || true

if git diff --quiet -- docker-compose.yml; then
  echo 'No version update needed or no matching images found.'
  exit 0
fi

git add docker-compose.yml
git commit -m "Update Docker image to $CI_REGISTRY_IMAGE:$e1_version" || { echo 'WARN: nothing to commit'; exit 0; }
git push origin main
