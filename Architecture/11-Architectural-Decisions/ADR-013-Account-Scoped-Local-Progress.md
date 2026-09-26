# ADR-013: Account-Scoped Local Progress

## Status

Accepted

## Context

VeloTerra stores ride history, explored cells, and wallet state locally so the app
works without an account or network connection. A browser profile can later sign
in with more than one Supabase account. Global local stores would therefore make
the first account's private progress visible to, or upload it for, another account.

## Decision

- Key local cells and rides by a scope: the authenticated Supabase user ID while
  signed in, or `unassigned` while signed out.
- Store wallet snapshots by the same scope. Do not persist the active scope as the
  source of truth; it is selected from the current authentication state at startup.
- Open a new `veloterra-local` database and copy rows from the legacy `veloterra`
  database without deleting it. Treat every legacy progress row as ambiguous and
  copy it to `unassigned`.
- Render routes and start cloud synchronization only after the local stores have
  switched to the current authentication scope.
- Synchronize only rows whose local scope equals the authenticated user ID. Never
  upload `unassigned` progress automatically.
- Require an explicit user action to claim `unassigned` progress. The initial
  claim reconciles with the account snapshot; choosing to keep it separate only
  defers the decision. Later claims add newly accumulated signed-out progress.
  Each claim moves the current unassigned batch and clears its source, so the same
  batch cannot be claimed twice.
- Keep offline map regions device-wide, and filter team outbox work by its stored
  user ID. Team data remains a separate server-authorized boundary.

## Consequences

- Switching accounts on one device cannot reuse another account's local rides,
  explored cells, or wallet as the new account's local truth.
- Existing local data is preserved, but ambiguous legacy data requires an explicit
  decision instead of being silently attributed to an account. Keeping it separate
  does not discard the option to claim it later.
- Signed-out progress remains available offline and is never sent to Supabase until
  the user explicitly claims it.
- Account transitions briefly hold the route tree while the selected scope loads.
- Database migration, account switching, and claim behavior require browser
  validation in addition to the TypeScript/Vite build.