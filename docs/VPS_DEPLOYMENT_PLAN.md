# Herpetarium VPS Deployment Plan

## Purpose

This is a simple deployment plan for moving Herpetarium onto the DigitalOcean VPS that already hosts Signal Garden.

The goal right now is:

- get the repo onto the VPS
- make it runnable there
- keep it separate from Signal Garden operationally
- avoid over-engineering

This is **not** a full infrastructure redesign.

## Working assumptions

- The VPS is better thought of as an `LC Lab` / `LC Research` machine, not a Signal Garden-only box.
- Signal Garden and Herpetarium should live on the same host for now, but as separate apps.
- We are not treating Herpetarium's current stack as sacred.
- We are explicitly allowed to revisit the database and broader architecture later.

## Recommended approach

For now, do the smallest thing that works:

1. Clone `Herpetarium` onto the VPS.
2. Run it as its own app on its own port.
3. Keep its environment/config separate from Signal Garden.
4. Do not merge runtimes, databases, or process managers with Signal Garden.
5. Re-evaluate the deeper stack only after the app is running on the VPS.

## What "done" means for phase 1

Phase 1 is successful if:

- the repo exists on the VPS
- dependencies install cleanly
- the app can start on the VPS
- it is reachable on a chosen port
- it has a basic service/launcher so it can be restarted reliably

That is enough.

## What we are deliberately not deciding yet

Not part of this phase:

- final database architecture
- long-term storage architecture
- reverse proxy / domain strategy
- public production hardening
- deep integration with Signal Garden
- redesign of Herpetarium's existing app architecture

Those can come later.

## Suggested VPS layout

Keep it boring:

- `/home/sg/signal-garden`
- `/home/sg/herpetarium`
- separate `.env` files
- separate startup scripts
- separate services/processes

Signal Garden remains the research brain.
Herpetarium remains the experiment arena.

## Immediate next steps

1. Clone `Herpetarium` to `/home/sg/herpetarium`.
2. Create a fresh VPS-specific `.env`.
3. Install dependencies.
4. Try a local start on the VPS.
5. Pick a stable port.
6. Add a simple service wrapper once the app starts cleanly.

## Principle

Do not solve future scale, future storage, and future architecture all at once.

First make Herpetarium present on the VPS.
Then make it stable.
Then decide what it should become.
