#!/bin/bash
export TZ="${VERSION_TIMEZONE:-UTC+3}"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
if [ -n "$SSH_KEY_PATH" ]; then
  eval "$(ssh-agent -s)"
  ssh-add "${SSH_KEY_PATH}"
fi

date
hostname
echo "🆙: updating package version"
pwd

if [ -n "$GITLAB_PERSONAL_ACCESS_TOKEN" ]; then
  git remote set-url origin https://oauth2:${GITLAB_PERSONAL_ACCESS_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git
fi

REMOTE="origin"
if git remote | grep -q "^gitlab-com$"; then
  REMOTE="gitlab-com"
fi
git pull $REMOTE develop
if [ $? -ne 0 ]; then
  echo "git pull failed"
  exit 1
fi

nvm install
nvm use
if [ $? -ne 0 ]; then
  echo "nvm use failed"
  exit 1
fi

node package-version-update.js
if [ $? -ne 0 ]; then
  echo "node package-version-update.js failed"
  exit 1
fi


NEW_VER="$(node -p "require('../package.json').version")"

# Add [skip ci] to the commit message to prevent pipeline creation
git commit -am "🆙: update version to ${NEW_VER} [skip ci]" || {
  echo "No changes to commit"; exit 0;
}

# Also pass the GitLab push option to skip CI
git push -o ci.skip $REMOTE HEAD:develop
if [ $? -ne 0 ]; then
  echo "git push failed"
  exit 1
fi
