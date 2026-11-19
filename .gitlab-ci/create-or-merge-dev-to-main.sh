
      set -euo pipefail

      echo "DEBUG: CI_PROJECT_ID='$CI_PROJECT_ID'"
      echo "DEBUG: CI_DEFAULT_BRANCH='$CI_DEFAULT_BRANCH'"
      echo "DEBUG: CI_COMMIT_BRANCH='$CI_COMMIT_BRANCH'"
      echo "DEBUG: CI_PIPELINE_SOURCE='$CI_PIPELINE_SOURCE'"

      if [ -z "$CI_PROJECT_ID" ]; then
        echo "ERROR: CI_PROJECT_ID is not set or empty"; exit 1;
      fi
      PROJECT_ID="$CI_PROJECT_ID"

      echo "Project: $PROJECT_ID | Source: $SOURCE_BRANCH -> Target: $TARGET_BRANCH"

      # 1) Check for an existing Merge Request
      echo "Checking for existing MR..."
      MR_JSON="$(curl -sfS --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
        "$GITLAB_API/projects/$PROJECT_ID/merge_requests?state=opened&source_branch=$SOURCE_BRANCH&target_branch=$TARGET_BRANCH")"
      MR_IID="$(echo "$MR_JSON" | jq -r '.[0].iid // empty')"

      if [ -z "$MR_IID" ]; then
        echo "No open MR found. Creating one…"
        CREATE_JSON="$(curl -sfS -X POST --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
          --data-urlencode "source_branch=$SOURCE_BRANCH" \
          --data-urlencode "target_branch=$TARGET_BRANCH" \
          --data-urlencode "title=Auto: $SOURCE_BRANCH → $TARGET_BRANCH ($(date -u +%F))" \
          --data-urlencode "remove_source_branch=false" \
          --data-urlencode "squash=false" \
          "$GITLAB_API/projects/$PROJECT_ID/merge_requests")"
        MR_IID="$(echo "$CREATE_JSON" | jq -r '.iid')"
        echo "Created MR IID=$MR_IID"
      else
        echo "Found existing MR IID=$MR_IID"
      fi

      # 2) Attempt to rebase
      echo "Requesting rebase…"
      REBASE_RESPONSE=$(curl -w "%{http_code}" -s -X PUT --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
        "$GITLAB_API/projects/$PROJECT_ID/merge_requests/$MR_IID/rebase" || echo "000")

      if [[ "$REBASE_RESPONSE" =~ ^2[0-9][0-9]$ ]]; then
        echo "Rebase successful"
        sleep 10
      else
        echo "Rebase failed or not needed (HTTP: $REBASE_RESPONSE). Continuing..."
      fi

      # 3) Check MR status
      echo "Checking MR status..."
      STATE_JSON="$(curl -sfS --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
        "$GITLAB_API/projects/$PROJECT_ID/merge_requests/$MR_IID")"
      MERGE_STATUS="$(echo "$STATE_JSON" | jq -r '.merge_status')"
      SHA="$(echo "$STATE_JSON" | jq -r '.sha')"
      PIPELINE_STATUS="$(echo "$STATE_JSON" | jq -r '.head_pipeline.status // "unknown"')"
      echo "merge_status=$MERGE_STATUS, pipeline_status=$PIPELINE_STATUS"

      # 4) Merge if possible, otherwise set to auto-merge
      if [ "$MERGE_STATUS" = "can_be_merged" ]; then
        echo "MR is ready to merge. Attempting merge..."
        MERGE_RESPONSE=$(curl -w "%{http_code}" -s -X PUT --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
          --data-urlencode "sha=$SHA" \
          --data-urlencode "should_remove_source_branch=false" \
          "$GITLAB_API/projects/$PROJECT_ID/merge_requests/$MR_IID/merge")
        
        if [[ "$MERGE_RESPONSE" =~ ^2[0-9][0-9]$ ]]; then
          echo "✅ Successfully merged MR IID=$MR_IID"
        else
          echo "❌ Merge failed (HTTP: $MERGE_RESPONSE). Setting auto-merge..."
          curl -sfS -X PUT --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
            --data-urlencode "merge_when_pipeline_succeeds=true" \
            --data-urlencode "sha=$SHA" \
            "$GITLAB_API/projects/$PROJECT_ID/merge_requests/$MR_IID/merge" >/dev/null || true
          echo "🔄 Auto-merge enabled"
        fi
      else
        echo "MR cannot be merged now (status: $MERGE_STATUS). Setting auto-merge..."
        AUTO_MERGE_RESPONSE=$(curl -w "%{http_code}" -s -X PUT --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
          --data-urlencode "merge_when_pipeline_succeeds=true" \
          --data-urlencode "sha=$SHA" \
          "$GITLAB_API/projects/$PROJECT_ID/merge_requests/$MR_IID/merge" || echo "000")
        
        if [[ "$AUTO_MERGE_RESPONSE" =~ ^2[0-9][0-9]$ ]]; then
          echo "🔄 Auto-merge enabled successfully"
        else
          echo "⚠️  Auto-merge setup failed (HTTP: $AUTO_MERGE_RESPONSE)"
          echo "📋 MR IID=$MR_IID created but requires manual intervention"
        fi
      fi