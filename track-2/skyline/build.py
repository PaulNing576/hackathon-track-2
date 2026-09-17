"""
Build perspective-3D city skyline visualization (San Francisco style).
GPU energy → building height. Efficiency → building color/material.
Real perspective camera, photorealistic sky/bay background.
"""
import csv, json, collections, math, os, random

DATA_DIR = r"C:\Users\jinzh\Downloads\track-2-raw-preview"
OUT_FILE  = os.path.join(os.path.dirname(__file__), "index.html")

# ── 1. GPU metrics per job ────────────────────────────────────────────────────
print("Reading dcgm.csv...")
job_gpu = {}
with open(os.path.join(DATA_DIR, "dcgm.csv"), encoding="utf-8") as f:
    for row in csv.DictReader(f):
        jid = row["id_job"]
        e   = float(row["energyconsumed_joules"] or 0)
        sm  = float(row["smutilization_pct_avg"]  or 0)
        pw  = float(row["powerusage_watts_avg"]   or 0)
        mem = float(row["memoryutilization_pct_avg"] or 0)
        if jid not in job_gpu:
            job_gpu[jid] = dict(e=0,sm_s=0,sm_n=0,pw_s=0,mem_s=0)
        d = job_gpu[jid]
        d["e"]   += e;  d["sm_s"] += sm; d["sm_n"] += 1
        d["pw_s"]+= pw; d["mem_s"]+= mem
print(f"  {len(job_gpu)} jobs")

# ── 2. Scheduler data → per-user aggregation ─────────────────────────────────
print("Reading scheduler_data.csv...")
user_jobs = collections.defaultdict(list)
with open(os.path.join(DATA_DIR, "scheduler_data.csv"), encoding="utf-8") as f:
    for row in csv.DictReader(f):
        jid = row["id_job"]
        if jid not in job_gpu: continue
        g = job_gpu[jid]
        n = g["sm_n"] or 1
        try:
            wait = max(0, int(row["time_start"] or 0) - int(row["time_submit"] or 0))
        except ValueError:
            wait = 0
        user_jobs[row["id_user"]].append(dict(
            e=g["e"], sm=g["sm_s"]/n, pw=g["pw_s"]/n,
            mem=g["mem_s"]/n, wait=wait,
            part=row["partition"] or "unknown"
        ))
print(f"  {len(user_jobs)} users")

teams = []
for uid, jobs in user_jobs.items():
    total_e = sum(j["e"] for j in jobs)
    if total_e == 0: continue
    n  = len(jobs)
    sm = sum(j["sm"]*j["e"] for j in jobs) / total_e  # energy-weighted SM util
    color = "green" if sm >= 60 else ("yellow" if sm >= 25 else "red")
    pc = collections.Counter(j["part"] for j in jobs)
    teams.append(dict(
        uid=uid, n=n,
        e_kj=round(total_e/1000,1),
        sm=round(sm,1),
        pw=round(sum(j["pw"] for j in jobs)/n,1),
        mem=round(sum(j["mem"] for j in jobs)/n,1),
        wait=round(sum(j["wait"] for j in jobs)/n,1),
        save_kj=round(total_e/1000*(1-sm/100),1),
        part=pc.most_common(1)[0][0],
        color=color,
    ))
teams.sort(key=lambda t: -t["e_kj"])
print(f"  {len(teams)} teams  {collections.Counter(t['color'] for t in teams)}")

# ── 3. World layout (perspective-view city grid) ─────────────────────────────
COLS, ROWS = 15, 13      # 195 slots
X_SP  = 1.40             # base X column spacing (world units)
X_AVE = 1.00             # extra gap at avenues (every 5 cols)
Z_SP  = 2.00             # base Z row spacing
Z_AVE = 1.20             # extra gap at cross-streets (every 4 rows)
BW    = 1.05             # building footprint width
BD    = 1.05             # building footprint depth

def col_x(c):            # world X of column c (centered at X=0)
    x = (c - 7) * X_SP
    if c >= 5:  x += X_AVE
    if c >= 10: x += X_AVE
    return round(x, 3)

def row_z(r):            # world Z of row r (row 0 = closest to camera)
    z = r * Z_SP
    if r >= 4: z += Z_AVE
    if r >= 8: z += Z_AVE
    return round(z, 3)

max_e = max(t["e_kj"] for t in teams)

def log_h(e):            # building height from energy (log scale)
    if max_e <= 0 or e <= 0: return 0.4
    return 0.4 + 13.6 * math.log1p(e) / math.log1p(max_e)

buildings = []
for idx, team in enumerate(teams[:COLS * ROWS]):
    col = idx % COLS
    row = idx // COLS
    bx  = col_x(col)
    bz  = row_z(row)
    bh  = round(log_h(team["e_kj"]), 2)

    # architectural style
    if bh > 10:         style = 1  # stepped skyscraper
    elif bh > 7:        style = 3  # crown tower
    elif (idx % 4) == 2:style = 2  # pillar tower
    else:               style = 0  # box building

    rng = random.Random(idx * 0xC0FFEE + 13)
    wr  = max(4, int(bh * 2.0))
    wc  = 3
    wl  = [[rng.random() > 0.20 for _ in range(wc)] for _ in range(wr)]
    wrf = [[rng.random() > 0.20 for _ in range(wc)] for _ in range(wr)]

    buildings.append(dict(
        idx=idx, label=f"Team-{idx+1:03d}",
        bx=bx, bz=bz, bw=BW, bd=BD, bh=bh, style=style,
        color=team["color"],
        e_kj=team["e_kj"], sm=team["sm"], pw=team["pw"],
        mem=team["mem"], wait=team["wait"],
        n=team["n"], save_kj=team["save_kj"],
        part=team["part"], wl=wl, wr=wrf,
    ))

# Sort back-to-front: largest bz (farthest from camera) first
buildings.sort(key=lambda b: -(b["bz"] + BD/2))

world_z_max = row_z(ROWS-1) + BD
world_x_min = col_x(0)
world_x_max = col_x(COLS-1) + BW

meta = dict(
    total=len(teams),
    e_gj=round(sum(t["e_kj"] for t in teams)/1e6, 3),
    save_gj=round(sum(t["save_kj"] for t in teams)/1e6, 3),
    avg_sm=round(sum(t["sm"] for t in teams)/len(teams), 1),
    wx_min=round(world_x_min,2), wx_max=round(world_x_max,2),
    wz_max=round(world_z_max,2),
)

DATA_JSON = json.dumps(dict(meta=meta, b=buildings), ensure_ascii=False)

# ── 4. HTML ───────────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>GPU能耗城市 · SF Skyline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;overflow:hidden;height:100vh;display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif}
#hdr{
  padding:9px 20px;
  background:linear-gradient(to bottom,rgba(2,8,20,0.98),rgba(2,6,16,0.85));
  border-bottom:1px solid rgba(60,110,200,0.3);
  display:flex;align-items:center;gap:20px;flex-shrink:0;
  backdrop-filter:blur(4px);z-index:20;
}
h1{font-size:15px;font-weight:700;color:#90c8ff;letter-spacing:.06em}
.lg{display:flex;gap:12px;font-size:11px;color:#7090b0}
.li{display:flex;align-items:center;gap:5px}
.ld{width:11px;height:11px;border-radius:2px}
.lg-g{background:#70e8a0;box-shadow:0 0 5px #70e8a0}
.lg-y{background:#f5c518;box-shadow:0 0 5px #f5c518}
.lg-r{background:#ff5050;box-shadow:0 0 5px #ff5050}
.st{font-size:11px;color:#6080a0}
.sv{color:#80c0ff;font-weight:700}
#cv-wrap{flex:1;position:relative;overflow:hidden}
canvas{display:block;width:100%;height:100%}
#tip{
  position:absolute;pointer-events:none;
  background:rgba(2,8,22,0.96);
  border:1px solid rgba(40,90,180,0.7);
  border-radius:10px;padding:13px 17px;
  font-size:12px;line-height:1.9;max-width:255px;
  display:none;
  box-shadow:0 8px 40px rgba(0,40,160,0.6),0 0 0 1px rgba(40,90,200,0.15);
  z-index:100;
}
.tn{font-size:14px;font-weight:700;color:#90c8ff;margin-bottom:5px}
.tl{color:#506080}
.tv{color:#c0d8ff;font-weight:600}
.ts{display:inline-block;padding:2px 9px;border-radius:4px;font-size:10px;font-weight:700;margin-top:4px}
.tsg{background:rgba(20,90,45,.85);color:#70e8a0}
.tsy{background:rgba(90,70,0,.85);color:#f5c518}
.tsr{background:rgba(90,18,10,.85);color:#ff6060}
.tsv{color:#ff9944;margin-top:3px;font-size:11px}
</style>
</head>
<body>
<div id="hdr">
  <h1>⚡ GPU 能耗城市天际线</h1>
  <div class="lg">
    <div class="li"><div class="ld lg-g"></div>高效 SM≥60%</div>
    <div class="li"><div class="ld lg-y"></div>中效 SM 25-60%</div>
    <div class="li"><div class="ld lg-r"></div>低效 SM&lt;25%</div>
    <span style="color:#334;margin-left:6px;font-size:10px">高度=GPU总能耗 · 悬停查看详情</span>
  </div>
  <div style="margin-left:auto;display:flex;gap:18px">
    <div class="st">团队 <span class="sv" id="s1">-</span></div>
    <div class="st">总能耗 <span class="sv" id="s2">-</span> GJ</div>
    <div class="st">可节约 <span class="sv" id="s3">-</span> GJ</div>
    <div class="st">均 SM <span class="sv" id="s4">-</span>%</div>
  </div>
</div>
<div id="cv-wrap">
  <canvas id="cv"></canvas>
  <div id="tip"></div>
</div>

<script>
const DATA = """ + DATA_JSON + r""";
const M = DATA.meta, BLDGS = DATA.b;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const tip = document.getElementById('tip');

document.getElementById('s1').textContent = M.total;
document.getElementById('s2').textContent = M.e_gj.toFixed(2);
document.getElementById('s3').textContent = M.save_gj.toFixed(2);
document.getElementById('s4').textContent = M.avg_sm;

// ══════════════════════════════════════════════════════════
//  CAMERA & PROJECTION  (perspective, Y=up, Z=depth)
// ══════════════════════════════════════════════════════════
const CAM = {x:0, y:13, z:-24};
// pitch = angle below horizontal so camera looks at ground
const PITCH = Math.atan2(13, 37);   // ~19.4°
const cosp = Math.cos(PITCH), sinp = Math.sin(PITCH);
const FOCAL = 680;
let W, H, HORIZON_Y;

function proj(wx, wy, wz) {
  const cx = wx - CAM.x;
  const cy = wy - CAM.y;
  const cz = wz - CAM.z;
  // Pitch rotation (tilt camera down)
  const rcy = cy * cosp + cz * sinp;
  const rcz = -cy * sinp + cz * cosp;
  if (rcz < 0.2) return null;
  const s = FOCAL / rcz;
  return { sx: W/2 + cx*s, sy: HORIZON_Y - rcy*s, depth: rcz, s };
}

// Invert proj for mouse hover at ground level (wy=0)
function invProj(sx, sy) {
  // From: sx = W/2 + cx*s, sy = HORIZON_Y - rcy*s
  // where s = FOCAL/rcz, rcy = -cy*sinp + cz*cosp, rcz = cy*sinp + cz*cosp
  // At wy=0: cy = -CAM.y = -13
  // rcy = -13*cosp + cz*sinp
  // rcz = 13*sinp + cz*cosp
  // sy = HORIZON_Y - (-13*cosp + cz*sinp) * FOCAL / (13*sinp + cz*cosp)
  // solve for cz numerically:
  // Approximate: trace ray
  // sx - W/2 = cx * FOCAL / rcz  → cx = (sx-W/2)*rcz/FOCAL
  // World X = cx + CAM.x
  // For Y=0 plane: use parametric ray from camera

  // Simpler: linear search / binary search for cz
  let lo=0.1, hi=200;
  for(let i=0;i<50;i++){
    const cz=(lo+hi)/2;
    const cy=-CAM.y;
    const rcy=cy*cosp+cz*sinp;
    const rcz=-cy*sinp+cz*cosp;
    if(rcz<0.1){lo=cz;continue;}
    const sy_test=HORIZON_Y-rcy*FOCAL/rcz;
    if(sy_test>sy) hi=cz; else lo=cz;
  }
  const czf=(lo+hi)/2;
  const cy0=-CAM.y;
  const rcz0=-cy0*sinp+czf*cosp;
  const wx=(sx-W/2)*rcz0/FOCAL + CAM.x;
  const wz=czf+CAM.z;
  return {wx,wz};
}

// ══════════════════════════════════════════════════════════
//  COLOR THEMES  (realistic architecture + efficiency tint)
// ══════════════════════════════════════════════════════════
const C = {
  // Efficient: steel-blue glass, eco-green tint
  green:{
    front:'#2a6878', right:'#3d9068', left:'#174050',
    top:'#55c085',   win:'rgba(140,255,190,0.82)',
    glow:'rgba(60,200,120,0.14)', badge:'#70e8a0',
    fog:'#4a90b0',
  },
  // Moderate: warm concrete, amber tint
  yellow:{
    front:'#7a6640', right:'#b88c30', left:'#4a3c18',
    top:'#a07840',   win:'rgba(255,215,80,0.82)',
    glow:'rgba(200,160,40,0.12)', badge:'#f5c518',
    fog:'#906a30',
  },
  // Wasteful: old brick, red warning
  red:{
    front:'#703028', right:'#9a4022', left:'#421610',
    top:'#6a2820',   win:'rgba(255,90,50,0.82)',
    glow:'rgba(220,70,40,0.18)', badge:'#ff5050',
    fog:'#803020',
  }
};

// ══════════════════════════════════════════════════════════
//  PRIMITIVES
// ══════════════════════════════════════════════════════════
function poly(pts, fill, stroke) {
  if(!pts.every(Boolean)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=0.5; ctx.stroke(); }
}

function fogBlend(hex, fog, f) {
  // Blend color toward fog color based on depth factor f [0,1]
  const parse = h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const frgb = parse(fog), crgb = parse(hex);
  const r=Math.round(crgb[0]*(1-f)+frgb[0]*f);
  const g=Math.round(crgb[1]*(1-f)+frgb[1]*f);
  const b=Math.round(crgb[2]*(1-f)+frgb[2]*f);
  return `rgb(${r},${g},${b})`;
}

function fogAlpha(baseColor, fogColor, f) {
  // Returns rgba string blended with fog
  const parse = h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const fc = parse(fogColor), bc = parse(baseColor);
  return `rgb(${Math.round(bc[0]*(1-f)+fc[0]*f)},${Math.round(bc[1]*(1-f)+fc[1]*f)},${Math.round(bc[2]*(1-f)+fc[2]*f)})`;
}

// Atmospheric fog factor based on camera depth
const MAX_DEPTH = 55;
function fogFactor(depth) { return Math.min(0.78, depth / MAX_DEPTH * 0.8); }

// ══════════════════════════════════════════════════════════
//  BACKGROUND SCENE  (San Francisco inspired)
// ══════════════════════════════════════════════════════════
function drawBackground() {
  // ── Sky: golden hour gradient ─────────────────────────
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  skyGrad.addColorStop(0,   '#0d1e3a');   // deep blue zenith
  skyGrad.addColorStop(0.35,'#1a3560');   // mid blue
  skyGrad.addColorStop(0.65,'#3060a0');   // lighter blue
  skyGrad.addColorStop(0.85,'#6090c0');   // horizon haze
  skyGrad.addColorStop(1,   '#c0a060');   // golden horizon glow
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, HORIZON_Y + 20);

  // ── Sun (upper-right) ────────────────────────────────
  const sunX = W * 0.80, sunY = H * 0.12;
  const sunR = ctx.createRadialGradient(sunX,sunY,0, sunX,sunY,100);
  sunR.addColorStop(0,   'rgba(255,250,200,0.95)');
  sunR.addColorStop(0.15,'rgba(255,220,100,0.80)');
  sunR.addColorStop(0.4, 'rgba(255,160,40,0.45)');
  sunR.addColorStop(0.8, 'rgba(255,100,20,0.10)');
  sunR.addColorStop(1,   'transparent');
  ctx.fillStyle = sunR;
  ctx.fillRect(sunX-120, sunY-120, 240, 240);

  // ── Sun disc ─────────────────────────────────────────
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, 22, 0, Math.PI*2);
  const sd = ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,22);
  sd.addColorStop(0,'#fffff0'); sd.addColorStop(0.6,'#ffe880'); sd.addColorStop(1,'rgba(255,200,60,0)');
  ctx.fillStyle=sd; ctx.fill();
  ctx.restore();

  // ── Horizon haze band ────────────────────────────────
  const hazeGrad = ctx.createLinearGradient(0, HORIZON_Y-60, 0, HORIZON_Y+40);
  hazeGrad.addColorStop(0,'rgba(150,200,240,0)');
  hazeGrad.addColorStop(0.5,'rgba(200,180,140,0.18)');
  hazeGrad.addColorStop(1,'rgba(180,150,100,0.30)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, HORIZON_Y-60, W, 100);

  // ── Distant hills of Marin ────────────────────────────
  drawHills();

  // ── Bay water ────────────────────────────────────────
  drawBay();

  // ── Fog overlay (left side, typical SF) ──────────────
  const fogGrad = ctx.createLinearGradient(0, 0, W*0.35, 0);
  fogGrad.addColorStop(0,'rgba(180,200,230,0.22)');
  fogGrad.addColorStop(0.5,'rgba(180,200,230,0.08)');
  fogGrad.addColorStop(1,'transparent');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, W, H);
}

function drawHills() {
  // Marin headlands silhouette (left-center background)
  ctx.save();
  ctx.fillStyle = '#2a4060';
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y+5);
  // bezier hill shapes
  const hy = HORIZON_Y;
  ctx.bezierCurveTo(W*.05, hy-45, W*.12, hy-80, W*.18, hy-55);
  ctx.bezierCurveTo(W*.22, hy-40, W*.26, hy-90, W*.32, hy-65);
  ctx.bezierCurveTo(W*.36, hy-50, W*.40, hy-70, W*.46, hy-45);
  ctx.bezierCurveTo(W*.50, hy-30, W*.55, hy-35, W*.60, hy-20);
  ctx.lineTo(W, HORIZON_Y+5);
  ctx.lineTo(0, HORIZON_Y+5);
  ctx.closePath();
  ctx.fill();

  // Lighter hill band (atmospheric)
  ctx.fillStyle = 'rgba(80,110,150,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y+5);
  ctx.bezierCurveTo(W*.08, hy-20, W*.15, hy-40, W*.25, hy-30);
  ctx.bezierCurveTo(W*.35, hy-20, W*.45, hy-28, W*.60, hy-12);
  ctx.lineTo(W, HORIZON_Y+5); ctx.lineTo(0, HORIZON_Y+5);
  ctx.closePath(); ctx.fill();

  // Golden Gate Bridge (stylized silhouette, far left)
  drawGoldenGate(W*0.08, HORIZON_Y - 20);

  ctx.restore();
}

function drawGoldenGate(cx, baseY) {
  ctx.save();
  ctx.strokeStyle = '#c06020';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55;

  // Main towers
  const tw = 6, th = 55;
  const x1 = cx - 40, x2 = cx + 40;
  ctx.fillStyle = '#b05020';
  ctx.fillRect(x1-tw/2, baseY-th, tw, th);
  ctx.fillRect(x2-tw/2, baseY-th, tw, th);

  // Cable (catenary approximation)
  ctx.beginPath();
  ctx.moveTo(x1-tw/2-30, baseY-th*0.45);
  ctx.bezierCurveTo(x1, baseY+5, x2, baseY+5, x2+tw/2+30, baseY-th*0.45);
  ctx.stroke();

  // Deck
  ctx.lineWidth=4;
  ctx.beginPath();
  ctx.moveTo(x1-tw/2-35, baseY-5);
  ctx.lineTo(x2+tw/2+35, baseY-5);
  ctx.stroke();

  // Vertical hangers
  ctx.lineWidth=1; ctx.globalAlpha=0.35;
  for(let hx=x1-28; hx<=x2+28; hx+=8){
    ctx.beginPath();
    ctx.moveTo(hx, baseY-5);
    const t=(hx-x1)/(x2-x1);
    const caY=baseY+5 - (t*(1-t)*4*35);
    ctx.lineTo(hx, caY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBay() {
  // Bay: water between ground level and bottom of screen
  const waterTop = HORIZON_Y + 2;
  const waterBot = H;

  const wg = ctx.createLinearGradient(0, waterTop, 0, waterBot);
  wg.addColorStop(0,   '#1a3050');
  wg.addColorStop(0.3, '#0e2038');
  wg.addColorStop(0.7, '#08162a');
  wg.addColorStop(1,   '#060f1e');
  ctx.fillStyle = wg; ctx.fillRect(0, waterTop, W, waterBot-waterTop);

  // Golden sun reflection strip
  const refGrad = ctx.createLinearGradient(W*0.45, 0, W, 0);
  refGrad.addColorStop(0,'transparent');
  refGrad.addColorStop(0.5,'rgba(200,150,50,0.18)');
  refGrad.addColorStop(0.8,'rgba(255,200,80,0.35)');
  refGrad.addColorStop(1,'rgba(200,140,40,0.15)');
  ctx.fillStyle=refGrad;
  ctx.fillRect(0, waterTop, W, waterBot-waterTop);

  // Subtle wave shimmer
  ctx.save(); ctx.globalAlpha=0.08;
  for(let i=0;i<12;i++){
    const wy=waterTop + (waterBot-waterTop)*(i/12)**1.5;
    const waveGrad=ctx.createLinearGradient(0,wy,0,wy+2);
    waveGrad.addColorStop(0,'rgba(100,160,220,0.6)');
    waveGrad.addColorStop(1,'transparent');
    ctx.fillStyle=waveGrad; ctx.fillRect(0,wy,W,3);
  }
  ctx.restore();

  // Embarcadero ground/pier (foreground strip)
  const pgr = ctx.createLinearGradient(0,waterTop-4,0,waterTop+12);
  pgr.addColorStop(0,'#1a2a40'); pgr.addColorStop(1,'#0a1422');
  ctx.fillStyle=pgr; ctx.fillRect(0,waterTop-4,W,16);
}

// ══════════════════════════════════════════════════════════
//  GROUND PLANE  (city streets & pavement)
// ══════════════════════════════════════════════════════════
function drawGround() {
  // Pavement from close edge to horizon
  const front = proj(0, 0, M.wz_max + 2);  // far edge
  if(!front) return;

  const gY0 = front.sy;  // top of ground (near horizon)
  const gY1 = H*0.95;    // bottom (close foreground)

  const gg = ctx.createLinearGradient(0, gY0, 0, gY1);
  gg.addColorStop(0,   '#101820');
  gg.addColorStop(0.4, '#141e2c');
  gg.addColorStop(1,   '#1a2435');
  ctx.fillStyle=gg; ctx.fillRect(0, gY0, W, gY1-gY0);

  // Perspective street grid lines
  drawStreetGrid();
}

function drawStreetGrid() {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#3a5070';
  ctx.lineWidth = 1;

  // Longitudinal (Z-direction) lines along avenues
  const avXs = [M.wx_min - 0.5];
  for(let c=0;c<=15;c++) {
    const x = (c-7)*1.40 + (c>=5?1.0:0) + (c>=10?1.0:0);
    avXs.push(x);
  }
  avXs.push(M.wx_max + 0.5);
  avXs.forEach(wx => {
    const near = proj(wx, 0, -1);
    const farP = proj(wx, 0, M.wz_max+3);
    if(near && farP){
      ctx.beginPath(); ctx.moveTo(near.sx,near.sy); ctx.lineTo(farP.sx,farP.sy); ctx.stroke();
    }
  });

  // Lateral (X-direction) lines at each building row
  for(let r=0;r<=13;r++){
    const z = r*2.0 + (r>=4?1.2:0) + (r>=8?1.2:0);
    const L=proj(M.wx_min-0.5, 0, z);
    const R=proj(M.wx_max+0.5, 0, z);
    if(L&&R){ ctx.beginPath(); ctx.moveTo(L.sx,L.sy); ctx.lineTo(R.sx,R.sy); ctx.stroke(); }
  }
  ctx.restore();

  // Center avenue marking (dashes)
  ctx.save(); ctx.globalAlpha=0.3; ctx.strokeStyle='#c8a020';
  ctx.lineWidth=1.5; ctx.setLineDash([6,14]);
  const cl=proj(0,0,-0.5), cf=proj(0,0,M.wz_max+2);
  if(cl&&cf){ ctx.beginPath(); ctx.moveTo(cl.sx,cl.sy); ctx.lineTo(cf.sx,cf.sy); ctx.stroke(); }
  ctx.setLineDash([]); ctx.restore();
}

// ══════════════════════════════════════════════════════════
//  BUILDING RENDERER
// ══════════════════════════════════════════════════════════
// Depth fog color (golden-hour sky color)
const FOG_HEX = '#7090b0';

function faceColor(hexColor, depth) {
  const f = fogFactor(depth);
  return fogAlpha(hexColor, FOG_HEX, f);
}

function drawFace(pts, color, edgeColor) {
  if(!pts.every(Boolean)) return;
  poly(pts, color, edgeColor);
}

function drawWindowsOnFace(wx0,wx1, wy0,wy1, fz, nwx,nwy, pattern, winColor, depth) {
  const wAlpha = Math.max(0.1, 1 - fogFactor(depth)*1.2);
  const dw = (wx1-wx0)/nwx, dh = (wy1-wy0)/nwy;
  const PAD = 0.13;
  for(let ry=0;ry<nwy;ry++) for(let rx=0;rx<nwx;rx++){
    if(!pattern[ry]||!pattern[ry][rx]) continue;
    const x0=wx0+rx*dw+dw*PAD, x1=wx0+(rx+1)*dw-dw*PAD;
    const y0=wy0+ry*dh+dh*PAD, y1=wy0+(ry+1)*dh-dh*PAD;
    // y is building height (Y axis up); wy0=bh (top row), wy1=0 (ground)
    const pts=[
      proj(x0, y1, fz), proj(x1, y1, fz),
      proj(x1, y0, fz), proj(x0, y0, fz)
    ];
    if(!pts.every(Boolean)) continue;
    ctx.save(); ctx.globalAlpha=wAlpha;
    poly(pts, winColor);
    ctx.restore();
  }
}

function drawWindowsSideFace(fx, wy0,wy1, fz0,fz1, nwz,nwy, pattern, winColor, depth) {
  const wAlpha = Math.max(0.1, 1-fogFactor(depth)*1.4);
  const dz=(fz1-fz0)/nwz, dh=(wy1-wy0)/nwy;
  const PAD=0.13;
  for(let ry=0;ry<nwy;ry++) for(let rz=0;rz<nwz;rz++){
    if(!pattern[ry]||!pattern[ry][rz%pattern[0].length]) continue;
    const z0=fz0+rz*dz+dz*PAD, z1=fz0+(rz+1)*dz-dz*PAD;
    const y0=wy0+ry*dh+dh*PAD, y1=wy0+(ry+1)*dh-dh*PAD;
    const pts=[
      proj(fx,y1,z0), proj(fx,y1,z1),
      proj(fx,y0,z1), proj(fx,y0,z0)
    ];
    if(!pts.every(Boolean)) continue;
    ctx.save(); ctx.globalAlpha=wAlpha; poly(pts,winColor); ctx.restore();
  }
}

function buildingBox(bx,bz, bw,bd,bh, z0,z1, col, depth, wl,wr) {
  const edge = 'rgba(0,0,0,0.3)';
  const ff = faceColor.bind(null);

  // Front face (z=bz, facing camera)
  const frontPts=[
    proj(bx,0,bz), proj(bx+bw,0,bz),
    proj(bx+bw,bh,bz), proj(bx,bh,bz)
  ];
  drawFace(frontPts, ff(col.front,depth), edge);

  // Front face glass gradient overlay
  if(frontPts.every(Boolean)){
    const minX=Math.min(...frontPts.map(p=>p.sx));
    const maxX=Math.max(...frontPts.map(p=>p.sx));
    const glassGrad=ctx.createLinearGradient(minX,0,maxX,0);
    glassGrad.addColorStop(0,'rgba(255,255,255,0.0)');
    glassGrad.addColorStop(0.3,'rgba(255,255,255,0.06)');
    glassGrad.addColorStop(0.7,'rgba(255,255,255,0.04)');
    glassGrad.addColorStop(1,'rgba(0,0,0,0.08)');
    poly(frontPts, glassGrad);
  }

  // Side face (left or right depending on camera position)
  if(bx + bw/2 > CAM.x) {
    // Building is to camera's right → show left face (x=bx)
    const sidePts=[
      proj(bx,0,bz), proj(bx,0,bz+bd),
      proj(bx,bh,bz+bd), proj(bx,bh,bz)
    ];
    drawFace(sidePts, ff(col.left, depth+bd*0.3), edge);
    drawWindowsSideFace(bx, 0,bh, bz,bz+bd, 2,wl.length, wl, col.win, depth+bd*0.2);
  } else if(bx + bw/2 < CAM.x) {
    // Building is to camera's left → show right face (x=bx+bw)
    const sidePts=[
      proj(bx+bw,0,bz), proj(bx+bw,0,bz+bd),
      proj(bx+bw,bh,bz+bd), proj(bx+bw,bh,bz)
    ];
    drawFace(sidePts, ff(col.right, depth+bd*0.3), edge);
    drawWindowsSideFace(bx+bw, 0,bh, bz,bz+bd, 2,wr.length, wr, col.win, depth+bd*0.2);
  }

  // Top face
  const topPts=[
    proj(bx,bh,bz), proj(bx+bw,bh,bz),
    proj(bx+bw,bh,bz+bd), proj(bx,bh,bz+bd)
  ];
  drawFace(topPts, ff(col.top, depth), edge);

  // Front face windows
  drawWindowsOnFace(bx,bx+bw, 0,bh, bz, wl[0]?.length||3, wl.length, wl, col.win, depth);
}

function drawAntenna(bx,bz, bw,bd, topH, col, depth) {
  const ax=bx+bw/2, az=bz+bd/2;
  const base=proj(ax,topH,az), tip=proj(ax,topH+1.6,az);
  if(!base||!tip) return;
  ctx.save();
  ctx.strokeStyle=col.top; ctx.lineWidth=1.5;
  ctx.globalAlpha=Math.max(0.2, 0.8-fogFactor(depth));
  ctx.beginPath(); ctx.moveTo(base.sx,base.sy); ctx.lineTo(tip.sx,tip.sy); ctx.stroke();
  ctx.beginPath(); ctx.arc(tip.sx,tip.sy,2.5,0,Math.PI*2);
  ctx.fillStyle=col.top; ctx.fill();
  ctx.restore();
}

function drawBuilding(b) {
  const col = C[b.color];
  const {bx, bz, bw, bd, bh, style, wl, wr} = b;

  // Camera depth for painter's algorithm & fog
  const midZ = bz + bd/2;
  const cz = midZ - CAM.z;
  const cy_mid = bh/2 - CAM.y;
  const depth = -cy_mid*sinp + cz*cosp;

  const edge='rgba(0,0,0,0.25)';

  if(style === 1) {
    // Stepped skyscraper — 3 tiers
    const tiers=[
      {f:1.0, h:bh*0.45},
      {f:0.78, h:bh*0.32},
      {f:0.58, h:bh*0.23}
    ];
    let z=0;
    tiers.forEach((t,i) => {
      const ox=(1-t.f)*bw*0.5, oz=(1-t.f)*bd*0.5;
      const tw=bw*t.f, td=bd*t.f, th=t.h;
      const wlSub=wl.slice(Math.floor(wl.length*(1-t.f)*0.6));
      const wrSub=wr.slice(Math.floor(wr.length*(1-t.f)*0.6));
      buildingBox(bx+ox, bz+oz, tw,td,th, z,z+th, col, depth, wlSub,wrSub);
      z+=th;
    });
    drawAntenna(bx+bw*.21, bz+bd*.21, bw*.58, bd*.58, bh, col, depth);

  } else if(style === 2) {
    // Pillar: wide base + narrow tower
    const ph=bh*0.18, tw=bw*0.55, td=bd*0.55;
    const tax=(bw-tw)*0.5, taz=(bd-td)*0.5;
    buildingBox(bx,bz, bw,bd,ph, 0,ph, col, depth, wl.slice(0,2), wr.slice(0,2));
    buildingBox(bx+tax,bz+taz, tw,td,bh-ph, ph,bh, col, depth,
      wl.slice(2), wr.slice(2));
    drawAntenna(bx+tax,bz+taz, tw,td, bh, col, depth);

  } else if(style === 3) {
    // Crown tower: box + setback crown
    const mh=bh*0.78, cH=bh*0.22;
    const cw=bw*1.06, cd=bd*1.06;
    const cox=-(cw-bw)*0.5, coz=-(cd-bd)*0.5;
    buildingBox(bx,bz, bw,bd,mh, 0,mh, col, depth, wl, wr);
    buildingBox(bx+cox, bz+coz, cw,cd,cH, mh,bh,
      {...col, top: lighten(col.top,0.12)}, depth, [], []);
    if(bh>5) drawAntenna(bx+bw*0.3, bz+bd*0.3, bw*0.4, bd*0.4, bh, col, depth);

  } else {
    // Box building
    buildingBox(bx,bz, bw,bd,bh, 0,bh, col, depth, wl, wr);
    if(bh>8) drawAntenna(bx,bz, bw,bd, bh, col, depth);
  }
}

function lighten(hex, amt) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b_=parseInt(hex.slice(5,7),16);
  return '#'+[r,g,b_].map(v=>Math.min(255,Math.round(v+255*amt)).toString(16).padStart(2,'0')).join('');
}

// ══════════════════════════════════════════════════════════
//  DEPTH FOG OVERLAY
// ══════════════════════════════════════════════════════════
function drawFogOverlay() {
  // Atmospheric haze above buildings (distance)
  const fogTop = HORIZON_Y - 20;
  const fogBot = HORIZON_Y + 60;
  const fg = ctx.createLinearGradient(0, fogTop, 0, fogBot);
  fg.addColorStop(0,'rgba(100,150,210,0.0)');
  fg.addColorStop(0.5,'rgba(120,160,220,0.12)');
  fg.addColorStop(1,'rgba(100,140,200,0.0)');
  ctx.fillStyle=fg; ctx.fillRect(0, fogTop, W, fogBot-fogTop);
}

// ══════════════════════════════════════════════════════════
//  MAIN RENDER
// ══════════════════════════════════════════════════════════
function render() {
  ctx.clearRect(0,0,W,H);
  drawBackground();
  drawGround();
  BLDGS.forEach(drawBuilding);
  drawFogOverlay();
}

// ══════════════════════════════════════════════════════════
//  HOVER DETECTION
// ══════════════════════════════════════════════════════════
function fmtN(n){
  if(n>=1e6) return (n/1e6).toFixed(1)+'M';
  if(n>=1e3) return (n/1e3).toFixed(1)+'k';
  return (+n).toFixed(0);
}

let hovIdx=-1;
cv.addEventListener('mousemove', e=>{
  const r=cv.getBoundingClientRect();
  const mx=(e.clientX-r.left)*(W/r.width);
  const my=(e.clientY-r.top)*(H/r.height);

  // Invert projection to find world X,Z at ground (Y=0)
  const {wx,wz} = invProj(mx, my);

  // Check buildings front-to-back (smallest bz first, i.e. closest)
  let found=-1;
  // BLDGS sorted back-to-front, so iterate in reverse for front-first hover
  for(let i=BLDGS.length-1;i>=0;i--){
    const b=BLDGS[i];
    if(wx>=b.bx && wx<=b.bx+b.bw && wz>=b.bz && wz<=b.bz+b.bd){
      found=i; break;
    }
  }

  if(found!==hovIdx){
    hovIdx=found;
    if(found<0){tip.style.display='none';return;}
  }
  if(found<0) return;

  const b=BLDGS[found];
  const col=C[b.color];
  const sCls={green:'tsg',yellow:'tsy',red:'tsr'}[b.color];
  const sLabel={green:'高效 Efficient',yellow:'中效 Moderate',red:'低效 Wasteful'}[b.color];
  const saveP=b.e_kj>0?((b.save_kj/b.e_kj)*100).toFixed(0):0;

  tip.innerHTML=`
    <div class="tn">${b.label}</div>
    <div><span class="tl">分区 </span><span class="tv">${b.part}</span></div>
    <div><span class="tl">GPU 总能耗 </span><span class="tv">${fmtN(b.e_kj)} kJ</span></div>
    <div><span class="tl">平均功耗 </span><span class="tv">${b.pw} W</span></div>
    <div><span class="tl">SM 利用率 </span><span class="tv">${b.sm}%</span></div>
    <div><span class="tl">显存利用率 </span><span class="tv">${b.mem}%</span></div>
    <div><span class="tl">作业数量 </span><span class="tv">${b.n}</span></div>
    <div><span class="tl">平均等待 </span><span class="tv">${b.wait}s</span></div>
    <div><span class="ts ${sCls}">${sLabel}</span></div>
    ${b.color!=='green'?`<div class="tsv">⚡ 可节约 ${fmtN(b.save_kj)} kJ (${saveP}%)</div>`:''}
  `;

  const tw=255, th=215;
  let tx=mx+16, ty=my-10;
  if(tx+tw>W) tx=mx-tw-12;
  if(ty+th>H) ty=H-th-8;
  if(ty<0) ty=4;
  tip.style.left=tx+'px'; tip.style.top=ty+'px'; tip.style.display='block';
});
cv.addEventListener('mouseleave',()=>{tip.style.display='none';hovIdx=-1;});

// ══════════════════════════════════════════════════════════
//  RESIZE
// ══════════════════════════════════════════════════════════
function resize(){
  const wrap=cv.parentElement;
  W=wrap.clientWidth; H=wrap.clientHeight;
  HORIZON_Y = H*0.41;
  const dpr=devicePixelRatio||1;
  cv.width=W*dpr; cv.height=H*dpr;
  cv.style.width=W+'px'; cv.style.height=H+'px';
  ctx.scale(dpr,dpr);
  render();
}
window.addEventListener('resize',resize);
resize();
</script>
</body>
</html>
"""

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(HTML)
print(f"Built → {OUT_FILE}")
