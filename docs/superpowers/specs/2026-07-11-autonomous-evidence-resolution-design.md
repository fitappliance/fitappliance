# Autonomous Evidence Resolution Design

## Goal

Turn the existing deterministic evidence decision helper into a fail-closed,
machine-operated resolution system. No product may be released because a person
typed `authority: manufacturer`, copied a value beside a quote, or set a boolean
release flag. Human input may start or stop the runner, but it cannot approve a
field or override a terminal decision.

## Approaches Considered

1. Extend the current JSON state machine. This is small, but it preserves the
   untrusted-input and manual-acquisition weaknesses found by the audit.
2. Let an LLM research and judge each case. This broadens discovery, but makes
   publication non-deterministic and difficult to reproduce.
3. Use a deterministic adjudication core with an automated acquisition layer.
   This is the selected approach. Search may be heuristic, but every release is
   reproduced from raw source bytes by fixed identity, field, unit, range,
   conflict, freshness, and quarantine policies.

## Trust Boundaries

Treat case JSON, candidate URLs, redirects, HTML, PDFs, extracted text, legacy
catalog fields, and generated manifests as untrusted. A source becomes usable
only after all of these checks pass:

- the requested and final HTTPS hosts are approved for the case brand;
- the raw bytes hash matches their content-addressed object path;
- retrieval time is valid RFC 3339, not in the future, and within policy;
- an exact model identity is proven by source structure, not self-declaration;
- each value is parsed from its quoted evidence with the expected field label
  and unit;
- category ranges and cross-field geometry invariants pass;
- a verification receipt binds policy version, source metadata, source hash,
  identity proof, and parsed claims;
- the release grant can remove only the exact evidence-hold reason named by the
  case. Permanent identity and product-kind quarantines are never releasable.

## Components

### Policy

`manufacturer-source-policy.json` maps canonical brands to approved host
suffixes and market. `resolution-policy.json` defines releasable quarantine
reasons, freshness, retry bounds, supported fields, and category ranges.
Unknown brands, hosts, source types, and fields fail closed.

### Artifact Verifier

The verifier reads immutable HTML or PDF bytes. HTML identity needs an exact
canonical product URL plus a second independent product signal such as title,
product metadata, or a product element attribute. PDF claims must name the exact
model in the same page or declared model section. Model matching uses bounded,
normalised tokens so `ABC1` does not match `ABC12`.

The verifier parses values from the evidence fragment. A stored claim cannot
say `value: 1` while quoting `913 mm`. It emits a content-bound receipt; builds
recompute the receipt digest and reject edited metadata or claims.

### Research Runner

The runner is idempotent and restartable. It discovers candidates from existing
official evidence, brand sitemap URLs, and optional search-provider results. It
captures redirect hops, downloads with bounded retries, stores raw bytes by
SHA-256, verifies identity, extracts supported facts, and records attempt
history. Network or parser failures advance the attempt rather than becoming a
decision. At the retry limit the case automatically terminates in quarantine.

### Adjudicator

Only receipt-verified active sources enter adjudication. Required dimensions and
every original conflicting field must be resolved before the status may be
`resolved`. A stale source returns the case to research. Conflicting current
manufacturer evidence triggers automated reconciliation; unresolved conflict at
the retry limit becomes quarantine. Superseded snapshots do not vote.

### Publication Gate

Every non-resolved case is automatically added to the canonical quarantine,
even if it was not previously listed. Release grants are typed objects naming
the case and exact releasable reason. The public projection reconstructs only
approved fields and strips all other fit, operation, service, and flag fields.
The normal production build validates receipt digests and case/quarantine
coverage; raw-object verification is required when generating or refreshing a
receipt.

## State Model

Cases move through `research_required`, `evidence_collected`,
`reconciliation_required`, `resolved`, or `quarantined`. `resolved` and
`quarantined` are terminal for a policy version. A new source snapshot or policy
version opens a new case version rather than mutating history. Every transition
records time, attempt, reason, source hashes, and policy version.

## Failure Policy

- Unknown or spoofed host: reject source and continue bounded research.
- Redirect outside approved brand hosts: reject source.
- Missing raw object or bad hash: no receipt and no release.
- Claim/quote mismatch, ambiguous axis, or implausible geometry: reject claim.
- Multi-model source without local model scope: reject source.
- Freshness expiry: reopen research and quarantine publication meanwhile.
- Conflicting active official sources: reconcile, then quarantine if exhausted.
- Search outage or rate limit: retry with backoff; never reuse unapproved legacy
  fields.
- Unsupported quarantine reason: never release it through evidence resolution.

## Verification

Tests must include forged manufacturer labels, hostile redirects, invalid dates,
claim-value mismatch, model substring collisions, multi-model pages, stale and
superseded evidence, conflicting sources, impossible dimensions, malformed
receipts, missing objects, interrupted retries, duplicate cases, non-evidence
quarantine bypass attempts, unresolved products still online, and deterministic
replay. Full project tests, lint, build, schema, geometry, aliases, link graph,
desktop/mobile browser checks, and production checks remain final gates.

