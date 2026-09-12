# Client-only game for now

The bankroll lives in `localStorage`; there is no server, no accounts, no persistence beyond the browser, and no leaderboards. The game is "for fun" — money is free (a Top-up exists), so there is nothing worth protecting server-side yet.

The rules engine is kept independent of the UI (no React, no DOM): it is a pure module the UI drives. This keeps the door open for an automated simulator to drive the same engine headlessly later, which is the repo's namesake.

Rejected for now: server-side bankroll, accounts, leaderboards. When real money or multi-device persistence arrives, this ADR gets superseded.