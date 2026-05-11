#!/usr/bin/env node
/**
 * pick-images.mjs — Pick N random images from a folder, tracking history to
 * avoid re-sending within the cooldown window.
 *
 * Usage:
 *   node pick-images.mjs
 *   node pick-images.mjs --dir /path/to/folder   # override pictures dir
 *   node pick-images.mjs --count 5               # pick more images
 *   node pick-images.mjs --cooldown 60           # cooldown in days
 *
 * Returns JSON:
 * {
 *   "ok": true,
 *   "images": ["/abs/path/a.jpg", "/abs/path/b.jpg", "/abs/path/c.jpg"],
 *   "total": 120,
 *   "eligible": 87
 * }
 *
 * On error:
 * { "ok": false, "error": "No images found", "images": [] }
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const PICTURES_DIR = getArg('--dir')
  ?? process.env.PICTURES_DIR
  ?? path.join(process.env.HOME, 'Pictures');

const PICK_COUNT   = parseInt(getArg('--count')    ?? '3',  10);
const COOLDOWN_ARG = parseInt(getArg('--cooldown') ?? '0',  10);

// ── Paths ────────────────────────────────────────────────────────────────────

const SKILL_DIR    = path.join(process.env.HOME, '.openclaw/workspace/skills/morning-pics');
const HISTORY_FILE = path.join(SKILL_DIR, 'history.json');
// Staging dir is inside workspace so openclaw message send --media can read it
const STAGING_DIR  = path.join(SKILL_DIR, 'staging');
const DEFAULT_COOLDOWN_DAYS = 30;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);

// ── History ──────────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return { version: 1, cooldownDays: DEFAULT_COOLDOWN_DAYS, sent: [] };
  }
}

function saveHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ── Image discovery ───────────────────────────────────────────────────────────

function findImages(dir) {
  const results = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...findImages(fullPath));
      } else if (IMAGE_EXTS.has(path.extname(item.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // skip unreadable directories
  }
  return results;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const history  = loadHistory();
const cooldownDays = COOLDOWN_ARG > 0 ? COOLDOWN_ARG : (history.cooldownDays ?? DEFAULT_COOLDOWN_DAYS);
const cooldownMs   = cooldownDays * 24 * 60 * 60 * 1000;
const now      = Date.now();

// Expire old entries
history.sent = history.sent.filter(e => now - new Date(e.sentAt).getTime() < cooldownMs);

const cooldownSet = new Set(history.sent.map(e => e.path));
const allImages   = findImages(PICTURES_DIR);

if (allImages.length === 0) {
  console.log(JSON.stringify({ ok: false, error: `No images found in ${PICTURES_DIR}`, images: [] }));
  process.exit(0);
}

const eligible = allImages.filter(p => !cooldownSet.has(p));

// If pool is too small, fall back to full library (effectively reset cooldown)
const pool     = eligible.length >= PICK_COUNT ? eligible : allImages;
shuffle(pool);
const selected = pool.slice(0, PICK_COUNT);

// Stage copies in workspace (openclaw message send only allows workspace/tmp paths)
fs.mkdirSync(STAGING_DIR, { recursive: true });
// Clear previous staging files
for (const f of fs.readdirSync(STAGING_DIR)) {
  fs.rmSync(path.join(STAGING_DIR, f), { force: true });
}
const staged = selected.map((src) => {
  const dest = path.join(STAGING_DIR, path.basename(src));
  fs.copyFileSync(src, dest);
  return dest;
});

// Persist history (record original paths for dedup)
for (const p of selected) {
  history.sent.push({ path: p, sentAt: new Date().toISOString() });
}
history.cooldownDays = cooldownDays;
saveHistory(history);

console.log(JSON.stringify({
  ok: true,
  images: staged,
  total: allImages.length,
  eligible: eligible.length,
}));
