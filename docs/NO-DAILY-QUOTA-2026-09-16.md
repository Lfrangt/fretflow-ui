# Daily analysis quotas removed — 2026-09-16 UTC

FretFlow no longer limits daily analyses per browser session or across the service.
The former two-per-session and fifty-global counters, their environment examples,
and the English/Chinese daily-limit messages have been removed. Old admission
rows and old daily-limit environment values do not block work.

Session ownership, signed upload/download tickets, queue backpressure, file size,
clip duration and the existing 24-hour media retention continue to work.

## Verification

- Frontend tests: 54 passed; Python tests: 63 passed.
- TypeScript, production build and whitespace checks passed.
- Hosted regression tests seed 55 legacy admission rows and test repeated uploads,
  demos and reanalysis beyond the previous per-session limit.
- Ownership, ticket scope/replay protection and active-job backpressure tests pass.
- The public worker completed four consecutive analyses for a QA owner that had
  already used its former two-job allowance earlier that day.

- The existing Chrome session reproduced the old daily-limit error before the
  update, then completed an analysis and displayed exports afterward with no alert.
- The deployed Chinese panel no longer shows daily-limit copy.

## Release

Frontend deployment `dpl_FnycBhKjzuA8GGK3tLG5nDUSLEqq` was promoted to
https://www.fretflow.io/. The Grok Box worker's `backend/app.py` and
`backend/hosting.py` were backed up and updated while its queue was empty; its
supervisor restarted the worker. Daily settings were removed from the private
environment file. Existing jobs and ticket data were kept.

The downloadable worker source archive was updated as well, so reapplying the
previous performance-update workflow will include the removal.
Archive SHA-256: `672d3988f7a47c3695f7efa0b386d1d449d9d93bb77de4ee9bc3347e98fdbe45`.
