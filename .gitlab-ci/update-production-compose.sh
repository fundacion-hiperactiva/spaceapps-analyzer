#!/bin/sh
set -eu

repo_url="${PRODUCTION_ENV_REPO_URL:-git@gitlab.hks.ar:hks/production-environment.git}"
target_tag="$(sh "$(dirname "$0")/resolve-version.sh" e3)"
image_path="${CI_REGISTRY_IMAGE:-}"
release_tag="${NEW_PRODUCTION_TAG:-}"

if [ -z "${target_tag}" ] || [ -z "${image_path}" ]; then
  echo "ERROR: Missing resolved E3 version or CI_REGISTRY_IMAGE." >&2
  exit 1
fi

workdir=$(mktemp -d)
trap 'rm -rf "${workdir}"' EXIT

git clone --quiet "${repo_url}" "${workdir}/repo"
cd "${workdir}/repo"

find . -type f \( -name 'docker-compose.yml' -o -name 'docker-compose.yaml' \) -print0 |
  while IFS= read -r -d '' file; do
    if grep -q "${image_path}" "${file}"; then
      sed -i -E "s|(^[[:space:]]*image:[[:space:]]*${image_path}):[^[:space:]]+|\1:${target_tag}|g" "${file}"
    fi
  done

if git status --porcelain | grep -q .; then
  git config user.email "bb-8@hks.ar"
  git config user.name "bb-8"
  commit_msg="chore: update production image to ${target_tag}"
  if [ -n "${release_tag}" ]; then
    commit_msg="${commit_msg} (${release_tag})"
  fi
  git commit -am "${commit_msg}"
  git push origin main
else
  echo "No production compose updates required."
fi
