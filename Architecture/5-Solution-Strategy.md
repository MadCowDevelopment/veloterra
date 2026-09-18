# 5. Solution Strategy

<details>
<summary>Documentation Hints</summary>

Summarize the fundamental solution approaches that address goals and constraints.
</details>

| Goal / Constraint | Strategy |
|---|---|
| Installable mobile experience without app stores | Progressive web application served over HTTPS. |
| Immediate ride feedback | Perform tracking, distance calculation, H3 reveal, rewards, and map updates in the browser. |
| Offline-first progress | Treat local browser persistence as the primary runtime store. |
| Offline basemap | Cache visited assets automatically and explicitly prefetch bounded regions through the service worker. |
| Optional cross-device continuity | Add Google-authenticated Supabase synchronization without requiring an account for local play. |
| Private cloud data | Scope every cloud operation to the authenticated user and enforce RLS server-side. |
| Compact exploration model | Represent explored territory as H3 cell identifiers at a fixed resolution. |
| Static, low-cost operation | Deploy immutable frontend artifacts to GitHub Pages and use managed external data services. |
| Test ride logic without physical GPS | Replace geolocation with automatic simulated fixes only in Vite development mode. |

## Architectural Style

- Client-side layered modular monolith.
- Event-driven React effects around browser position and visibility events.
- Local-first persistence with explicit two-way cloud reconciliation.
- Static deployment with managed SaaS integrations.

The rationale and consequences of significant choices are recorded in [Section 11](11-Architectural-Decisions/README.md).