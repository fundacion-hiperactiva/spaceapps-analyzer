#!/bin/sh
set -eu

branch="${CI_COMMIT_BRANCH:-}"
default_branch="${CI_DEFAULT_BRANCH:-}"
commit_sha="${CI_COMMIT_SHORT_SHA:-}"
registry_image="${CI_REGISTRY_IMAGE:-}"

if [ -z "$branch" ] || [ -z "$commit_sha" ] || [ -z "$registry_image" ]; then
  echo "ERROR: Missing required CI variables." >&2
  exit 1
fi

case "$branch" in
  "$default_branch")
    releaseversion=$(sh .gitlab-ci/resolve-version.sh e3)
    ;;
  develop)
    releaseversion=$(sh .gitlab-ci/resolve-version.sh e1)
    ;;
  testing)
    releaseversion=$(sh .gitlab-ci/resolve-version.sh e2)
    ;;
  *)
    releaseversion="$(sh .gitlab-ci/resolve-version.sh e1)-${commit_sha}"
    ;;
esac

if [ -z "$releaseversion" ]; then
  echo "ERROR: Unable to determine release version." >&2
  exit 1
fi

echo "Release version: '${releaseversion}'"

docker build --pull --build-arg "rversion=${releaseversion}" -t "${registry_image}:${commit_sha}" .
docker tag "${registry_image}:${commit_sha}" "${registry_image}:${releaseversion}"
docker tag "${registry_image}:${commit_sha}" "${registry_image}:${releaseversion}-${commit_sha}"

docker push "${registry_image}:${releaseversion}"
docker push "${registry_image}:${releaseversion}-${commit_sha}"

docker rmi "${registry_image}:${commit_sha}" || true
docker rmi "${registry_image}:${releaseversion}" || true
docker image prune -a --force || true
docker system prune -a -f || true
