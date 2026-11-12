// effects.js – animated weather backdrop drawn on <canvas id="fx">
// Fx.set(kind, isDay, thunder)  kind: clear | partly | cloudy | rain | snow | hail | storm
const Fx = (() => {
  const cv = document.getElementById("fx"), ctx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, kind = "", day = true, thunder = false, running = false;
  let drops = [], clouds = [], stars = [], flash = 0, bolt = null, t = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function drop(init) {
    const x = rnd(-50, W + 50), y = init ? rnd(-H, H) : rnd(-80, -10);
    if (kind === "snow") return { x, y, r: rnd(1.5, 4), vy: rnd(0.6, 1.8), ph: rnd(0, 6.28) };
    if (kind === "hail") return { x, y, r: rnd(2, 4.5), vy: rnd(9, 14), b: 0, floor: H - rnd(0, 30) };
    return { x, y, vy: rnd(14, 22), len: rnd(10, 20) };
  }

  function seed() {
    const scale = Math.min(2.5, Math.max(1, W / 400));
    const base = { rain: 130, storm: 180, hail: 70, snow: 90 }[kind] || 0;
    drops = still ? [] : Array.from({ length: Math.round(base * scale) }, () => drop(true));
    const nc = { partly: 3, cloudy: 6, rain: 6, storm: 7, hail: 7, snow: 5 }[kind] || 0;
    clouds = Array.from({ length: nc }, () => ({ x: rnd(-100, W), y: rnd(10, H * 0.4), s: rnd(0.8, 1.8), v: rnd(0.08, 0.3) }));
    stars = Array.from({ length: 70 }, () => ({ x: rnd(0, W), y: rnd(0, H * 0.6), r: rnd(0.6, 1.8), ph: rnd(0, 6.28) }));
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(); if (still) draw();
  }

  function sun() {
    const x = W * 0.78, y = H * 0.13, a = kind === "partly" ? 0.75 : 1;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 180);
    g.addColorStop(0, `rgba(255,232,150,${0.9 * a})`); g.addColorStop(1, "rgba(255,232,150,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 180, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,236,160,${0.7 * a})`; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const ang = i * (Math.PI * 2 / 14) + t * 0.004, len = 62 + 10 * Math.sin(t * 0.03 + i);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * 48, y + Math.sin(ang) * 48);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
    }
    ctx.fillStyle = "#ffd95e"; ctx.beginPath(); ctx.arc(x, y, 36, 0, 7); ctx.fill();
  }

  function moon() {
    const x = W * 0.78, y = H * 0.12;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 100);
    g.addColorStop(0, "rgba(210,225,255,.4)"); g.addColorStop(1, "rgba(210,225,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 100, 0, 7); ctx.fill();
    ctx.fillStyle = "#f1f4ff"; ctx.beginPath(); ctx.arc(x, y, 28, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(170,182,212,.5)";
    [[-9, -6, 6], [8, 5, 5], [-3, 12, 3.5]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); });
  }

  function cloud(c) {
    const dark = ["rain", "storm", "hail"].includes(kind);
    ctx.fillStyle = dark ? "rgba(38,46,60,.55)" : kind === "snow" ? "rgba(235,240,246,.5)" : day ? "rgba(255,255,255,.5)" : "rgba(190,200,225,.28)";
    ctx.beginPath();
    [[0, 0, 30], [28, -12, 26], [58, 0, 30], [28, 8, 28], [-20, 10, 20], [78, 10, 20]].forEach(([dx, dy, r]) => {
      ctx.moveTo(c.x + (dx + r) * c.s, c.y + dy * c.s);
      ctx.arc(c.x + dx * c.s, c.y + dy * c.s, r * c.s, 0, 7);
    });
    ctx.fill();
    if (!still) { c.x += c.v; if (c.x > W + 120) c.x = -160 * c.s; }
  }

  function makeBolt() {
    let x = rnd(W * 0.2, W * 0.8), pts = [[x, 0]];
    for (let y = 30; y < H * 0.55; y += 30) { x += rnd(-28, 28); pts.push([x, y]); }
    return pts;
  }

  function draw() {
    t++; ctx.clearRect(0, 0, W, H);
    const clearish = kind === "clear" || kind === "partly";
    if (!day && clearish) {
      stars.forEach((s) => { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 0.03 + s.ph)})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); });
      moon();
    } else if (day && clearish) sun();
    clouds.forEach(cloud);
    if (!day && !clearish) { ctx.fillStyle = "rgba(0,0,25,.28)"; ctx.fillRect(0, 0, W, H); }

    if (kind === "rain" || kind === "storm") {
      ctx.strokeStyle = "rgba(200,220,255,.55)"; ctx.lineWidth = 1.3; ctx.beginPath();
      drops.forEach((p) => { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + p.len); p.y += p.vy; p.x -= 1.1; if (p.y > H) Object.assign(p, drop(false)); });
      ctx.stroke();
    } else if (kind === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.9)";
      drops.forEach((p) => { ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 0.02 + p.ph) * 14, p.y, p.r, 0, 7); ctx.fill(); p.y += p.vy; if (p.y > H + 10) Object.assign(p, drop(false)); });
    } else if (kind === "hail") {
      ctx.fillStyle = "rgba(245,250,255,.95)";
      drops.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); p.y += p.vy; p.x -= 1;
        if (p.b === 0 && p.y >= p.floor) { p.vy = -p.vy * 0.35; p.b = 1; }
        else if (p.b === 1) { p.vy += 0.6; if (p.vy > 0 && p.y >= p.floor) Object.assign(p, drop(false)); }
      });
    }

    if (thunder && !still) {
      if (!flash && Math.random() < 0.006) { flash = 1; bolt = makeBolt(); }
      if (flash) {
        ctx.fillStyle = `rgba(255,255,255,${flash * 0.35})`; ctx.fillRect(0, 0, W, H);
        if (flash > 0.5 && bolt) {
          ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${flash})`; ctx.lineWidth = 2.5; ctx.shadowColor = "#bcd4ff"; ctx.shadowBlur = 16;
          ctx.beginPath(); bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
        }
        flash *= 0.9; if (flash < 0.03) flash = 0;
      }
    }
    if (!still && running) requestAnimationFrame(draw);
  }

  function set(k, isDay, withThunder) {
    if (k === kind && isDay === day && withThunder === thunder) return;
    kind = k; day = isDay; thunder = withThunder; flash = 0;
    if (!W) resize(); else seed();
    if (still) draw(); else if (!running) { running = true; requestAnimationFrame(draw); }
  }

  addEventListener("resize", resize);
  return { set };
})();
