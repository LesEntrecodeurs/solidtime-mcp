# solidtime-mcp

MCP server exposing [SolidTime](https://github.com/solidtime-io/solidtime) time-tracking operations so an LLM can list projects/members, manage timers, and create/update/delete time entries.

The first consumer is a Discord bot that lets the team track time in natural language; any other MCP-compatible client (Claude Desktop, Claude Code, mcpo, etc.) can plug in too.

## Setup

```bash
yarn install
cp .env.example .env       # fill in SOLIDTIME_API_URL, _API_KEY, _ORG_ID
cp users.example.json users.json   # then map your Discord <-> SolidTime users
yarn build
```

## Run (stdio)

```bash
node build/index.js
```

The server logs `SolidTime MCP server running on stdio` on stderr when ready.

## Run as HTTP (via mcpo, see Dockerfile)

```bash
docker build -t solidtime-mcp .
docker run --env-file .env -v "$PWD/users.json:/app/users.json" -p 8000:8000 solidtime-mcp
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `SOLIDTIME_API_URL` | yes | Base URL of the SolidTime instance, e.g. `https://solidtime.lesentrecodeurs.com`. The `/api/v1` suffix is added automatically. |
| `SOLIDTIME_API_KEY` | yes | Personal API token (from the SolidTime user settings). The token's owner must have rights to create entries for the members you want to act on. |
| `SOLIDTIME_ORG_ID` | yes | UUID of the organization the MCP operates on. |
| `USERS_CONFIG_PATH` | no | Path to `users.json`. Defaults to `./users.json`. |

## users.json

Maps Discord IDs to SolidTime member IDs so a bot can resolve "this Discord user wants to start a timer" → "create a time entry for member_id X". See `users.example.json`.

## Tools exposed

- `list_projects`, `list_members`, `list_clients`, `list_tasks`, `list_tags`
- `list_known_users`, `resolve_user` (lookup by `discordId`, `name`, or `memberId`)
- `get_active_timer`, `start_timer`, `stop_timer`
- `list_time_entries`, `create_time_entry`, `update_time_entry`, `delete_time_entry`

`start_timer` automatically stops any timer already running for that member before starting the new one.

All times sent to SolidTime are coerced to UTC `Y-m-d\TH:i:s\Z`.
