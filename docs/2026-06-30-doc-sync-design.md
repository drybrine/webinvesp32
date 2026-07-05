Doc sync design

Scope: update existing documentation so a future agent can start by reading repo docs without chat context.

Source of truth: AGENTS.md.

Files:
- README.md: keep as user/dev overview; add explicit agent handoff pointer to AGENTS.md; sync firmware, heartbeat, offline, OTA, admin API, no-price, no-attendance notes.
- DESIGN.md: sync architecture with current Vercel/Firebase setup; remove stale Firebase Cloud Functions sweeper and thesis-out-of-scope anomaly-display claims.
- DEPLOYMENT.md: sync firmware/provisioning version and deployment assumptions.
- CLAUDE.md: mirror AGENTS.md facts relevant to future agents.

Non-goals: app behavior changes, new runtime dependencies, new feature docs, full prose rewrite.

Verification: grep stale known values and run typecheck only if code files change. Docs-only edit does not need build.
