# Playable table first: client-only, pure engine

The repo is named "simulator" but the product is a playable single-seat table. We decided the whole experience runs client-side — no backend, no database. The blackjack rules live in a pure TypeScript engine module (shoe, dealing, actions, settlement as plain state), and React is a thin UI layer over it; the bankroll persists in `localStorage`.

Considered server-authoritative play (Next server actions with a session store) and rejected it: the product is a single local player, so a server adds cost with no benefit. Keeping the engine pure also leaves the door open for the "simulation" layer implied by the repo name — auto-playing hands and computing stats — without entangling it with the UI.