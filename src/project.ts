import { existsSync, statSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

/**
 * Find the nearest Git repository containing the supplied path. This keeps
 * `npx blimpr install` pointed at the user's project even when it is run from
 * a nested package or app directory.
 */
export function resolveProjectPath(input = process.cwd()): string {
  let current = resolve(input);
  if (existsSync(current) && statSync(current).isFile()) {
    current = dirname(current);
  }
  const startingPath = current;
  const root = parse(current).root;

  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    if (current === root) return startingPath;
    current = dirname(current);
  }
}
