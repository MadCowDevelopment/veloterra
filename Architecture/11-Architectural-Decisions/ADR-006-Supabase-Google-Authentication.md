# ADR-006: Optional Google Authentication through Supabase

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Users need optional backup and cross-device continuity without introducing a custom backend or forcing account creation for local play.

## Decision

Use Supabase Auth with Google OAuth for real accounts. Treat signed-out use as device-local and ignore anonymous Supabase identities in the UI. Use the Supabase browser client with a publishable key and enforce access through RLS.

## Consequences

- Account and database infrastructure are managed services.
- Local gameplay remains independent of identity-provider availability.
- OAuth redirects must match each deployment base path.
- Security depends on externally configured RLS and provider settings.
- Google-only authentication limits identity-provider choice.