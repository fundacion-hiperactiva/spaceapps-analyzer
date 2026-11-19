#!/bin/sh
set -eu

run_with_sudo() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

ensure_os_release() {
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
  else
    ID="unknown"
    ID_LIKE=""
  fi
}

install_node_tools() {
  if command -v pnpm >/dev/null 2>&1 || command -v npm >/dev/null 2>&1; then
    return 0
  fi

  ensure_os_release

  case "${ID:-}" in
    alpine)
      run_with_sudo apk add --no-cache nodejs npm
      ;;
    debian|ubuntu)
      run_with_sudo apt-get update
      run_with_sudo apt-get install -y nodejs npm
      ;;
    fedora)
      run_with_sudo dnf install -y nodejs npm
      ;;
    *)
      if printf '%s' "${ID_LIKE:-}" | grep -Eq 'debian|ubuntu'; then
        run_with_sudo apt-get update
        run_with_sudo apt-get install -y nodejs npm
      elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'fedora|rhel|centos'; then
        run_with_sudo dnf install -y nodejs npm
      elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'alpine'; then
        run_with_sudo apk add --no-cache nodejs npm
      else
        echo "WARNING: Unable to install Node.js toolchain automatically (unsupported distro: ${ID:-unknown})." >&2
      fi
      ;;
  esac
}

run_node_install() {
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@10.33.2 --activate || true
  fi

  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --no-frozen-lockfile || pnpm install --no-lockfile
  elif command -v npm >/dev/null 2>&1; then
    npm install --no-package-lock || npm install --omit=dev || npm install
  else
    echo "WARNING: No Node.js package manager available for dependency installation." >&2
  fi
}

install_python_tools() {
  if command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  ensure_os_release

  if ! command -v python3 >/dev/null 2>&1; then
    case "${ID:-}" in
      alpine)
        run_with_sudo apk add --no-cache python3 py3-pip
        ;;
      debian|ubuntu)
        run_with_sudo apt-get update
        run_with_sudo apt-get install -y python3 python3-pip
        ;;
      fedora)
        run_with_sudo dnf install -y python3 python3-pip
        ;;
      *)
        if printf '%s' "${ID_LIKE:-}" | grep -Eq 'debian|ubuntu'; then
          run_with_sudo apt-get update
          run_with_sudo apt-get install -y python3 python3-pip
        elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'fedora|rhel|centos'; then
          run_with_sudo dnf install -y python3 python3-pip
        elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'alpine'; then
          run_with_sudo apk add --no-cache python3 py3-pip
        else
          echo "WARNING: Unable to install Python tooling automatically (unsupported distro: ${ID:-unknown})." >&2
        fi
        ;;
    esac
  elif ! python3 -m pip --version >/dev/null 2>&1; then
    case "${ID:-}" in
      alpine)
        run_with_sudo apk add --no-cache py3-pip
        ;;
      debian|ubuntu)
        run_with_sudo apt-get update
        run_with_sudo apt-get install -y python3-pip
        ;;
      fedora)
        run_with_sudo dnf install -y python3-pip
        ;;
      *)
        if printf '%s' "${ID_LIKE:-}" | grep -Eq 'debian|ubuntu'; then
          run_with_sudo apt-get update
          run_with_sudo apt-get install -y python3-pip
        elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'fedora|rhel|centos'; then
          run_with_sudo dnf install -y python3-pip
        elif printf '%s' "${ID_LIKE:-}" | grep -Eq 'alpine'; then
          run_with_sudo apk add --no-cache py3-pip
        else
          echo "WARNING: Unable to install pip automatically (unsupported distro: ${ID:-unknown})." >&2
        fi
        ;;
    esac
  fi
}

if [ -f package.json ]; then
  install_node_tools
  run_node_install
fi

if [ -f requirements.txt ]; then
  install_python_tools
fi

if [ -f requirements.txt ] && command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
  python3 -m pip install --upgrade pip setuptools wheel
  PIP_ROOT_USER_ACTION=ignore python3 -m pip install -r requirements.txt
fi

: "${SNYK_TOKEN:?SNYK_TOKEN is required}"
snyk auth "${SNYK_TOKEN}"
# Run Snyk and generate the JSON report, allowing failure to proceed to the next step
snyk test --all-projects --severity-threshold=medium --json > snyk-report.json || true
snyk test --all-projects --severity-threshold=medium || true
e1_version="$(sh .gitlab-ci/resolve-version.sh e1)"
snyk container test "${CI_REGISTRY_IMAGE}:${e1_version}-${CI_COMMIT_SHORT_SHA}" --severity-threshold=medium || true
