# Cross-Repository Baseline

**Date:** 2026-08-17. Re-verified fresh this milestone across all 5 repositories in the
`D:\.kiro` workspace — nothing carried over from memory or prior session notes without
re-running the actual command.

## Repository inventory

| Repository | Type | VCS | Branch | HEAD | Remote | Uncommitted changes |
|---|---|---|---|---|---|---|
| `askabd-comparison` | Fastify API + Next.js web app | git | `feature/reliability-hardening` | `a9082ca478b94a4dabf35dbe5a5076a1499b6226` | `github.com/Askabd-Vinod/askabd-comparison` | 79 files (all pre-existing from this session's prior milestones — none newly introduced beyond what this milestone adds, see "Files Added/Modified" in the final report) |
| `askabd-identity` | Fastify identity/auth service | git | `master` | `77f76f8366c5db3f3bee99bb43a193270e265a2e` | none configured | 1 file (`node_modules/.vite/.../results.json` — a test-runner cache artifact, not source) |
| `askabd-shared` | Turborepo monorepo of shared packages | git | `main` | `3141e55e69460bc20e649b6dc43ae09c497f2098` | `github.com/Askabd-Vinod/askabd-shared` | `package-lock.json` + 6 untracked `.tgz` build artifacts (pre-existing vendored packages, same pattern already documented for `askabd-comparison`) |
| `askabd-workflow` | Standalone rules-engine library | **none — not a git repository** | — | — | — | n/a |
| `askabd-website` | Static HTML marketing site (Cloudflare Pages) | git | `Dev` | `c79c034b9ceb86c6b85694cfecd5fb645879b2be` | `github.com/Askabd-Vinod/askabd-website` | 1 modified + 5 untracked HTML pages (pre-existing, unrelated to this milestone) |

**No repository was reset, checked out to an old commit, or had any change discarded.**

## Test and build health (fresh, re-run this milestone)

| Repository | Tests | API/lib build | Notes |
|---|---|---|---|
| `askabd-comparison` (API) | **207/207 passing** (29 files) | Clean (`tsc --noEmit`) | Re-run fresh, matches the end of the prior milestone's session |
| `askabd-comparison` (Web) | n/a (no unit tests configured) | Clean (verified in the prior milestone this session; not re-touched) | |
| `askabd-identity` | **177/177 passing** (14 files) | **13 pre-existing TypeScript errors** (`tsc --noEmit`) — see below | Not introduced by this milestone; this repository was not modified before this check |
| `askabd-shared` | **All 21 Turborepo test tasks passing** across 7 packages (contracts, utilities, logging, errors, validation, result, configuration) | Not separately re-run this milestone (turbo caches builds; tests passed against the current build) | |
| `askabd-workflow` | **9/9 passing** (1 file, `rules-engine.test.ts`) | Not checked — `tsconfig.json` exists but no `build` was run this milestone (low priority: the repo has no server, no routes, no DB — see architecture doc) | |
| `askabd-website` | n/a — static HTML, no test framework | n/a — no build step (Cloudflare Pages serves the HTML directly) | |

### askabd-identity's 13 pre-existing TypeScript errors — investigated, not fixed

`npx tsc --noEmit` in `askabd-identity` reports 13 errors, all pre-existing (this milestone had
not touched any `askabd-identity` source file before running this check):
- 7× `TS6133`/`TS6138` "declared but never read" (unused `DomainError` imports, unused
  `eventPublisher` constructor params in several services) — harmless lint-level debt.
- 1× `TS2353` in `auth-service.ts`: an object literal sets `retryAfterMs` on a `DomainError`
  value where the type doesn't declare that field — a real type-safety gap, though the code
  still runs (tests pass; this is a compile-time strictness issue, not a caught runtime bug).
- **4× `TS2694`, all in `token-service.ts`, all `Namespace '.../jose/dist/types/index' has no
  exported member 'KeyLike'`** — the exact file responsible for the ephemeral EdDSA signing key
  documented in the prior milestone's `docs/identity-token-contract.md`. The installed `jose`
  version's type declarations no longer export a `KeyLike` type under that name; this is a
  type-only mismatch (the code executes correctly — all 15 `token-service.test.ts` tests pass at
  runtime), not a functional defect. Left unfixed this milestone: editing a different team's
  repository's type imports without understanding their intended `jose` version pin is exactly
  the kind of unrelated change this milestone's "minimal safe change" principle warns against.
  Flagged here so it isn't silently missed.

None of these 13 errors are new; none were caused by this milestone; none block the 177 passing
runtime tests.

## Runtime services

| Service | Port | Status this session |
|---|---|---|
| `askabd-comparison` API | 4200 | Healthy, `database: connected` (confirmed via `curl /health`) |
| `askabd-comparison` web | 3001 | Healthy, browser-UAT confirmed in the prior milestone |
| PostgreSQL (`comparison` DB) | 5442 | Connected |
| `askabd-identity` API | 3100 | **Not running** — `curl localhost:3100/health` refused (confirmed both this milestone and the prior one) |
| PostgreSQL (`identity` DB) | 5432 (per `askabd-identity/docker-compose.yml`) | Not verified running — identity's own docker-compose was not started this milestone (no destructive or infrastructure-altering action taken) |
| `askabd-workflow` | n/a | No server exists in this repository yet (see architecture doc) |
| `askabd-website` | n/a | Static site, no dev server needed for this audit |

No infrastructure was started, stopped, or reconfigured as part of gathering this baseline.
