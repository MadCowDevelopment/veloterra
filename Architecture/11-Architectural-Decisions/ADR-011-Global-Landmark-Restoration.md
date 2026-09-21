# ADR-011: Global Landmark Restoration

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted
**Date:** 2026-09-21

## Context

VeloTerra needs a shared coin sink based on real-world landmarks. All authenticated users must see the same progress, contribute concurrently, and receive credit. OpenStreetMap has open-ended tags and mutable element identifiers. The existing maximum-balance synchronization cannot represent spending safely.

## Decision

- Discover named landmark candidates around newly explored areas during authenticated, non-simulated rides through a Supabase Edge Function. Map browsing never triggers discovery.
- Backfill persisted explored cells incrementally on the exploration screen. Globally completed discovery areas are recorded so all riders reuse prior catalog work without consuming quota.
- Exclude wayside crosses and shrines from the initial catalog.
- Normalize OSM tags into 20 controlled categories and four significance tiers.
- Prefer Wikidata identity when available; otherwise use the OSM element type and identifier.
- Assign and persist category, tier, multiplier, and restoration cost when a landmark is first inserted.
- Show all cataloged landmarks whose resolution-11 H3 cell the current rider has explored. Zoom and viewport changes affect rendering and reads, not project eligibility.
- Store global totals and an immutable contribution ledger in Supabase.
- Apply contributions through one idempotent transaction that locks wallet and landmark rows.
- Represent wallet state as monotonic lifetime earnings minus server-authoritative spending.
- Show a generic ruin icon before completion, add a construction badge and progress ring after the first contribution, and reveal the category icon when restored.

## Consequences

- Concurrent contributions cannot overspend a wallet or exceed a landmark cost.
- Offline ride tracking remains available, but restoration discovery and contributions require authentication and connectivity. A ride completed offline can reveal terrain without immediately adding new global projects.
- Catalog quality depends on OSM tagging and the versioned classifier.
- Existing landmark prices do not change when OSM tags or balancing constants change.
- The service-role credential is confined to the Edge Function.
- Client-asserted ride earnings remain an integrity limitation until server-verifiable earning is introduced.
