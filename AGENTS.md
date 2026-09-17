<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:git-workflow-notes -->
# Git workflow (Cowork / device-bridge sessions)

This repo is worked on from a cloud sandbox via a device bridge to Daria's
Mac (`~/Documents/scooter-rental`). Two things to know:

## Pushing — the sandbox cannot do it

The sandbox has no stored GitHub credentials, so `git push` from there
always fails. After committing a fix, tell Daria to run this herself in a
terminal on her Mac:

```bash
cd ~/Documents/scooter-rental && git push origin main
```

She usually confirms with something like "запушила" / "зробила". Verify it
actually landed with a read-only fetch (works anonymously, no push rights
needed):

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
```

If the two hashes match, the push succeeded.

## Committing from the sandbox — stale lock files

`device_bash` sessions are short-lived and sometimes leave `.git/index.lock`
or `.git/HEAD.lock` behind from an interrupted call. `rm` on them fails with
"Operation not permitted" in the FUSE-mounted folder, but `mv` succeeds.
Before any git command that writes (add/commit), clear stale locks first:

```bash
mv .git/index.lock ".git/index.lock.bak-$(date +%s)" 2>/dev/null
mv .git/HEAD.lock ".git/HEAD.lock.bak-$(date +%s)" 2>/dev/null
```

Stray `warning: unable to unlink '.git/objects/.../tmp_obj_...'` messages
during commit are harmless and can be ignored.
<!-- END:git-workflow-notes -->
