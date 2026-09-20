# ADR-009: Copper as the Currency Base Unit

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Rewards need exact integer arithmetic while the UI should show game-like denominations.

## Decision

Persist and synchronize all balances and ride earnings as integer copper. Derive silver, gold, and diamond presentation tiers using powers of 100.

## Consequences

- Economy arithmetic avoids floating-point currency errors.
- Persistence and cloud fields have one stable unit.
- Display formatting is centralized and can evolve independently.
- Any future spending API must also use copper or perform explicit conversion.