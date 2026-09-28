# ADR-012: Team Collaboration as a Separate Privacy Boundary

## Status

Accepted

## Context

VeloTerra needs shared exploration and lightweight team coordination without turning
personal rides, routes, wallet balances, rewards, or ride timestamps into team data.
The existing application is local-first, while team membership and synchronization
require an authenticated, server-authorized boundary.

## Decision

- Store teams, memberships, invitations, recommendations, shared H3 contributions,
  live presence, and team audit events in separate Supabase relations.
- Use authenticated Supabase user IDs for ownership and authorization. Use a
  permanent, case-insensitive username only for exact discovery and invitations.
- Enforce team access and Captain/Officer/Member permissions in PostgreSQL RPCs and
  RLS. The browser never receives a privileged credential.
- Share only H3 identifiers for team exploration. Personal rides, paths, wallet
  records, rewards, and timestamps remain outside the team schema and policies.
- Keep team contributions in a Dexie outbox. Synchronization is monotonic for active
  member contributions; leaving or removal deletes that member's team contributions
  without changing personal cells.
- Treat live position as a separate, explicit per-ride opt-in stream. The server
  rate-limits updates and expires records after 90 seconds; sign-out, ride finish,
  pause, leave, and removal clear the current position.
- Require an explicit historical-sharing disclosure and consent before invitation
  acceptance. Existing and future personal cells are contributed after consent.

## Consequences

- Team map rendering can never infer ride details from the team contribution rows.
- Offline riding remains available when Supabase is unavailable, but team views can
  be stale and pending contributions are surfaced to the user.
- Multiple teams are supported, with one selected team for map viewing and live
  sharing at a time.
- Account deletion cannot silently destroy a team: a Captain must transfer the role
  or delete the team first. Team-owned rows then cascade or anonymize according to
  their relation-specific foreign keys.
- Hosted migration deployment and authorization tests remain release gates because
  the client-side TypeScript build cannot validate PostgreSQL RLS behavior.
