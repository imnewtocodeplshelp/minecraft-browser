const express    = require('express');
const http       = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs         = require('fs');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

const WORLD_FILE = path.join(__dirname, 'world.json');

app.use(express.json());
app.use(express.static(__dirname));

// ── Persistence ─────────────────────────────────────────────
function loadWorld() {
  try {
    if (fs.existsSync(WORLD_FILE))
      return JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8')).blocks || [];
  } catch(e) {}
  return [];
}
function saveWorld() {
  fs.writeFileSync(WORLD_FILE, JSON.stringify({ blocks: [...blocks.values()] }, null, 2));
}

// blocks stored as Map "x,y,z" -> {x,y,z,id}
const blocks = new Map();
for (const b of loadWorld()) blocks.set(`${b.x},${b.y},${b.z}`, b);

// ── REST — only for initial block load ──────────────────────
app.get('/api/blocks', (req, res) => {
  res.json({ ok: 1, blocks: [...blocks.values()] });
});

// ── WebSocket ────────────────────────────────────────────────
// clients: Map  ws -> { id, name, color, x, y, z, yaw }
const clients = new Map();

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN)
      ws.send(msg);
  }
}
function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify(data));
}

wss.on('connection', (ws) => {

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        const { id, name, color, x, y, z, yaw } = msg;
        clients.set(ws, { id, name, color, x: x||0, y: y||5, z: z||0, yaw: yaw||0 });
        // send this player the full list of others
        const others = [...clients.entries()]
          .filter(([w]) => w !== ws)
          .map(([, p]) => p);
        sendTo(ws, { type: 'players_list', players: others });
        // announce to everyone else
        broadcast({ type: 'player_join', player: { id, name, color, x, y, z, yaw } }, ws);
        console.log(`[+] ${name} joined. Online: ${clients.size}`);
        break;
      }

      case 'move': {
        const p = clients.get(ws);
        if (!p) break;
        p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
        broadcast({ type: 'player_move', id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw }, ws);
        break;
      }

      case 'set_block': {
        const { x, y, z, id } = msg;
        blocks.set(`${x},${y},${z}`, { x, y, z, id });
        saveWorld();
        broadcast({ type: 'set_block', x, y, z, id }, ws);
        break;
      }

      case 'block_remove': {
        const { x, y, z } = msg;
        blocks.delete(`${x},${y},${z}`);
        saveWorld();
        broadcast({ type: 'block_remove', x, y, z }, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = clients.get(ws);
    if (p) {
      console.log(`[-] ${p.name} left. Online: ${clients.size - 1}`);
      broadcast({ type: 'player_leave', id: p.id });
      clients.delete(ws);
    }
  });

  ws.on('error', () => ws.terminate());
});

server.listen(PORT, () => console.log(`MiniCraft WS server on port ${PORT}`));
