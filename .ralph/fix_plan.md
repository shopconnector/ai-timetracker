# TimeTracker — Code Review & Test Plan

## TEST INFRASTRUCTURE (do first!)

### T0. Set up Vitest
- [x] Install vitest
- [x] Create `apps/web/vitest.config.mts` with TypeScript + path aliases
- [x] Add `test` and `test:coverage` scripts to `apps/web/package.json` and root
- [x] Add `test` and `test:coverage` tasks to `turbo.json`
- [ ] Create `apps/web/src/test-utils/` with mock factories (mockJiraIssue, mockWorklog, mockAWEvent, mockSlackActivity)
- [x] Verify `pnpm test` runs successfully

### T1. Pure logic tests (no mocking needed)
- [x] `mergeActivities.test.ts` — activity merging, dedup, AW+Slack correlation, edge cases (20 tests)
- [ ] `readiness.test.ts` — RC parsing from Jira comments (green/yellow/red), missing fields
- [x] `cache.test.ts` — get/set/expiry/invalidation/size limits (33 tests)
- [ ] `targets.test.ts` — target calculations, daily/weekly goals
- [ ] `versionCheck.test.ts` — semver comparison logic
- [ ] `utils.test.ts` — all utility/helper functions

### T2. API client tests (mock fetch)
- [ ] `jira.test.ts` — API calls, response parsing, error handling, timeout
- [ ] `tempo.test.ts` — worklog CRUD, overlap check, error responses
- [ ] `activitywatch.test.ts` — bucket detection, event fetching, browser variants
- [ ] `slack.test.ts` — rate limiting, session detection, caching, TTL
- [ ] `gemini.test.ts` — prompt building, response parsing
- [ ] `openrouter.test.ts` — fallback logic, model selection

### T3. API route tests
- [ ] `/api/activities/` — response shape, date filtering, merged endpoint
- [ ] `/api/tempo/worklogs/` — GET/POST validation, overlap check
- [ ] `/api/llm/suggest/` and `/api/llm/parse-daily/` — AI pipeline, regex fallback
- [ ] `/api/dashboard/` — aggregation, partial failure handling
- [ ] `/api/settings/` — GET/POST persistence

---

## Critical — Production Stability

### 1. Dashboard API error handling
**File:** `apps/web/src/app/api/dashboard/route.ts`
- [x] Wrap per-date fetches in try-catch, return partial data on failure (already existed)
- [x] Add timeout to ActivityWatch calls (AbortSignal.timeout)

### 2. Dashboard frontend error handling
**File:** `apps/web/src/app/page.tsx`
- [x] Individual fetch functions already have try-catch (reviewed - not needed)
- [ ] Add error boundary for dashboard components

### 3. Tempo API response validation
**File:** `apps/web/src/lib/tempo.ts`
- [x] Check `response.ok` before calling `.json()` in all functions (already existed)
- [x] Added AbortSignal.timeout(15000) to all Tempo fetch calls
- [x] Return clear error messages for non-200 responses (already existed for createWorklog)

### 4. Jira API response validation
**File:** `apps/web/src/lib/jira.ts`
- [x] Check `response.ok` before parsing JSON (already existed for all functions)
- [x] Added AbortSignal.timeout(10000-15000) to all Jira fetch calls

### 5. Slack cache TTL eviction
**File:** `apps/web/src/lib/slack.ts`
- [ ] Add TTL-based eviction to `activitiesCache` (already has expiry, but no cleanup loop)
- [ ] Cap `activitiesCache` size to prevent unbounded growth
- [ ] Add TTL to `userCache` (currently only evicts at 200 entries, no expiry)

---

## High — Data Integrity & UX

### 6. Input validation for time logging
**File:** `apps/web/src/app/timesheet/page.tsx`
- [ ] Validate `parseFloat()` result for NaN/Infinity before logging
- [ ] Add min/max bounds for hours (0.01 - 24)

### 7. Remove hardcoded ticket IDs from Dashboard
**File:** `apps/web/src/app/page.tsx` (lines 110-115)
- [ ] Load QUICK_TICKETS from settings/API instead of hardcoded values
- [ ] Fall back to empty if not configured

### 8. Date validation on API endpoints
**Files:** `apps/web/src/app/api/activities/route.ts`, `api/dashboard/route.ts`, `api/analytics/route.ts`
- [x] Validate `date` parameter format (YYYY-MM-DD regex) — activities, dashboard/detailed
- [x] Clamp `days` parameter (1-90) — dashboard
- [ ] Add validation to analytics route

### 9. ActivityWatch timeout protection
**File:** `apps/web/src/lib/activitywatch.ts`
- [x] Add `AbortSignal.timeout(10000)` to bucket list fetch
- [x] Add `AbortSignal.timeout(30000)` to event fetch
- [x] Existing try-catch handles timeout errors gracefully

### 10. Duplicate logging prevention
**File:** `apps/web/src/app/timesheet/page.tsx`
- [ ] Disable "Log All" button during logging operation
- [ ] Add debounce or loading state to prevent double-clicks

---

## Medium — Quality & Reliability

### 11. ActivityWatch bucket detection
**File:** `apps/web/src/lib/activitywatch.ts`
- [x] Dynamic bucket detection already in place (no hardcoded MacBook-Pro)
- [ ] Add more browser variants (Arc, Vivaldi, Opera) to detection

### 12. Analytics partial failure handling
**File:** `apps/web/src/app/api/analytics/route.ts`
- [ ] Catch per-day errors, return partial aggregates instead of complete failure

### 13. Consistent API URL usage
**File:** `apps/web/src/app/my-issues/page.tsx`
- [ ] Replace hardcoded `/timetracker/api/...` paths with `apiUrl()` helper

### 14. CSV export newline escaping
**File:** `apps/web/src/app/my-issues/page.tsx`
- [ ] Escape newlines in notes before CSV export

### 15. Tempo API retry logic
**File:** `apps/web/src/lib/tempo.ts`
- [ ] Add exponential backoff retry (max 3 attempts) for transient failures (502, timeout)

---

## Low — Polish

### 16. Type safety for ADF parser
**File:** `apps/web/src/lib/jira.ts`
- [ ] Define proper ADF node interface, remove `any` types

### 17. Terminal command length truncation
**File:** `apps/web/src/lib/activitywatch.ts`
- [ ] Truncate long terminal commands to ~100 chars for display

### 18. LLM configuration feedback
**File:** `apps/web/src/app/my-issues/page.tsx`
- [ ] Add tooltip explaining why "Sugeruj (LLM)" is disabled

---

## Completed

- [x] Project enabled for Ralph
- [x] Memory safeguards: cache eviction (cache.ts), user cache eviction (slack.ts)
- [x] PM2 hardening: memory limit, restart policies, restart delay
- [x] Health endpoint: `/api/health` with memory/uptime reporting
- [x] Health check script: `scripts/health-check.sh`
- [x] Root package.json version synced to 0.7.0
- [x] Codebase review and architecture documentation
- [x] **Loop 1**: Timeout protection on all external API calls (AW, Jira, Tempo)
- [x] **Loop 1**: Date validation on activities & dashboard/detailed API routes
- [x] **Loop 1**: Parallel AW+Tempo fetch in dashboard/detailed with independent failure handling
- [x] **Loop 2**: Vitest infrastructure + cache.test.ts (33 tests passing)
- [x] **Loop 3**: mergeActivities.test.ts (20 tests — correlation, tolerance, sorting, edge cases)

---

## Notes

- Each task should be completed in a single loop
- Write tests only for new functionality (max 20% effort)
- Priority order: Critical > High > Medium > Low
- Always verify build passes after changes
