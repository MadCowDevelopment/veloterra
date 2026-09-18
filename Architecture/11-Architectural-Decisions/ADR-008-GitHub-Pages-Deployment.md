# ADR-008: Static GitHub Pages Environments

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

The PWA is static and should have minimal hosting cost. Main and development builds need separate public URLs and path prefixes.

## Decision

Deploy `main` to the `veloterra` GitHub Pages site using the native Pages workflow. Deploy `dev` to the separate `velonext` repository's `gh-pages` branch. Drive router, PWA, OAuth, and asset paths from `BASE_URL`. Generate `404.html` from the SPA entry point.

## Consequences

- Hosting has no dedicated runtime servers.
- Branch pushes automatically publish their corresponding environments.
- Development deployment requires a cross-repository token.
- GitHub Pages has no native SPA rewrite; the generated fallback is required.
- Base-path drift can break routing, OAuth, service workers, or worker assets.