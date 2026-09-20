# ADR-007: Monotonic Cloud Merge Semantics

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Devices can accumulate progress independently while offline. The current data model has counters and snapshots rather than an auditable event ledger.

## Decision

Merge explored cells by set union, rides by ID union, and wallet fields by taking the maximum local/cloud value. Normalize H3 cells before merge. Prevent concurrent sync executions in one browser context.

## Consequences

- Synchronization is simple, deterministic, and non-destructive.
- Offline devices converge without interactive conflict resolution.
- Incorrect or inflated data propagates and cannot be automatically reversed.
- Counter maxima are not mathematically equivalent to merging independent rewards.
- A future spending game requires a ledger-based redesign.