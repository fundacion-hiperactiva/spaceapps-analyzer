#!/bin/sh
set -eu

environment="${1:-}"
override="${VERSION_OVERRIDE:-0}"
# POSIX TZ signs are inverted: UTC+3 means UTC-03:00.
timezone="${VERSION_TIMEZONE:-UTC+3}"
today_version="$(TZ="$timezone" date '+%Y.%j.0')"

case "$environment" in
  e1)
    default_version="${today_version}-dev"
    override_version="${E1_VERSION:-}"
    ;;
  e2)
    default_version="${today_version}-testing"
    override_version="${E2_VERSION:-}"
    ;;
  e3)
    default_version="$today_version"
    override_version="${E3_VERSION:-}"
    ;;
  *)
    echo "ERROR: Usage: $0 <e1|e2|e3>" >&2
    exit 1
    ;;
esac

case "$override" in
  0|"")
    printf '%s\n' "$default_version"
    ;;
  1)
    if [ -z "$override_version" ]; then
      variable_name="$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')_VERSION"
      echo "ERROR: VERSION_OVERRIDE=1 requires $variable_name." >&2
      exit 1
    fi
    printf '%s\n' "$override_version"
    ;;
  *)
    echo "ERROR: VERSION_OVERRIDE must be 0 or 1." >&2
    exit 1
    ;;
esac
