# AGENTS.md

## Running the app (dev server)

The bash tool runs each command in an **ephemeral sandbox**: processes die when the command ends, and each command gets its own isolated `localhost` — so a dev server started with a plain bash command is unreachable by the next bash command *and* by the browser. Long-running processes (dev server, watchers) must live in a tmux session on the host.

Working pipeline:

1. **Check for an existing server first**: `tmux ls`. A `blackjack-dev` session is the conventional home for `npm run dev`. Capture its pane (`tmux capture-pane -t blackjack-dev -p`) to see server state and errors.
2. **If the browser reaches `localhost:3000` but your bash `curl` can't**, that's the topology clue, not a bug: the server is in tmux on the host; your sandbox can't see it. Don't start a competing server — fix or use the tmux one.
3. **Restart the server via tmux**, e.g. `tmux send-keys -t blackjack-dev C-c`, then `tmux send-keys -t blackjack-dev 'npm run dev' Enter`. A stuck `next`/`npm` process may ignore Ctrl-C: open a new window in the session (`tmux new-window -t blackjack-dev -n fix`) and `kill -9 <pid>` there (get the pid from `tmux list-panes -a -F '#{session_name} #{pane_pid} #{pane_current_command}'`).
4. **Corrupted build state**: 500s with `ENOENT ... .next/server/app/page.js` or `pages/_document.js` mean the `.next` dir is broken — stop the server, `rm -rf .next` from the tmux window (repo cwd), start again.
5. **Verify end-to-end with the browser** (agent_browser hits the host's `localhost:3000`), not with in-sandbox curl.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (`ericf1/blackjack-simulator`, accessed via SSH), managed with the `gh` CLI (including PR triage). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage role names are the label strings, used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Before exploring the codebase or naming domain concepts, read `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.