import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { resolveProjectPath } from "./project.js";

export type RepositoryIdentity = {
  path: string;
  name: string;
  key: string;
};

function gitRemote(repoPath: string): string | undefined {
  try {
    return execFileSync(
      "git",
      ["-C", repoPath, "config", "--get", "remote.origin.url"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim() || undefined;
  } catch {
    return undefined;
  }
}

function normalizeRemote(remote: string): string {
  return remote
    .trim()
    .replace(/^git@([^:]+):/i, "https://$1/")
    .replace(/^ssh:\/\/git@/i, "https://")
    .replace(/\.git\/?$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Stable across machines when a Git remote exists, but never uploads the
 * remote URL itself. Repositories without a remote fall back to a local path
 * fingerprint and can still be managed independently.
 */
export function repositoryIdentity(input = process.cwd()): RepositoryIdentity {
  const path = resolveProjectPath(input);
  const remote = gitRemote(path);
  const fingerprint = remote
    ? `remote:${normalizeRemote(remote)}`
    : `local:${resolve(path).toLowerCase()}`;

  return {
    path,
    name: basename(path),
    key: createHash("sha256").update(fingerprint).digest("hex"),
  };
}
