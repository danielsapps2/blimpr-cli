# Blimpr CLI

The public command-line and MCP integration for [Blimpr](https://autoship-five.vercel.app).
It captures meaningful shipped work from Git, Claude Code, Cursor, and Codex,
then queues that context for the founder's review-first content pipeline.

## Install in a repository

```sh
npx --yes github:danielsapps2/blimpr-cli install --github
```

The command resolves the nearest Git repository even when you run it from a
nested package or app directory.

To make the shorter `blimpr` command available globally:

```sh
npm install --global https://github.com/danielsapps2/blimpr-cli/archive/refs/heads/main.tar.gz
blimpr install --github
```

Run the command anywhere inside a Git repository. Blimpr finds the nearest
repository root, installs a post-commit hook, adds agent instructions, and
registers its five-tool MCP server with the coding tools found on the machine.

Then connect the machine to a Blimpr account:

```sh
npx --yes github:danielsapps2/blimpr-cli link ask_your_key_here
```

## Commands

```text
blimpr install [path]   Configure the nearest Git repository
blimpr capture [path]   Capture the latest meaningful commit
blimpr status           Show the local content queue
blimpr link <api-key>   Connect this machine to a Blimpr account
blimpr sync             Sync events and cloud-render only the newest one
blimpr project status   Show whether the current Git repo is active
blimpr project disconnect
                        Stop new videos for the current Git repo
blimpr project connect  Resume new videos for the current Git repo
```

`blimpr mcp` is the stdio entry point used by MCP clients.

## Multiple projects

Blimpr identifies the nearest Git repository, even when you run a command from
a nested package or app. Every repository touched by the hook or MCP server
appears in the dashboard automatically.

Projects start active. Disconnecting one keeps its existing videos and history
but ignores future commits and MCP updates until you reconnect it:

```sh
cd path/to/your-project
blimpr project status
blimpr project disconnect
blimpr project connect
```

There is no local render command. After capture or sync, Blimpr automatically
starts a hosted render for the newest queued event. Older backlog items stay
available in the dashboard so you can choose which ones are worth rendering.

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
