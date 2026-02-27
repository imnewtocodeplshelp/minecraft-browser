<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$worldFile   = __DIR__ . '/world.json';
$playersFile = __DIR__ . '/players.json';

/* ── load world blocks ── */
$blocks = [];
if (file_exists($worldFile)) {
    $d = json_decode(file_get_contents($worldFile), true);
    if (isset($d['blocks']) && is_array($d['blocks'])) $blocks = $d['blocks'];
}

/* ── load players ── */
function loadPlayers($file) {
    if (!file_exists($file)) return [];
    $d = json_decode(file_get_contents($file), true);
    return (isset($d['players']) && is_array($d['players'])) ? $d['players'] : [];
}
function savePlayers($players, $file) {
    file_put_contents($file, json_encode(['players' => array_values($players)], JSON_PRETTY_PRINT), LOCK_EX);
}
function saveWorld($blocks, $file) {
    file_put_contents($file, json_encode(['blocks' => $blocks], JSON_PRETTY_PRINT), LOCK_EX);
}

/* ── remove players inactive > 4 seconds ── */
function prunePlayers($players) {
    $now = microtime(true);
    return array_filter($players, fn($p) => ($now - ($p['t'] ?? 0)) < 4.0);
}

$action = $_REQUEST['action'] ?? null;
if (!$action) { echo json_encode(['ok'=>0,'error'=>'no action']); exit; }

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

/* ════════════════════════════════════════════
   BLOCK ACTIONS
═════════════════════════════════════════════ */
if ($action === 'set_block') {
    $x = isset($input['x']) ? (int)$input['x'] : null;
    $y = isset($input['y']) ? (int)$input['y'] : null;
    $z = isset($input['z']) ? (int)$input['z'] : null;
    $id = isset($input['id']) ? (int)$input['id'] : null;
    if ($x===null||$y===null||$z===null||$id===null) { echo json_encode(['ok'=>0,'error'=>'missing params']); exit; }
    $found = false;
    foreach ($blocks as &$b) {
        if ($b['x']==$x && $b['y']==$y && $b['z']==$z) { $b['id']=$id; $found=true; break; }
    }
    unset($b);
    if (!$found) $blocks[] = ['x'=>$x,'y'=>$y,'z'=>$z,'id'=>$id];
    saveWorld($blocks, $worldFile);
    echo json_encode(['ok'=>1]); exit;

} elseif ($action === 'block_remove') {
    $x = isset($input['x']) ? (int)$input['x'] : null;
    $y = isset($input['y']) ? (int)$input['y'] : null;
    $z = isset($input['z']) ? (int)$input['z'] : null;
    if ($x===null||$y===null||$z===null) { echo json_encode(['ok'=>0,'error'=>'missing params']); exit; }
    $blocks = array_values(array_filter($blocks, fn($b) => !($b['x']==$x && $b['y']==$y && $b['z']==$z)));
    saveWorld($blocks, $worldFile);
    echo json_encode(['ok'=>1]); exit;

} elseif ($action === 'get_blocks') {
    echo json_encode(['ok'=>1,'blocks'=>$blocks]); exit;

/* ════════════════════════════════════════════
   PLAYER ACTIONS
═════════════════════════════════════════════ */
} elseif ($action === 'update_player') {
    $id    = isset($input['id'])    ? substr(preg_replace('/[^a-zA-Z0-9_-]/','',$input['id']),0,32) : null;
    $name  = isset($input['name'])  ? substr(htmlspecialchars($input['name']),0,20) : 'Player';
    $x     = isset($input['x'])     ? (float)$input['x']   : 0;
    $y     = isset($input['y'])     ? (float)$input['y']   : 0;
    $z     = isset($input['z'])     ? (float)$input['z']   : 0;
    $yaw   = isset($input['yaw'])   ? (float)$input['yaw'] : 0;
    $color = isset($input['color']) ? substr(preg_replace('/[^#a-fA-F0-9]/','',$input['color']),0,7) : '#ffffff';

    if (!$id) { echo json_encode(['ok'=>0,'error'=>'missing id']); exit; }

    $players = prunePlayers(loadPlayers($playersFile));

    // find or create
    $found = false;
    foreach ($players as &$p) {
        if ($p['id'] === $id) {
            $p['x']=$x; $p['y']=$y; $p['z']=$z;
            $p['yaw']=$yaw; $p['t']=microtime(true);
            $p['name']=$name; $p['color']=$color;
            $found = true; break;
        }
    }
    unset($p);
    if (!$found) {
        $players[] = ['id'=>$id,'name'=>$name,'x'=>$x,'y'=>$y,'z'=>$z,'yaw'=>$yaw,'color'=>$color,'t'=>microtime(true)];
    }
    savePlayers($players, $playersFile);
    echo json_encode(['ok'=>1]); exit;

} elseif ($action === 'get_players') {
    $myId = $_REQUEST['myid'] ?? '';
    $players = prunePlayers(loadPlayers($playersFile));
    // exclude self
    $others = array_values(array_filter($players, fn($p) => $p['id'] !== $myId));
    // strip internal timestamp before sending
    $out = array_map(fn($p) => ['id'=>$p['id'],'name'=>$p['name'],'x'=>$p['x'],'y'=>$p['y'],'z'=>$p['z'],'yaw'=>$p['yaw'],'color'=>$p['color']], $others);
    echo json_encode(['ok'=>1,'players'=>$out]); exit;

} elseif ($action === 'leave_player') {
    $id = isset($input['id']) ? substr(preg_replace('/[^a-zA-Z0-9_-]/','',$input['id']),0,32) : null;
    if ($id) {
        $players = loadPlayers($playersFile);
        $players = array_values(array_filter($players, fn($p) => $p['id'] !== $id));
        savePlayers($players, $playersFile);
    }
    echo json_encode(['ok'=>1]); exit;

} else {
    echo json_encode(['ok'=>0,'error'=>'unknown action']); exit;
}
