# VeloTerra Project Plan

This file collects future requirements, product ideas, experiments, and unresolved questions. It does not describe the current architecture.

- Current architecture: [Architecture/README.md](Architecture/README.md)
- Repository and development overview: [README.md](README.md)
- User manual: `MANUAL.md` (planned)

## Near-Term Requirements

### Units

- Allow users to select metric or imperial units.
- Apply the selection consistently to live rides, summaries, history, and wallet statistics.
- Keep persisted distance in meters; convert only for presentation.

### User Manual

- Add `MANUAL.md` for installation, permissions, ride controls, offline preparation, account/sync behavior, and local reset.
- Keep user instructions out of the architecture documentation.

## Candidate Requirements

### Ride and Navigation

- Add an optional heading-up camera mode while preserving north-up mode.
- Stabilize heading at low speed and retain the last reliable heading when GPS direction is noisy.
- Define recovery behavior for prolonged GPS loss during an active ride.
- Consider a battery-use hint for long rides.

### Exploration

- Evaluate zoom-dependent visualization so explored territory remains legible when zoomed out while rewards continue using the fixed underlying grid.
- Prototype automatic reveal of fully enclosed unexplored pockets.
- Decide whether completion is based on neighboring cells, explored roads, or another geometric rule.
- Decide whether automatically revealed cells earn no coins, reduced coins, or normal rewards.

### Social Features

- Explore an aggregated community map without exposing individual live positions or raw ride ownership.
- Decide between global, friends-only, and selectable visibility.
- Define consent, retention, attribution, deletion, and abuse controls before implementation.
- Evaluate leaderboards only after wallet integrity and privacy rules are established.

### Background Tracking

- Keep the PWA foreground-only unless user demand justifies a second distribution form.
- If required, evaluate a Capacitor Android wrapper with a background-geolocation plugin and foreground-service notification.
- Do not use TWA/Bubblewrap as a background-GPS solution; it retains browser execution limits.
- Prefer CI-built APK artifacts if a native wrapper is pursued.

### Offline Maps

- Measure cache eviction and storage behavior on representative Android devices.
- Consider PMTiles or another archive format only if HTTP tile prefetch proves unreliable or inefficient.
- Improve region naming and selection if users manage many downloaded areas.

## Engineering Improvements

- Add automated unit tests for economy, H3 migration, fog geometry, tile enumeration, currency conversion, and synchronization mapping.
- Add browser smoke tests for routing, ride simulation, reveal, summaries, and map worker loading.
- Repair the standalone `npm run typecheck` command.
- Check every Supabase result for returned errors.
- Stop suppressing IndexedDB persistence failures and add retry/recovery behavior.
- Isolate simulated development progress from real local data.
- Define deterministic ride-path downsampling.
- Add privacy-conscious diagnostics for field failures.

## Open Product Questions

1. Which metric/imperial default should be selected from browser locale, if any?
2. How should automatic area completion work, and should it grant rewards?
3. Which social-map visibility model is acceptable?
4. Is background tracking valuable enough to justify a separately distributed Android build?
5. What offline storage size and retention expectations are reasonable for typical devices?

## Prioritization

1. Protect correctness with tests and versioned cloud schema.
2. Add units and user documentation.
3. Deploy and tune collaborative landmark restoration.
4. Prototype exploration visualization/completion improvements.
5. Revisit social and native-background features only after privacy and operational requirements are explicit.