# e2e-tests local reproduction and fix — 2026-08-23T19:16:30Z

## Before fix (reproduction on 856f697 spec, unmodified worktree)
```
21 failed, 10 passed (31 total) — bun run test:e2e, Playwright chromium

Failure classes:
1. Stale expected strings: '90-day forecast with SHAP explainability',
   'Best Model:', 'Revenue Forecast - Store', 'Revenue by Hierarchy',
   'Store <n> - ', 'Using demo data' — all renamed by PR #1 honesty
   corrections (e368f52/739f4f8) or the earlier Revenue->Unit Sales rename.
2. Strict-mode violations: responsive dual-header layout renders desktop +
   mobile date inputs / horizon selects; tests used unscoped locators.
3. CSV export test predated the Export dropdown: it clicked Export and
   waited for a download without choosing CSV from the menu.
```

## After fix — run 1
```
  31 passed (27.2s)
```
## After fix — run 2 (stability check)
```
  31 passed (28.1s)
```
## Also verified: bun run typecheck && bun run lint — both pass
(No production source files changed; only e2e/dashboard.spec.ts expectations.)
