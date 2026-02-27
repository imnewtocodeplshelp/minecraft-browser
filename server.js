const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const WORLD_FILE   = path.join(__dirname, 'world.json');
const PLAYERS_FILE = path.join(__dirname, 'players.json');

app.use(express.json());
app.use(express.static(__dirname)); // serve index.html + assets

// ── File helpers ────────────────────────────────────────────
function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) {}
  return fallback;
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── In-memory state (loaded from disk on startup) ───────────
let blocks  = loadJSON(WORLD_FILE,   { blocks: [] }).blocks  || [];
let players = loadJSON(PLAYERS_FILE, { players: [] }).players || [];

function saveToDisk() {
  saveJSON(WORLD_FILE,   { blocks });
  saveJSON(PLAYERS_FILE, { players });
}

// Prune players inactive > 4 seconds
function prunePlayers() {
  const now = Date.now();
  players = players.filter(p => (now - (p.t || 0)) < 4000);
}

// ── Routes ───────────────────────────────────────────────────

// GET /api?action=get_blocks
// GET /api?action=get_players&myid=xxx
app.get('/api', (req, res) => {
  const action = req.query.action;

  if (action === 'get_blocks') {
    return res.json({ ok: 1, blocks });
  }

  if (action === 'get_players') {
    prunePlayers();
    const myId  = req.query.myid || '';
    const others = players
      .filter(p => p.id !== myId)
      .map(({ id, name, x, y, z, yaw, color }) => ({ id, name, x, y, z, yaw, color }));
    return res.json({ ok: 1, players: others });
  }

  res.json({ ok: 0, error: 'unknown action' });
});

// POST /api?action=...
app.post('/api', (req, res) => {
  const action = req.query.action;
  const body   = req.body || {};

  // ── blocks ──────────────────────────────────────────────
  if (action === 'set_block') {
    const { x, y, z, id } = body;
    if (x == null || y == null || z == null || id == null)
      return res.json({ ok: 0, error: 'missing params' });

    const existing = blocks.find(b => b.x === x && b.y === y && b.z === z);
    if (existing) existing.id = id;
    else blocks.push({ x, y, z, id });

    saveToDisk();
    return res.json({ ok: 1 });
  }

  if (action === 'block_remove') {
    const { x, y, z } = body;
    if (x == null || y == null || z == null)
      return res.json({ ok: 0, error: 'missing params' });

    blocks = blocks.filter(b => !(b.x === x && b.y === y && b.z === z));
    saveToDisk();
    return res.json({ ok: 1 });
  }

  // ── players ─────────────────────────────────────────────
  if (action === 'update_player') {
    const { id, name, x, y, z, yaw, color } = body;
    if (!id) return res.json({ ok: 0, error: 'missing id' });

    prunePlayers();
    const existing = players.find(p => p.id === id);
    if (existing) {
      Object.assign(existing, { name, x, y, z, yaw, color, t: Date.now() });
    } else {
      players.push({ id, name, x, y, z, yaw, color, t: Date.now() });
    }
    return res.json({ ok: 1 });
  }

  if (action === 'leave_player') {
    const { id } = body;
    if (id) players = players.filter(p => p.id !== id);
    return res.json({ ok: 1 });
  }

  res.json({ ok: 0, error: 'unknown action' });
});

app.listen(PORT, () => console.log(`MiniCraft server running on port ${PORT}`));
