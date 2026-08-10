#!/bin/sh
set -eu

ulimit -c 0

[ -x /usr/bin/sandbox-exec ] || {
  echo 'OFFLINE_BOUNDARY_UNAVAILABLE: sandbox-exec is required' >&2
  exit 1
}

request_path=''
candidate_path=''
owner_receipt_path=''
owner_trust_root_path=''
trust_anchor_path=''
authority_set_path=''
metadata_path=''
public_key_path=''
private_key_path=''
contract_path=''
withdrawal_path=''
write_path=''
expected_request_id=''
expected_artifact_id=''
confirmation=''
authorized_bootstrap_sha256=''
authorized_wrapper_sha256=''
authorized_contract_sha256=''
authorized_node_sha256=''
authorized_request_sha256=''
authorized_signer_contract_id=''
for argument in "$@"; do
  case "$argument" in
    --request=*) request_path=${argument#*=} ;;
    --candidate=*) candidate_path=${argument#*=} ;;
    --owner-receipt=*) owner_receipt_path=${argument#*=} ;;
    --owner-trust-root=*) owner_trust_root_path=${argument#*=} ;;
    --trust-anchor=*) trust_anchor_path=${argument#*=} ;;
    --authority-set=*) authority_set_path=${argument#*=} ;;
    --reviewer-metadata=*) metadata_path=${argument#*=} ;;
    --reviewer-public-key=*) public_key_path=${argument#*=} ;;
    --reviewer-private-key=*) private_key_path=${argument#*=} ;;
    --signer-contract=*) contract_path=${argument#*=} ;;
    --current-withdrawal-log=*) withdrawal_path=${argument#*=} ;;
    --output=*) write_path=${argument#*=} ;;
    --expected-request-id=*) expected_request_id=${argument#*=} ;;
    --expected-artifact-id=*) expected_artifact_id=${argument#*=} ;;
    --confirm=*) confirmation=${argument#*=} ;;
    --authorized-bootstrap-sha256=*) authorized_bootstrap_sha256=${argument#*=} ;;
    --authorized-wrapper-sha256=*) authorized_wrapper_sha256=${argument#*=} ;;
    --authorized-contract-sha256=*) authorized_contract_sha256=${argument#*=} ;;
    --authorized-node-sha256=*) authorized_node_sha256=${argument#*=} ;;
    --authorized-request-sha256=*) authorized_request_sha256=${argument#*=} ;;
    --authorized-signer-contract-id=*) authorized_signer_contract_id=${argument#*=} ;;
  esac
done

for required_path in "$request_path" "$candidate_path" "$owner_receipt_path" "$owner_trust_root_path" \
  "$trust_anchor_path" "$authority_set_path" "$metadata_path" "$public_key_path" "$private_key_path" \
  "$contract_path" "$withdrawal_path" "$write_path"; do
  [ -n "$required_path" ] || {
    echo 'OFFLINE_BOUNDARY_INVALID: exact reviewer read and write inputs are required' >&2
    exit 1
  }
done

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
bootstrap_path="${repo_root}/scripts/deployment/offline-signer-bootstrap.sh"
bootstrap_actual=$(/usr/bin/shasum -a 256 -- "$bootstrap_path")
bootstrap_actual=${bootstrap_actual%% *}
[ "$bootstrap_actual" = "$authorized_bootstrap_sha256" ] || {
  echo 'OFFLINE_BOOTSTRAP_HASH_DRIFT: bootstrap bytes differ' >&2
  exit 1
}
. "$bootstrap_path"
node_command=$(command -v node)
node_bin=$(CDPATH= cd -- "$(dirname -- "$node_command")" && printf '%s/%s' "$(pwd -P)" "$(basename -- "$node_command")")
verify_authorized_sha256 "$authorized_wrapper_sha256" "$0" 'wrapper'
verify_authorized_sha256 "$authorized_contract_sha256" "$contract_path" 'contract'
verify_authorized_sha256 "$authorized_node_sha256" "$node_bin" 'Node executable'
verify_authorized_sha256 "$authorized_request_sha256" "$request_path" 'request'
verify_absent_output "$write_path"
request_bound_id=$(/usr/bin/plutil -extract requestId raw -o - "$request_path")
request_bound_artifact_id=$(/usr/bin/plutil -extract artifactId raw -o - "$request_path")
contract_bound_id=$(/usr/bin/plutil -extract contractId raw -o - "$contract_path")
case "$expected_request_id$expected_artifact_id$authorized_signer_contract_id" in *[!0-9a-f]*|'')
  echo 'OFFLINE_BOOTSTRAP_INVALID: request, artifact and signer-contract IDs must be exact SHA-256 values' >&2
  exit 1
esac
[ "${#expected_request_id}" -eq 64 ] && [ "${#expected_artifact_id}" -eq 64 ] \
  && [ "${#authorized_signer_contract_id}" -eq 64 ] \
  && [ "$request_bound_id" = "$expected_request_id" ] \
  && [ "$request_bound_artifact_id" = "$expected_artifact_id" ] \
  && [ "$contract_bound_id" = "$authorized_signer_contract_id" ] \
  && [ "$confirmation" = 'SIGN_EXACT_STATIC_RIGHTS_REVIEWER_ARTIFACT' ] || {
  echo 'OFFLINE_BOOTSTRAP_INVALID: exact reviewer action-time authorization is required' >&2
  exit 1
}

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

withdrawal_permission=''
[ "$withdrawal_path" = 'NONE' ] || withdrawal_permission="--allow-fs-read=${withdrawal_path}"

exec /usr/bin/sandbox-exec -p "$profile" "$node_bin" \
  --permission \
  --disable-sigusr1 \
  "--allow-fs-read=${repo_root}/src/domain/reviewer-artifact-request-contract.mjs" \
  "--allow-fs-read=${repo_root}/src/domain/owner-attestation-request-contract.mjs" \
  "--allow-fs-read=${repo_root}/src/domain/offline-reviewer-signer-contract.mjs" \
  "--allow-fs-read=${repo_root}/src/domain/static-publication-rights.mjs" \
  "--allow-fs-read=${repo_root}/scripts/deployment/offline-owner-secure-io.mjs" \
  "--allow-fs-read=${repo_root}/scripts/deployment/sign-static-rights-reviewer-artifact.mjs" \
  "--allow-fs-read=${repo_root}/scripts/deployment/offline-signer-bootstrap.sh" \
  "--allow-fs-read=${repo_root}/scripts/deployment/run-offline-reviewer-signer.sh" \
  "--allow-fs-read=${request_path}" \
  "--allow-fs-read=${candidate_path}" \
  "--allow-fs-read=${owner_receipt_path}" \
  "--allow-fs-read=${owner_trust_root_path}" \
  "--allow-fs-read=${trust_anchor_path}" \
  "--allow-fs-read=${authority_set_path}" \
  "--allow-fs-read=${metadata_path}" \
  "--allow-fs-read=${public_key_path}" \
  "--allow-fs-read=${contract_path}" \
  ${withdrawal_permission} \
  "--allow-fs-read=${private_key_path}" \
  "--allow-fs-write=$(dirname -- "$write_path")" \
  "$repo_root/scripts/deployment/sign-static-rights-reviewer-artifact.mjs" "$@"
