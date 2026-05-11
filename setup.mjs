#!/usr/bin/env node
/**
 * setup.mjs — Interactive installer for the morning-pics OpenClaw skill.
 *
 * Usage:
 *   node setup.mjs
 *
 * What it does:
 *   1. Copies pick-images.mjs to ~/.openclaw/workspace/skills/morning-pics/scripts/
 *   2. Creates a cron job via `openclaw cron add`
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(res =>
  rl.question(def != null ? `${q} [${def}]: ` : `${q}: `, ans => res(ans.trim() || def))
);

console.log('\n📸  morning-pics — OpenClaw skill setup\n');

// ── Preflight ─────────────────────────────────────────────────────────────────

try {
  execSync('openclaw --version', { stdio: 'ignore' });
} catch {
  console.error('❌  openclaw CLI not found. Install OpenClaw first: https://openclaw.ai');
  process.exit(1);
}

// ── Gather config ─────────────────────────────────────────────────────────────

const defaultPics  = path.join(process.env.HOME, 'Pictures');
const defaultPhone = '';
const defaultHour  = '6';
const defaultTz    = 'America/Chicago';
const defaultCooldown = '30';

const picsDir  = await ask('Pictures folder', defaultPics);
const phone    = await ask('Your WhatsApp number (E.164, e.g. +19725550123)', defaultPhone);
const hour     = await ask('Send hour (0–23, local time)', defaultHour);
const tz       = await ask('Timezone (IANA)', defaultTz);
const cooldown = await ask('Cooldown days (skip re-sending for N days)', defaultCooldown);

rl.close();

if (!phone.startsWith('+')) {
  console.error('\n❌  Phone must be in E.164 format (e.g. +19725550123)');
  process.exit(1);
}

if (!fs.existsSync(picsDir)) {
  console.warn(`\n⚠️   Directory not found: ${picsDir}. Creating it...`);
  fs.mkdirSync(picsDir, { recursive: true });
}

// ── Install script ────────────────────────────────────────────────────────────

const skillDir    = path.join(process.env.HOME, '.openclaw/workspace/skills/morning-pics');
const scriptsDir  = path.join(skillDir, 'scripts');
const historyFile = path.join(skillDir, 'history.json');

fs.mkdirSync(scriptsDir, { recursive: true });

const srcScript = path.join(import.meta.dirname, 'scripts', 'pick-images.mjs');
const dstScript = path.join(scriptsDir, 'pick-images.mjs');
fs.copyFileSync(srcScript, dstScript);
fs.chmodSync(dstScript, 0o755);
console.log(`\n✅  Installed script → ${dstScript}`);

// Seed history with cooldownDays preference
if (!fs.existsSync(historyFile)) {
  fs.writeFileSync(historyFile, JSON.stringify({
    version: 1,
    cooldownDays: parseInt(cooldown, 10),
    sent: [],
  }, null, 2));
}

// ── Register cron job ─────────────────────────────────────────────────────────

const scriptPath   = dstScript;
const picsDirArg   = picsDir !== path.join(process.env.HOME, 'Pictures')
  ? ` --dir "${picsDir}"`
  : '';
const cooldownArg  = cooldown !== '30' ? ` --cooldown ${cooldown}` : '';

const message = [
  `You are the morning-pics agent. Send 3 random photos to WhatsApp.`,
  ``,
  `Step 1 — run:`,
  `node ${scriptPath}${picsDirArg}${cooldownArg}`,
  ``,
  `Step 2 — parse the JSON. If ok is false, stop silently.`,
  ``,
  `Step 3 — for each path in the images array, run:`,
  `openclaw message send --channel whatsapp --target ${phone} --media "<path>"`,
  ``,
  `Do NOT add any message text — send the image alone.`,
  ``,
  `Step 4 — respond with only: 📸 Sent [N] photo(s) for your morning.`,
].join('\n');

const cronExpr = `0 ${hour} * * *`;

const result = spawnSync('openclaw', [
  'cron', 'add',
  '--name', 'Morning Photo Memories',
  '--cron', cronExpr,
  '--tz', tz,
  '--message', message,
  '--announce',
  '--channel', 'whatsapp',
  '--to', phone,
  '--best-effort-deliver',
  '--session', 'isolated',
  '--timeout', '180',
  '--tools', 'exec',
  '--thinking', 'off',
  '--json',
], { encoding: 'utf8' });

if (result.status !== 0) {
  console.error('\n❌  Failed to create cron job:');
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const job = JSON.parse(result.stdout);
console.log(`✅  Cron job created: ${job.id}`);
console.log(`\n🕕  Photos will be sent daily at ${hour}:00 ${tz}`);
console.log(`\nTo test right now:\n   openclaw cron run ${job.id}`);
console.log(`\nTo uninstall:\n   openclaw cron rm ${job.id}`);
