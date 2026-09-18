# VeloTerra Project Guidelines

## Source of Truth

- Use [Architecture/README.md](Architecture/README.md) for the implemented architecture and architectural decisions.
- Use [PLAN.md](PLAN.md) only for future requirements, experiments, and unresolved questions.
- Keep [README.md](README.md) concise and focused on repository orientation and development setup.
- Put user-facing installation and usage guidance in `MANUAL.md` when that document is introduced.

## Architecture

- Preserve the local-first design. Ride tracking, exploration, rewards, and local persistence must work without an account or cloud connection.
- Keep screens as orchestrators over focused modules in `src/map`, `src/state`, `src/data`, `src/domain`, `src/hooks`, and `src/lib`.
- Store structured ride, explored-cell, and offline-region data through Dexie/IndexedDB. Use persisted Zustand state only for small wallet and preference data.
- Keep economy and exploration constants centralized in `src/domain/economy.ts`; do not duplicate them in UI code.
- Treat Supabase as optional synchronization, not the primary ride write path. Preserve monotonic merge behavior unless an ADR explicitly replaces it.
- Record significant or difficult-to-reverse architecture changes in `Architecture/11-Architectural-Decisions/` and update `Architecture/Version-History.md` when the SAD changes materially.

## Security and Privacy

- Never put a Supabase service-role credential or another privileged secret in browser code.
- Treat ride paths, explored cells, offline-region bounds, and authentication sessions as sensitive user data.
- Cloud access must remain user-scoped and protected by PostgreSQL Row Level Security.
- Do not publish individual live locations or ride traces through social features without explicit privacy requirements.

## Development

- Install dependencies with `npm install` and run the development server with `npm run dev`.
- Vite development mode automatically uses simulated GPS; map clicks emit fixes through the normal ride-processing path.
- The service worker is disabled during `npm run dev`. Test PWA installation and offline-region downloads with `npm run preview` or a deployed build.
- Preserve `BASE_URL` handling. Routing, OAuth redirects, PWA scope, service-worker assets, and MapLibre worker URLs must work under `/veloterra/` and `/velonext/`.
- Preserve the Vite development middleware and build-time copy behavior for MapLibre worker modules.

## Validation

- Run `npm run build` after code or build-configuration changes. This is the current executable CI validation.
- Do not use `npm run typecheck` as a success criterion until its composite-project `--noEmit` conflict is fixed.
- There is currently no automated test suite. Add focused tests for changed domain behavior when introducing a test framework.
- For map, ride, or PWA behavior, supplement the build with a focused browser check in the appropriate development or preview mode.
- For architecture documentation changes, verify local Markdown links, `.order` entries, Mermaid fences, and `git diff --check`.

## Change Discipline

- Follow existing TypeScript, React, and CSS patterns; keep changes narrowly scoped.
- Do not silently swallow new persistence or synchronization errors.
- Do not conflate simulated development behavior with production geolocation behavior.
- Avoid unrelated refactors, generated-file churn, and dependency changes unless required by the task.