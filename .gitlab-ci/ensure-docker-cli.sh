#!/bin/sh
set -eu

# Install the Docker CLI if it is not already available in the environment.

if command -v docker >/dev/null 2>&1; then
  exit 0
fi

if [ ! -r /etc/os-release ]; then
  echo "Unable to detect Linux distribution; cannot install docker CLI." >&2
  exit 1
fi

. /etc/os-release
distro="${ID:-unknown}"
id_like="${ID_LIKE:-}"

run_with_sudo() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

install_with_apt() {
  run_with_sudo apt-get update
  run_with_sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
}

install_with_dnf() {
  run_with_sudo dnf install -y docker
}

install_with_apk() {
  run_with_sudo apk add --no-cache docker-cli
}

case "$distro" in
  ubuntu|debian)
    install_with_apt
    ;;
  fedora)
    install_with_dnf
    ;;
  alpine)
    install_with_apk
    ;;
  *)
    if echo "$id_like" | grep -Eq 'debian|ubuntu'; then
      install_with_apt
    elif echo "$id_like" | grep -Eq 'fedora|rhel|centos'; then
      install_with_dnf
    elif echo "$id_like" | grep -Eq alpine; then
      install_with_apk
    else
      echo "Unsupported distro for docker CLI installation: ${distro} (ID_LIKE=${id_like:-unknown})." >&2
      exit 1
    fi
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI installation failed despite running the installer." >&2
  exit 1
fi
