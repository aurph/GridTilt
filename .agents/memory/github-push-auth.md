---
name: GitHub push auth in this repl
description: How git pushes are authenticated after the Replit GitHub connection stopped working
---
- Replit's GitHub connection shows "added" but hands out no credentials here (askpass empty, connection creds withheld) — pushes via platform tooling fail.
- Auth now comes from the `GITHUB_PERSONAL_ACCESS_TOKEN` secret via a local `credential.helper` in `.git/config` that echoes the env var (token never written to disk). Plain `git push origin main` works.
- **Why:** the old remote URL had an expired PAT embedded, which overrode all credential helpers and caused every push to fail with "Invalid username or token". Never embed tokens in remote URLs.
- **How to apply:** if pushes fail again, first check `git remote -v` for tokens in URLs, then confirm the secret still exists and the credential.helper is intact.
- History note (July 2026): earlier "pulls" were file snapshots, not merges, so local main diverged from GitHub; reconciled with `git merge -s ours origin/main`. Future pulls should be real git pulls/merges to avoid re-divergence.
