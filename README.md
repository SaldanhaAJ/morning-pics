# morning-pics

[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Platform: OpenClaw](https://img.shields.io/badge/platform-OpenClaw-orange)](https://openclaw.ai)

An [OpenClaw](https://openclaw.ai) skill that sends 3 random photos from your Pictures folder to WhatsApp every morning.

- Tracks sent history — no photo repeats for a configurable cooldown period (default 30 days)
- Scans sub-folders recursively
- Gracefully resets when the eligible pool runs dry

## Requirements

- [OpenClaw](https://openclaw.ai) with a connected WhatsApp account
- Node.js 18+
- A folder of photos

## Install

```bash
git clone https://github.com/saldanhaAJ/morning-pics
cd morning-pics
node setup.mjs
```

The setup script will ask for:

| Prompt | Default | Notes |
|--------|---------|-------|
| Pictures folder | `~/Pictures` | Scanned recursively |
| WhatsApp number | — | E.164 format, e.g. `+19725550123` |
| Send hour | `6` | Local time, 0–23 |
| Timezone | `America/Chicago` | Any [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) |
| Cooldown days | `30` | Days before a photo can be re-sent |

## Test immediately

After install, the setup script prints the job ID. Run:

```bash
openclaw cron run <job-id>
```

You'll get 3 photos on WhatsApp within ~30 seconds.

## Manage

```bash
openclaw cron list                  # see job + next run time
openclaw cron run <id>              # trigger manually
openclaw cron disable <id>          # pause
openclaw cron enable <id>           # resume
openclaw cron rm <id>               # uninstall
```

## How it works

```
[cron @ 6 AM]
    → node scripts/pick-images.mjs
        → scans ~/Pictures for jpg/jpeg/png/webp/gif/heic
        → filters out photos sent within cooldown window
        → picks 3 at random
        → copies them to a workspace staging dir (required by openclaw media allowlist)
        → updates history.json
    → openclaw message send --media <staged-path>  ×3
    → delivery: WhatsApp
```

History is stored at `~/.openclaw/workspace/skills/morning-pics/history.json`.

## Supported image formats

`.jpg` `.jpeg` `.png` `.webp` `.gif` `.heic` `.heif`

## License

MIT © [Alan Saldanha](https://github.com/saldanhaAJ)
