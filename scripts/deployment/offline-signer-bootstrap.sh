#!/bin/sh

verify_authorized_sha256() {
  expected_sha256=$1
  target_path=$2
  label=$3
  case "$expected_sha256" in
    *[!0-9a-f]*|'')
      echo "OFFLINE_BOOTSTRAP_INVALID: ${label} SHA-256 is invalid" >&2
      exit 1
      ;;
  esac
  [ "${#expected_sha256}" -eq 64 ] || {
    echo "OFFLINE_BOOTSTRAP_INVALID: ${label} SHA-256 is invalid" >&2
    exit 1
  }
  actual_sha256=$(/usr/bin/shasum -a 256 -- "$target_path")
  actual_sha256=${actual_sha256%% *}
  [ "$actual_sha256" = "$expected_sha256" ] || {
    echo "OFFLINE_BOOTSTRAP_HASH_DRIFT: ${label} bytes differ" >&2
    exit 1
  }
}

verify_absent_output() {
  output_path=$1
  [ -n "$output_path" ] && [ ! -e "$output_path" ] && [ -d "$(dirname -- "$output_path")" ] || {
    echo 'OFFLINE_BOOTSTRAP_INVALID: authorized output must be absent in an existing directory' >&2
    exit 1
  }
}
