#!/usr/bin/env bash

set -euo pipefail

# Prefer GitLab's own SSH URL for this project
if [[ -n "${CI_PROJECT_SSH_URL:-}" ]]; then
  REPO_SSH_URL="${CI_PROJECT_SSH_URL}"
else
  # Fallback for very old runners or manual runs
  if [[ "${CI_SERVER_HOST:-}" == "gitlab.com" ]]; then
    REPO_SSH_URL="git@gitlab.com:${CI_PROJECT_PATH}.git"
  else
    REPO_SSH_URL="git@${CI_SERVER_HOST:-gitlab.hks.ar}:${CI_PROJECT_PATH}.git"
  fi
fi


WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

cd "${WORKDIR}"
git clone "${REPO_SSH_URL}" repo
cd repo
git fetch origin --prune
git checkout -B testing "${CI_COMMIT_SHA}"

if git merge origin/main --no-ff --no-edit; then
  echo "Merged origin/main into testing without conflicts."
else
  echo "Merge conflicts detected; attempting resolution by keeping testing branch changes."
  git merge --abort || true
  git merge origin/main --no-ff --no-edit -X ours
fi

git push origin testing --force-with-lease

AUTH_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN}"
if [[ -n "${GITLAB_PERSONAL_ACCESS_TOKEN:-}" ]]; then
  AUTH_HEADER="PRIVATE-TOKEN: ${GITLAB_PERSONAL_ACCESS_TOKEN}"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed." >&2
  exit 1
fi

select_random_user() {
  local -a candidates=("$@")
  if [[ ${#candidates[@]} -eq 0 ]]; then
    return 1
  fi

  if command -v shuf >/dev/null 2>&1; then
    printf "%s\n" "${candidates[@]}" | shuf -n1
  else
    local idx=$((RANDOM % ${#candidates[@]}))
    printf "%s\n" "${candidates[$idx]}"
  fi
}

lookup_user_id() {
  local username="$1"
  curl --silent --header "${AUTH_HEADER}" \
    "${CI_API_V4_URL}/users?username=${username}" |
    jq -r '.[0].id // empty'
}

CURRENT_MILESTONE_TITLE="${CURRENT_MILESTONE_TITLE:-Flaming}"
encoded_milestone="$(printf '%s' "${CURRENT_MILESTONE_TITLE}" | jq -s -R -r @uri)"
milestone_id="$(
  curl --silent --header "${AUTH_HEADER}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/milestones?state=active&search=${encoded_milestone}" |
    jq -r --arg title "${CURRENT_MILESTONE_TITLE}" '.[] | select(.title == $title) | .id' | head -n1
)"

if [[ -z "${milestone_id}" ]]; then
  echo "WARNING: Unable to find milestone '${CURRENT_MILESTONE_TITLE}'."
fi

current_hour=$(date +%H)
current_day=$(date +%u) # 1 (Mon) .. 7 (Sun)

declare -a candidates
if [[ "${current_day}" -ge 1 && "${current_day}" -le 5 && "${current_hour}" -ge 8 && "${current_hour}" -lt 13 ]]; then
  candidates=(hks-borges hks-lugones hks-saer hks-bonelli hks-cortazar)
else
  candidates=(hks-cortazar hks-bonelli)
fi

assignee_username="$(select_random_user "${candidates[@]}")"
reviewer_username="$(select_random_user "${candidates[@]}")"

assignee_id=""
if [[ -n "${assignee_username}" ]]; then
  assignee_id="$(lookup_user_id "${assignee_username}")"
fi

reviewer_id=""
if [[ -n "${reviewer_username}" ]]; then
  reviewer_id="$(lookup_user_id "${reviewer_username}")"
fi

echo "Checking for existing merge requests from testing to main."
MR_LIST="$(curl --silent --header "${AUTH_HEADER}" "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests?state=opened&source_branch=testing&target_branch=main")"
if echo "${MR_LIST}" | grep -q '"iid"'; then
  echo "Merge request already exists; no action taken."
  exit 0
fi

echo "Creating merge request testing -> main."
curl_args=(
  --fail
  --header "${AUTH_HEADER}"
  --data-urlencode source_branch=testing
  --data-urlencode target_branch=main
  --data-urlencode title="Automated promotion testing -> main (${CI_COMMIT_SHORT_SHA})"
  --data remove_source_branch=true
)

if [[ -n "${milestone_id}" ]]; then
  curl_args+=(--data "milestone_id=${milestone_id}")
fi

if [[ -n "${assignee_id}" ]]; then
  curl_args+=(--data "assignee_id=${assignee_id}")
fi

if [[ -n "${reviewer_id}" ]]; then
  curl_args+=(--data "reviewer_ids[]=${reviewer_id}")
fi

curl "${curl_args[@]}" \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests"
