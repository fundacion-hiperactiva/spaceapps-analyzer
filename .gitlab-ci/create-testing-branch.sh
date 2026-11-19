#!/usr/bin/env bash

set -euo pipefail

echo "Refreshing testing branch to point at ${CI_COMMIT_SHA}"
AUTH_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN}"
if [[ -n "${GITLAB_PERSONAL_ACCESS_TOKEN:-}" ]]; then
  AUTH_HEADER="PRIVATE-TOKEN: ${GITLAB_PERSONAL_ACCESS_TOKEN}"
fi

BRANCH_ENDPOINT="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/repository/branches/testing"
if curl --silent --fail --header "${AUTH_HEADER}" "${BRANCH_ENDPOINT}" >/dev/null; then
  echo "Existing testing branch detected; attempting to delete before recreation."
  curl --silent --request DELETE --header "${AUTH_HEADER}" "${BRANCH_ENDPOINT}" >/dev/null || echo "WARN: unable to delete existing testing branch via API."
fi

if curl --fail --request POST --header "${AUTH_HEADER}" \
     --data-urlencode branch=testing \
     --data-urlencode ref="${CI_COMMIT_SHA}" \
     "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/repository/branches"; then
  echo "testing branch recreated via GitLab API."
else
  echo "Falling back to git push for testing branch recreation."
  git remote set-url origin "git@${CI_SERVER_HOST}:${CI_PROJECT_PATH}.git"
  git fetch origin
  git push origin "${CI_COMMIT_SHA}:refs/heads/testing" --force
  echo "testing branch updated via git push."
fi
