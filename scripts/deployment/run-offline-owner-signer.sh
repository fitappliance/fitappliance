#!/bin/sh
set -eu

ulimit -c 0

if [ ! -x /usr/bin/sandbox-exec ]; then
  echo 'OFFLINE_BOUNDARY_UNAVAILABLE: sandbox-exec is required' >&2
  exit 1
fi

request_path=''
anchor_path=''
contract_path=''
metadata_path=''
public_key_path=''
private_key_path=''
write_path=''
for argument in "$@"; do
  case "$argument" in
    --request=*) request_path=${argument#*=} ;;
    --trust-anchor=*) anchor_path=${argument#*=} ;;
    --signer-contract=*) contract_path=${argument#*=} ;;
    --owner-metadata=*) metadata_path=${argument#*=} ;;
    --owner-public-key=*) public_key_path=${argument#*=} ;;
    --owner-private-key=*) private_key_path=${argument#*=} ;;
    --output=*) write_path=${argument#*=} ;;
  esac
done

for required_path in "$request_path" "$anchor_path" "$contract_path" "$metadata_path" "$public_key_path" "$private_key_path" "$write_path"; do
  [ -n "$required_path" ] || {
    echo 'OFFLINE_BOUNDARY_INVALID: exact read and write paths are required' >&2
    exit 1
  }
done
[ ! -e "$write_path" ] || {
  echo 'OFFLINE_BOUNDARY_INVALID: output already exists' >&2
  exit 1
}
[ -d "$(dirname -- "$write_path")" ] || {
  echo 'OFFLINE_BOUNDARY_INVALID: exact read and write paths are required' >&2
  exit 1
}

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
node_bin=$(command -v node)
profile='(version 1)(allow default)(deny network*)'
unset NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS OPENSSL_CONF SSL_CERT_FILE SSL_CERT_DIR
unset DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH NODE_DEBUG NODE_DEBUG_NATIVE NODE_V8_COVERAGE
export HOME='' LANG=C LC_ALL=C TZ=UTC

child_status=0
"$node_bin" --permission -e \
  'import("node:child_process").then(({spawnSync}) => { try { spawnSync("/usr/bin/true"); process.exit(0); } catch (error) { process.exit(error?.code === "ERR_ACCESS_DENIED" ? 23 : 24); } })' \
  >/dev/null 2>&1 || child_status=$?
[ "$child_status" -eq 23 ] || {
  echo 'OFFLINE_BOUNDARY_UNAVAILABLE: Node child-process denial preflight failed' >&2
  exit 1
}

exec /usr/bin/sandbox-exec -p "$profile" "$node_bin" \
  --permission \
  --disable-sigusr1 \
  "--allow-fs-read=${repo_root}/src/domain/owner-attestation-request-contract.mjs" \
  "--allow-fs-read=${repo_root}/src/domain/offline-owner-signer-contract.mjs" \
  "--allow-fs-read=${repo_root}/scripts/deployment/offline-owner-secure-io.mjs" \
  "--allow-fs-read=${repo_root}/scripts/deployment/sign-owner-attestation.mjs" \
  "--allow-fs-read=${request_path}" \
  "--allow-fs-read=${anchor_path}" \
  "--allow-fs-read=${contract_path}" \
  "--allow-fs-read=${metadata_path}" \
  "--allow-fs-read=${public_key_path}" \
  "--allow-fs-read=${private_key_path}" \
  "--allow-fs-write=$(dirname -- "$write_path")" \
  "$repo_root/scripts/deployment/sign-owner-attestation.mjs" "$@"
