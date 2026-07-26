# Blimpr CLI

The public command-line and MCP integration for [Blimpr](https://autoship-five.vercel.app).
It captures meaningful shipped work from Git, Claude Code, Cursor, and Codex,
then queues that context for the founder's review-first content pipeline.

## Install in a repository

```sh
npx blimpr install
```

Until the first npm release is published, the same CLI can run directly from
GitHub:

```sh
npx github:danielsapps2/blimpr-cli install --github
```

To make the `blimpr` command available globally before the npm release, install
the GitHub archive:

```sh
npm install --global https://github.com/danielsapps2/blimpr-cli/archive/refs/heads/main.tar.gz
blimpr install --github
```

Run the command anywhere inside a Git repository. Blimpr finds the nearest
repository root, installs a post-commit hook, adds agent instructions, and
registers its five-tool MCP server with the coding tools found on the machine.

Then connect the machine to a Blimpr account:

```sh
npx blimpr link ask_your_key_here
```

## Commands

```text
blimpr install [path]   Configure the nearest Git repository
blimpr capture [path]   Capture the latest meaningful commit
blimpr status           Show the local content queue
blimpr link <api-key>   Connect this machine to a Blimpr account
blimpr sync             Sync queued events
```

`blimpr mcp` is the stdio entry point used by MCP clients.

## Privacy

Blimpr captures commit subjects, agent-written summaries, filenames, diff
counts, and screenshots explicitly attached by an agent. It does not upload
source code. Review-before-post is the default.

## Development

```sh
npm install
npm run check
npm pack
```

The published package contains bundled Node.js outputs, so `npx` does not
depend on Blimpr's private application monorepo.
