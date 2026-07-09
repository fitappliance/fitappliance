# Commission Factory Reapplication Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining signals that can make FitAppliance look underdeveloped during Commission Factory affiliate review.

**Architecture:** Keep the static HTML app and existing vanilla CSS/JS structure. Add regression tests first, then make small markup/CSS/page-copy changes that improve reviewer-visible completeness without changing fit-check behavior.

**Tech Stack:** Static HTML, vanilla CSS, ES modules, Node `node:test`, Playwright CLI screenshots for visual verification.

## Global Constraints

- Use TDD for behavior changes: write failing tests before production edits.
- Do not stage or modify unrelated local files `.claude/launch.json` and `AGENTS.md`.
- Do not claim affiliate approval or current network relationships beyond public/conditional wording.
- Keep `hello@fitappliance.com.au` and `ABN 46 168 974 169` as the visible business identity.
- Keep ad placeholders absent during affiliate review.

---

### Task 1: Hide the Empty Compare Tray on First Load

**Best skill:** `superpowers:test-driven-development`

**Files:**
- Modify: `index.html`
- Test: `tests/compare-tray.test.mjs`

**Risk addressed:** Reviewers can currently see a fixed `Comparing 0 items / Compare Now` bar before interacting with the site.

**Steps:**
- [ ] Add a failing test asserting the initial homepage compare bar is hidden and does not expose "Comparing 0 items".
- [ ] Run `node --test tests/compare-tray.test.mjs` and confirm the new test fails.
- [ ] Add `hidden`/safe initial state to the homepage compare bar markup.
- [ ] Run `node --test tests/compare-tray.test.mjs` and confirm it passes.

### Task 2: Repair the Subscribe Route

**Best skill:** `superpowers:test-driven-development`

**Files:**
- Modify: `pages/subscribe.html`
- Create or modify: `pages/subscribe/thanks.html`
- Modify: `tests/cf-submission-prep.test.mjs` or `tests/cf-gsc-readiness.test.mjs`

**Risk addressed:** `/subscribe` currently looks like a post-submit confirmation page before the user has subscribed.

**Steps:**
- [ ] Add a failing test asserting `/subscribe` contains an email form and does not start with "Check your inbox".
- [ ] Add a failing test asserting `/subscribe/thanks` contains the confirmation copy.
- [ ] Run the targeted test and confirm failure.
- [ ] Convert `/subscribe` into a real opt-in landing page using existing newsletter copy and privacy links.
- [ ] Add `/subscribe/thanks` for the confirmation state.
- [ ] Run the targeted test and confirm pass.

### Task 3: Unify Reviewer-Facing Business Identity

**Best skill:** `superpowers:test-driven-development`

**Files:**
- Modify: `pages/partners.html`
- Modify: `pages/contact.html`
- Modify: `pages/privacy.html`
- Modify: `pages/about/editorial-standards.html`
- Modify: `pages/affiliate-disclosure.html`
- Test: `tests/cf-submission-prep.test.mjs`

**Risk addressed:** ABN and domain contact email are visible on the homepage but inconsistent across reviewer/legal pages.

**Steps:**
- [ ] Add a failing test over key reviewer pages requiring both `hello@fitappliance.com.au` and `ABN 46 168 974 169`.
- [ ] Run the targeted test and confirm failure.
- [ ] Add a simple business identity block/footer to each reviewer/legal page.
- [ ] Run the targeted test and confirm pass.

### Task 4: Align Homepage Reviewer Claims and Navigation

**Best skill:** `redesign-existing-projects`

**Files:**
- Modify: `index.html`
- Modify: `tests/taste-redesign.test.mjs`

**Risk addressed:** Homepage says contact/legal details are visible from the primary navigation layer, but the top nav does not expose those links directly.

**Steps:**
- [ ] Add a failing test that rejects the inaccurate "primary navigation layer" wording.
- [ ] Run `node --test tests/taste-redesign.test.mjs` and confirm failure.
- [ ] Replace the claim with accurate reviewer-facing wording or add a compact reviewer link cluster.
- [ ] Run the targeted test and confirm pass.

### Task 5: Improve Quality Imagery Signal Without Rewriting the UI

**Best skill:** `redesign-existing-projects`

**Files:**
- Modify: `index.html`
- Modify: `public/styles-deferred.css`
- Modify: `tests/taste-redesign.test.mjs`

**Risk addressed:** The site still relies mostly on UI and generated guide-cover thumbnails; Commission Factory explicitly cited quality imagery.

**Steps:**
- [ ] Add a failing test requiring a reviewer-visible real/use-case imagery block on the homepage.
- [ ] Run `node --test tests/taste-redesign.test.mjs` and confirm failure.
- [ ] Add a non-intrusive evidence/measurement scene section using existing assets or deterministic local imagery treatment with descriptive alt text.
- [ ] Run the targeted test and confirm pass.

### Task 6: Verification and Reapplication Checklist

**Best skill:** `superpowers:verification-before-completion`

**Files:**
- Modify: `reports/cf-application-manifest.md` if checklist evidence changes.

**Steps:**
- [ ] Run targeted tests for the changed areas.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run validate-schema`.
- [ ] Capture desktop/mobile homepage and `/partners` screenshots with Playwright CLI.
- [ ] Verify live-risk checks locally: no initial empty compare bar, `/subscribe` is a form, reviewer pages show ABN/email, no ad placeholders.
