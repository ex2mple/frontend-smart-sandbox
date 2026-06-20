/**
 * Guards the tracked-but-machine-rewritten routes file from accidental commits.
 *
 * `src/app/sandboxes/sandbox.routes.generated.ts` is committed as `[]`, but the
 * companion server rewrites it locally on every run to reference git-ignored
 * `generated/` folders. Committing that local version breaks a fresh clone's
 * build. This script (run via `postinstall`) makes git ignore those local
 * rewrites and installs a pre-commit safety net. Idempotent; a no-op outside a
 * git checkout so `npm install` never fails because of it.
 */
import { execFileSync } from 'node:child_process';

const GENERATED_ROUTES = 'src/app/sandboxes/sandbox.routes.generated.ts';

/** Run a git command, returning stdout; throws on non-zero exit. */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

try {
  // Bail quietly when not inside a git work tree (e.g. tarball install, CI cache).
  if (git('rev-parse', '--is-inside-work-tree') !== 'true') {
    process.exit(0);
  }
} catch {
  process.exit(0);
}

// Route commit hooks through the committed .githooks/ directory.
try {
  git('config', 'core.hooksPath', '.githooks');
} catch {
  /* non-fatal */
}

// Tell git to ignore local modifications to the generated routes file.
try {
  // Only if the file is actually tracked; --skip-worktree errors otherwise.
  git('ls-files', '--error-unmatch', GENERATED_ROUTES);
  git('update-index', '--skip-worktree', GENERATED_ROUTES);
  console.log(`[sandbox] git now ignores local changes to ${GENERATED_ROUTES}`);
} catch {
  /* file not tracked yet — nothing to protect */
}
