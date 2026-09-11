# Fit V4 Shared Quality and Minimal Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Fit V4 收敛为一套可复用、可验证的 Node/Browser 计算契约，在不扩大 UI 和数据迁移范围的情况下接入 cavity 搜索。

**Architecture:** 复用现有 "src/shared/fit-engine.js" 作为唯一运行时 Fit 计算源，同时服务 domain 和 browser；"src/domain/fit-v4.mjs" 只做薄封装，"SearchCore" 只负责模式路由和输入准备。Fit V4 将“尺寸筛选”和“安装适配结论”分开，replacement 模式永远不调用 Fit V4。

**Tech Stack:** Node.js 22、CommonJS/UMD browser-safe shared module、ES modules domain wrapper、静态 JavaScript、Node built-in test runner。

**Spec:** "docs/product-core-brief.md"、"docs/superpowers/plans/2026-09-11-fit-v4-evidence-boundary-execution.md"

## Global Constraints

- 未知值必须保持 "null"/"UNKNOWN"，不得转换为 "0"、"false" 或默认 clearance。
- 只有完整 receipt-bound、exact-model、适用字段齐全的证据，才允许 "VERIFIED_FIT"。
- 证据不足统一为 "INSUFFICIENT_DATA"；已知机体尺寸超过 cavity 时仍可为 "NO_FIT"。
- cavity search 和 old-appliance replacement 必须保持两个独立决策合同。
- replacement 结果只能表达尺寸差异，不得调用 "FitDecision" 或 Fit V4。
- 不迁移关系型数据库，不批量重写 3521 个产品，不把 retailer dimensions 提升为 manufacturer verified。
- 不修改 UI 文案或视觉显示，直到 domain/browser 结果一致性和发布审计通过。
- 不暴露私有证据文件、原始 PDF 或未授权字段；公开投影只保留允许发布的结构化事实。
- 保留工作区中已有的非本任务未提交改动；只提交本计划涉及的文件。

## Quality Target

本计划完成后必须满足：

1. Fit V4 的规范化、证据门和 outcome precedence 只有一份实现。
2. Node/domain 与 browser 使用同一份 shared 源文件，vendor 副本字节一致。
3. "SearchCore" 不自行判断 "VERIFIED_FIT"，只调用 shared evidence gate。
4. 所有 cavity 影子结果可同时查看 "sizeMatch" 和 "fitDecisionV4"，但 UI 暂不显示新结论。
5. replacement 流程在测试中证明没有调用 Fit V4。
6. 发布审计保持 "violations=0"，并且不得凭本计划新增任何公开 "VERIFIED_FIT" 产品。

## File Map

- Modify: "src/shared/fit-engine.js" — 唯一的 browser-safe Fit V4 计算与证据门。
- Modify: "public/scripts/fit-engine.js" — 由 vendor 脚本生成的 shared 精确副本，不手工维护第二套逻辑。
- Modify: "src/domain/fit-v4.mjs" — 只导出 shared Fit V4 API，删除重复的产品/尺寸/证据规范化。
- Modify: "public/scripts/search-core.js" — 只在 cavity 模式准备输入并附加 "fitDecisionV4"，保持既有字段兼容。
- Modify: "scripts/vendor-fit-engine.js" — 继续保证 shared 源文件复制到 browser runtime。
- Modify: "tests/architecture-v2/fit-v4.test.mjs" — Fit V4 contract matrix 和 fail-closed 行为。
- Modify: "tests/architecture-v2/fit-engine-vendor.test.mjs" — shared/vendor 字节一致性。
- Modify: "tests/architecture-v2/browser-fit-contract.test.mjs" — domain/browser parity、cavity/replacement 隔离。
- Create: "tests/architecture-v2/fit-v4-search-shadow.test.mjs" — SearchCore 影子接入的最小回归测试。

---

### Task 1: Freeze the Fit V4 contract with failing tests

**Files:**
- Modify: "tests/architecture-v2/fit-v4.test.mjs"
- Modify: "tests/architecture-v2/browser-fit-contract.test.mjs"
- Create: "tests/architecture-v2/fit-v4-search-shadow.test.mjs"

**Interfaces:**
- "evaluateFitV4({ geometry, cavity, evidence, advisoryChecks })" returns a deeply frozen object with "schemaVersion", "outcome", "evidenceLevel", "sizeMatch", "checks", "required", and "spare".
- "sizeMatch.statuses" uses exactly "width", "height", and "depth", each with "PASS", "FAIL", or "UNKNOWN".
- "evidence" is provenance input; a legacy "trust_level" string is never sufficient.

- [x] **Step 1: Add the contract matrix before implementation**

Add tests for these exact cases:

~~~js
assert.equal(evaluateFitV4({ geometry, cavity, evidence: null }).outcome, 'INSUFFICIENT_DATA');
assert.equal(evaluateFitV4({ geometry: widerGeometry, cavity, evidence: null }).outcome, 'NO_FIT');
assert.equal(evaluateFitV4({ geometry, cavity, evidence: legacyVerifiedLabel }).outcome, 'INSUFFICIENT_DATA');
assert.equal(evaluateFitV4({ geometry, cavity, evidence: verifiedReceipt }).outcome, 'VERIFIED_FIT');
assert.deepEqual(result.sizeMatch.statuses, { width: 'PASS', height: 'PASS', depth: 'PASS' });
~~~

Also test null/invalid cavity values, inverted height ranges, missing installation fields, advisory "UNKNOWN", and non-applicable advisory checks.

- [x] **Step 2: Add mode-isolation tests**

~~~js
const cavityResult = SearchCore.computeFitMeta(product, { searchMode: 'cavity', w: 620, h: 1720, d: 680 });
const replacementResult = SearchCore.computeFitMeta(product, { searchMode: 'replacement', w: 620, h: 1720, d: 680 });
assert.ok(cavityResult.fitDecisionV4);
assert.equal(replacementResult.fitDecisionV4, null);
~~~

- [x] **Step 3: Run the new tests and confirm RED**

Run:

~~~bash
node --test tests/architecture-v2/fit-v4.test.mjs tests/architecture-v2/fit-v4-search-shadow.test.mjs
~~~

Expected: failure because the shared API and SearchCore shadow field do not yet exist.

### Task 2: Move Fit V4 into the single shared engine

**Files:**
- Modify: "src/shared/fit-engine.js"
- Modify: "src/domain/fit-v4.mjs"
- Test: "tests/architecture-v2/fit-v4.test.mjs"

**Interfaces:**
- "src/shared/fit-engine.js" exports "evaluateFit", "evaluateFitV4", and "resolveEvidenceLevel" through the existing UMD/CommonJS "FitEngine" object.
- "evaluateFitV4" accepts canonical geometry and never accepts raw UI filters or replacement dimensions.

- [x] **Step 1: Implement one evidence gate**

Centralize receipt validation in "resolveEvidenceLevel(geometry, evidence)":

~~~js
function resolveEvidenceLevel(geometry, evidence) {
  if (!hasReceiptBoundFields(geometry, evidence)) return 'none';
  return evidence?.evidenceLevel === 'verified' && allApplicableFieldsBound(geometry, evidence)
    ? 'verified'
    : 'dimensions';
}
~~~

The implementation must validate SHA-256 shape, HTTPS source URL, exact geometry field coverage, and category/form-factor applicable fields. A legacy "trust_level", "clearance_verified", or "verifiedFitEligible" value alone must never produce "verified".

- [x] **Step 2: Implement size matching without installation assumptions**

Calculate "sizeMatch" from "geometry.closedEnvelope" and cavity only. Do not add side, top, rear, service, operation, or practical defaults to this result.

- [x] **Step 3: Implement outcome precedence**

Use this order:

~~~text
known closed-envelope axis failure       -> NO_FIT
applicable installation/advisory failure -> NO_FIT
unknown axis or advisory                 -> INSUFFICIENT_DATA
complete receipt-bound verified evidence -> VERIFIED_FIT
all other outcomes                       -> INSUFFICIENT_DATA
~~~

- [x] **Step 4: Make malformed ranges fail closed**

An inverted or incomplete height range must become "UNKNOWN" or raise a contract error before evaluation. It must not silently replace the range with a convenient endpoint.

- [x] **Step 5: Replace the domain implementation with a thin wrapper**

"src/domain/fit-v4.mjs" should only load the shared module and export its functions. It must not contain another "positiveOrNull", "normalizeHeight", "productGeometry", "evidenceLevel", or "sizeMatch" implementation.

- [x] **Step 6: Run the contract tests and confirm GREEN**

Run:

~~~bash
node --test tests/architecture-v2/fit-v4.test.mjs
~~~

Expected: all Fit V4 contract tests pass, including the negative evidence and malformed-input cases.

### Task 3: Keep browser and domain implementations identical

**Files:**
- Modify: "scripts/vendor-fit-engine.js"
- Modify: "public/scripts/fit-engine.js"
- Modify: "tests/architecture-v2/fit-engine-vendor.test.mjs"

**Interfaces:**
- The vendor script copies "src/shared/fit-engine.js" to "public/scripts/fit-engine.js".
- Browser consumers access "globalThis.FitEngine.evaluateFitV4".

- [x] **Step 1: Extend the vendor test for the new API**

~~~js
assert.equal(typeof require('../../src/shared/fit-engine.js').evaluateFitV4, 'function');
assert.equal(typeof require('../../public/scripts/fit-engine.js').evaluateFitV4, 'function');
~~~

- [x] **Step 2: Regenerate the browser copy**

Run:

~~~bash
node scripts/vendor-fit-engine.js
~~~

- [x] **Step 3: Verify byte identity**

Run:

~~~bash
node --test tests/architecture-v2/fit-engine-vendor.test.mjs
~~~

Expected: the canonical and public shared files are byte-identical.

### Task 4: Add SearchCore shadow integration without changing UI

**Files:**
- Modify: "public/scripts/search-core.js"
- Test: "tests/architecture-v2/fit-v4-search-shadow.test.mjs"
- Test: "tests/architecture-v2/browser-fit-contract.test.mjs"

**Interfaces:**
- "computeFitMeta" keeps all existing return fields unchanged.
- In "searchMode === 'cavity'", it adds "fitDecisionV4".
- In "searchMode === 'replacement'", it returns "fitDecisionV4: null" and keeps replacement dimensions isolated.

- [x] **Step 1: Build the V4 input from existing canonical helpers**

Use the existing product envelope and manufacturer-scoped geometry preparation. Do not duplicate "productClosedEnvelope", receipt field checks, or clearance parsing inside the new branch.

- [x] **Step 2: Call Fit V4 exactly once per cavity product evaluation**

~~~js
const fitDecisionV4 = searchMode === 'cavity'
  ? fitEngine.evaluateFitV4({
    geometry: manufacturerGeometry,
    cavity,
    evidence: product?.geometry_v2_provenance,
    advisoryChecks: operationAdvisoryChecks(manufacturerGeometry, cavity)
  })
  : null;
~~~

Use the actual shared evidence-gate result and ensure practical/default clearance cannot become verified evidence.

- [x] **Step 3: Preserve legacy output during shadow mode**

Do not replace "fitDecision", "fitScore", "requiredCavityMm", or current UI fields in this task. Add only "fitDecisionV4" so parity and behavior can be measured without a UI release.

- [x] **Step 4: Test cavity/replacement isolation and conflicting dimensions**

Verify that geometry takes the canonical precedence already established by the browser contract, that legacy verified labels stay insufficient, and that replacement output contains size deltas only.

- [x] **Step 5: Run the browser contract suite**

Run:

~~~bash
node --test tests/architecture-v2/browser-fit-contract.test.mjs tests/architecture-v2/fit-v4-search-shadow.test.mjs
~~~

### Task 5: Add release and regression gates

**Files:**
- Modify: "tests/architecture-v2/fit-publication-audit.test.mjs" only if a new V4 field requires a contract assertion.
- Modify: "tests/architecture-v2/browser-fit-contract.test.mjs" for any discovered parity case.
- Do not modify generated public catalog data in this task.

- [x] **Step 1: Verify publication safety**

Run:

~~~bash
npm run audit:fit-publication
~~~

Expected:

~~~json
{"receiptBoundVerified":0,"violations":0}
~~~

The exact "receiptBoundDimensions" count may change only from a separately approved evidence change; this integration must not change it.

- [x] **Step 2: Verify all relevant tests**

Run:

~~~bash
npm run lint
npm run test:architecture-v2
~~~

- [x] **Step 3: Run the full suite and record unrelated failures**

Run:

~~~bash
npm test
~~~

The known "tests/cf-gsc-readiness.test.mjs" "Invalid string length" failure must be reported separately if it remains; it must not be silently attributed to Fit V4.

- [x] **Step 4: Review the staged file list**

Run:

~~~bash
git status --short
git diff --cached --check
git diff --cached --name-only
~~~

Only Fit V4 shared code, its browser copy, SearchCore shadow integration, related tests, and this plan may be staged.

## Deferred UI Plan

After the shadow contract is green, the next UI plan may add the PCPartPicker-inspired interaction in three isolated slices:

1. W/H/D range filters and Compatibility Filter using "sizeMatch" only for dimensional filtering.
2. Evidence-aware result labels using "fitDecisionV4.outcome", with "INSUFFICIENT_DATA" visibly distinct from a pass.
3. Compare tray, shareable URL, and local history without changing cavity/replacement semantics.

No UI slice may introduce a new Fit calculation, trust legacy labels, or render "VERIFIED_FIT" without the shared evidence gate.

## Explicitly Out of Scope

- Relation database migration or ORM introduction.
- Full catalog rewrite or bulk evidence promotion.
- Replacing the current Fit engine in one release without shadow parity.
- Adding practical clearance defaults to manufacturer evidence.
- Public display of raw source documents or private evidence storage paths.
- Creating a Pull Request or publishing a deployment as part of this plan.

## Execution Record — 2026-09-11

- Fit V4 now has one shared Node/Browser implementation in `src/shared/fit-engine.js`; `src/domain/fit-v4.mjs` is a thin wrapper and `public/scripts/fit-engine.js` is a generated byte-identical copy.
- SearchCore adds `fitDecisionV4` only for `searchMode: cavity`; replacement returns `fitDecisionV4: null` and keeps its existing dimension result path.
- Evidence gate requires exact-model identity, complete receipt-bound applicable fields, valid SHA-256 values, and a real HTTPS source URL. Legacy `trust_level`, `clearance_verified`, and `verifiedFitEligible` values alone cannot produce `VERIFIED_FIT`.
- Verification: targeted Fit V4/browser tests 25/25; `npm run lint` passed; Architecture V2 386/386 passed; publication audit returned `products: 3521`, `receiptBoundVerified: 0`, `receiptBoundDimensions: 21`, `violations: 0`.
- Full suite: 2003/2004 passed. The one remaining failure is the pre-existing `tests/cf-gsc-readiness.test.mjs` deployed-HTML join `RangeError: Invalid string length`; it is outside this plan and was not changed.
- No public catalog data was modified, no database migration was made, and no commit/PR/deployment was created.
