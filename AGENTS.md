# AGENTS.md

## When the user interjects

An interjection — a question, a "what are you doing", a "stop" — pauses the work. Answer it and end the turn; resume only on the user's explicit go-ahead. Do not run further tools in that turn, even to finish up or check one more thing.

## You are in a sandbox

The bash tool is sandboxed: isolated filesystem view, its own localhost, no host network access, and processes die when the command ends. When a task needs something beyond it — a daemon the browser must reach, a system tool, network access, credentials — do not improvise a workaround. Ask the user: give the exact command to run, where to run it (plain shell or which tmux session/window), and justify the need in one line. Then wait for the user's result.

**Git pushes to GitHub work from the sandbox.** gh is logged in with `repo` scope and HTTPS is the working path — push with `git -c credential.helper='!gh auth git-credential' push https://github.com/ericf1/blackjack-simulator.git main` (same form for fetch/ls-remote). The SSH remote (`git@github.com:...`) fails in here — host-key verification with no ssh-askpass — so don't route git network operations through tmux or the host.

## Running the app (dev server)

The bash tool runs each command in an **ephemeral sandbox**: processes die when the command ends, and each command gets its own isolated `localhost` — so a dev server started with a plain bash command is unreachable by the next bash command *and* by the browser. Long-running processes (dev server, watchers) must live in a tmux session on the host.

Working pipeline:

1. **Check for an existing server first**: `tmux ls`. A `blackjack-dev` session is the conventional home for `npm run dev`. Capture its pane (`tmux capture-pane -t blackjack-dev -p`) to see server state and errors.
2. **If the browser reaches `localhost:3000` but your bash `curl` can't**, that's the topology clue, not a bug: the server is in tmux on the host; your sandbox can't see it. Don't start a competing server — fix or use the tmux one.
3. **Restart the server via tmux**, e.g. `tmux send-keys -t blackjack-dev C-c`, then `tmux send-keys -t blackjack-dev 'npm run dev' Enter`. A stuck `next`/`npm` process may ignore Ctrl-C: open a new window in the session (`tmux new-window -t blackjack-dev -n fix`) and `kill -9 <pid>` there (get the pid from `tmux list-panes -a -F '#{session_name} #{pane_pid} #{pane_current_command}'`).
4. **Corrupted build state**: 500s with `ENOENT ... .next/server/app/page.js` or `pages/_document.js` mean the `.next` dir is broken — stop the server, `rm -rf .next` from the tmux window (repo cwd), start again.
5. **Verify end-to-end with the browser** (agent_browser hits the host's `localhost:3000`), not with in-sandbox curl.

## Screenshots and page inspection (agent_browser)

Drive multi-step browser work in **script mode**. In `args` batch mode only the first command's result comes back — later commands (screenshot, snapshot) may never run, and the silence reads as success. Script mode returns every command's structured result. This distinction cost four failed attempts to learn; it is one line to obey.

The whole capture is one script-mode call:

```js
await browser({ args: ["open", "http://localhost:3000"] });
await browser({ args: ["wait", "1200"] });
const shot = await browser({ args: ["screenshot", "/home/human/github/blackjack-simulator/tmp/site.png"] });
emit(shot?.text ?? shot);
```

Completion criterion: the result's `details.artifactVerification` reports `status: "saved"` and `verified: true` with a non-zero size — or an `ls -la tmp/` from bash shows the file. Claiming "saved" on anything less is how a screenshot goes missing.

- **Absolute paths into the repo** for every artifact (`.../blackjack-simulator/tmp/...`): agent-browser's cwd is not guaranteed to be the repo, and only repo files are visible to the bash sandbox.
- **Check image support before promising to "view" a screenshot.** `read` on a PNG may return "Current model does not support images" — a model capability, so no screenshot variant fixes it. Inspect the page as text instead: `snapshot -i` in script mode emits the accessibility tree (controls, labels, refs), which describes the page well enough to reason about. The PNG stays in `tmp/` for the human.
- **The impeccable live overlay appears in screenshots and snapshots** of a live-session page (Pick element, Steer, Exit live mode) — tooling chrome, not product UI.
- **Read the structured result, not the README.** Grep-ing the agent-browser README trips the secret sentinel, and the docs paths named in the tool description may not exist on disk; the result's `details` self-documents.

## Scratch files

Transient scratch files (command output, temp JSON, poll logs) go in `tmp/` at the repo root (gitignored; create it on demand). `/tmp` and the home directory are never used for anything this project produces.

## Live design sessions (impeccable live)

A live session's boot should cost a handful of calls. The expensive failure mode is hand-rolling what the tooling already provides. Workflow:

1. **Inventory in one call.** `tmux ls` + `impeccable live-status` + a peek at `.impeccable/live/config.json` (present = setup done). From that alone decide: dev server up? helper registered? unfinished session to resume? Never re-derive these one probe at a time.
2. **Boot canonically.** Run `impeccable live` (the boot) in tmux — it starts AND registers the helper; `live-poll` only discovers registered servers. A bare `live-server` start looks alive on its port but is invisible to poll. If a stale server holds the port: `impeccable live-server stop --keep-inject`, then boot.
3. **Relay through tmux; the file is the truth.** The bash sandbox cannot reach the host's localhost, so every helper command (boot, poll, reply, wrap, accept) runs in a tmux window with output redirected to a project file, and the sandbox waits for that file to become non-empty, then reads it. Never block on tmux channels: `wait-for -S <ch>` signals and returns instantly (it looks like a failed poll when it was really a no-op), and a bare `wait-for` hangs if its signal fired before the wait started. One round, two calls:
   - **Dispatch** (one `send-keys`, note the `rm -f` resets the round): `tmux send-keys -t <session>:<window> "rm -f tmp/live-poll.json; .pi/skills/impeccable/scripts/impeccable live-poll >tmp/live-poll.json 2>tmp/live-poll.err" Enter`
   - **Wait, then read**: `timeout 620 bash -c 'until [ -s tmp/live-poll.json ]; do sleep 2; done'` → read `tmp/live-poll.json`; if the wait times out, read `.err` and `tmux capture-pane` the window before retrying.
   The wait timeout must exceed the command's own (`live-poll` defaults to 600 s → block ≥620 s; for fast commands like `--reply` or `live-wrap`, 60 s suffices).
4. **One long poll, serviced.** Default timeout, never a short `--timeout=`. A `timeout` event means nothing happened — restart the poll and loop quietly. Handle events per the skill's live reference.
5. **Read on demand, summarize on print.** Boot context arrives once; route sources, craft floor, and action references are read only when a generate event needs them. `live-status`/`live-resume` embed the whole picked element (a page of HTML) — pipe through jq/python and print ids, phases, and short fields only.
6. **Stale Gos are not yours to fulfill.** A pending generate from a dead session: `live-resume --id <id>` to see it, then service it or cancel via `live-poll --reply <id> error "..."` with the user's OK. Never auto-generate on someone else's click.

Known snags: `live-wrap` errors `element_ambiguous` when a component renders the same tag more than once (e.g., a loading fallback) — pass `--text`, and on failure pick the source range manually. Helper errors name their cause — `grep -a` the binary for the exact error string before touching `ps`/`ss`. After two failed hypotheses about a helper, stop and report instead of digging further.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (`ericf1/blackjack-simulator`), managed with the `gh` CLI — which works from the sandbox over HTTPS (including PR triage). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage role names are the label strings, used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Before exploring the codebase or naming domain concepts, read `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.