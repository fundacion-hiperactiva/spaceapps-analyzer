#!/usr/bin/env bash
set -euo pipefail

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  distro="${ID:-unknown}"
else
  echo "Unable to detect Linux distribution." >&2
  exit 1
fi

echo "Detected distro: ${distro}"

run_with_sudo() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

install_tools_apt() {
  run_with_sudo apt-get update
  run_with_sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git openssh-client curl jq
}

install_tools_dnf() {
  run_with_sudo dnf install -y git openssh-clients curl jq
}

install_tools_apk() {
  run_with_sudo apk add --no-cache git openssh curl jq
}

case "$distro" in
  ubuntu|debian)
    install_tools_apt
    ;;
  fedora)
    install_tools_dnf
    ;;
  alpine)
    install_tools_apk
    ;;
  *)
    if echo "${ID_LIKE:-}" | grep -Eq 'debian|ubuntu'; then
      install_tools_apt
    elif echo "${ID_LIKE:-}" | grep -Eq 'fedora|rhel|centos'; then
      install_tools_dnf
    elif echo "${ID_LIKE:-}" | grep -Eq 'alpine'; then
      install_tools_apk
    else
      echo "Unsupported distro: ${distro} (ID_LIKE=${ID_LIKE:-unknown})." >&2
      exit 1
    fi
    ;;
esac
