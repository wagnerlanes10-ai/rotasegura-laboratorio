/*
 * ROTASEGURA — HUD FUTURISTA (ESTRADA 3D)
 * Trilha de rota em perspectiva real, sem zigue-zague e com câmera visível.
 */

(() => {
  "use strict";

  const HUD_ID = "hud";
  const CANVAS_ID = "routeHudCanvas";
  const VIDEO_ID = "cameraVideo";

  let canvas, ctx, animationId;
  let lastTime = 0, elapsed = 0;

  function getHud() { return document.getElementById(HUD_ID); }

  function setupCanvas() {
    const hud = getHud();
    if (!hud) return false;

    // Esconde o canvas antigo do script2.js para não sobrepor
    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = 'none';

    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = CANVAS_ID;
      // z-index 1501 fica acima da câmera (0) e abaixo do HUD (2000)
      canvas.style.cssText = `
        position: fixed; inset: 0; width: 100%; height: 100%;
        z-index: 1501; pointer-events: none; display: block;
      `;
      hud.appendChild(canvas);

      ctx = canvas.getContext("2d", { alpha: true });
      window.addEventListener("resize", resizeCanvas);
    }
    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hudIsVisible() {
    const hud = getHud();
    if (!hud) return false;
    const style = getComputedStyle(hud);
    return style.display !== "none" && Number(style.opacity || 1) > 0;
  }

  // --- MATEMÁTICA DA ROTA ---
  function getRoute() {
    if (typeof routeCoords === 'undefined' || !Array.isArray(routeCoords)) return [];
    return routeCoords.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function getPosition() {
    if (typeof userPos === 'undefined' || !Array.isArray(userPos)) return null;
    if (Number.isFinite(userPos[0]) && Number.isFinite(userPos[1])) {
      return { lat: userPos[0], lon: userPos[1] };
    }
    return null;
  }

  function distanceMeters(a, b) {
    const R = 6371e3, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }

  function bearingDegrees(a, b) {
    const rad = Math.PI / 180;
    const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function getRoutePoints() {
    const route = getRoute();
    const pos = getPosition();
    if (route.length < 2 || !pos) return null;

    let nearestIdx = 0, minDst = Infinity;
    route.forEach((p, i) => {
      const d = distanceMeters(pos, { lon: p[0], lat: p[1] });
      if (d < minDst) { minDst = d; nearestIdx = i; }
    });

    const heading = bearingDegrees(route[Math.max(0, nearestIdx-1)] ? {lat: route[Math.max(0, nearestIdx-1)][1], lon: route[Math.max(0, nearestIdx-1)][0]} : pos, 
                                   {lat: route[Math.min(nearestIdx+1, route.length-1)][1], lon: route[Math.min(nearestIdx+1, route.length-1)][0]});

    const rad = Math.PI / 180;
    const cosLat = Math.cos(pos.lat * rad);
    const points = [];

    // Pula alguns pontos para suavizar o GPS e evitar zigue-zague
    for (let i = nearestIdx; i < Math.min(nearestIdx + 50, route.length); i += 2) {
      const pt = route[i];
      const dLon = (pt[0] - pos.lon) * rad;
      const dLat = (pt[1] - pos.lat) * rad;
      
      const east = dLon * 6371000 * cosLat;
      const north = dLat * 6371000;

      // Rotaciona em relação à direção em que o carro está apontando
      const angle = heading * rad;
      const forward = north * Math.cos(angle) + east * Math.sin(angle);
      const lateral = east * Math.cos(angle) - north * Math.sin(angle);

      // Só adiciona pontos que estão à frente e até 150 metros de distância
      if (forward > 2 && forward < 150) {
        points.push({ forward, lateral });
      }
    }
    return points.length > 1 ? points : null;
  }

  // --- PROJEÇÃO 3D ---
  function projectPoint(point, width, height) {
    const focalLength = 600; // Controla a abertura da visão
    const camHeight = 1.5;   // Altura da câmera (metros)
    const horizonY = height * 0.45; // Onde fica o horizonte na tela

    const depth = Math.max(1, point.forward);
    
    // Fórmula de perspectiva real (quanto mais longe, menor)
    const scale = focalLength / depth;
    
    const x = (width / 2) + (point.lateral * scale);
    const y = horizonY + (camHeight * scale);

    return { x, y, scale };
  }

  function draw() {
    if (!canvas || !ctx) return;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    if (!hudIsVisible()) return;

    const pts = getRoutePoints();
    if (!pts) return;

    const proj = pts.map(p => projectPoint(p, w, h));

    // 1. Desenha a trilha principal (Estrada Neon)
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    for (let i = 1; i < proj.length; i++) {
      ctx.lineTo(proj[i].x, proj[i].y);
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Halo largo
    ctx.strokeStyle = "rgba(0, 220, 255, 0.15)";
    ctx.lineWidth = 60;
    ctx.stroke();

    // Linha média
    ctx.strokeStyle = "rgba(0, 220, 255, 0.4)";
    ctx.lineWidth = 20;
    ctx.stroke();

    // Núcleo brilhante
    ctx.strokeStyle = "#a8f7ff";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#00dfff";
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0; // reseta

    // 2. Desenha as setas em cima da trilha
    for (let i = 1; i < proj.length; i++) {
      const a = proj[i-1];
      const b = proj[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 50) { // Desenha uma seta a cada 50 pixels de distância
        const ang = Math.atan2(dy, dx) + Math.PI / 2;
        const size = Math.max(10, b.scale * 2); // Fica maior perto da tela

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.6, size * 0.5);
        ctx.lineTo(0, size * 0.1);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.closePath();
        ctx.fillStyle = "#00e5ff";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function animate(time) {
    if (!lastTime) lastTime = time;
    elapsed += time - lastTime;
    lastTime = time;
    draw();
    animationId = requestAnimationFrame(animate);
  }

  function start() {
    if (!setupCanvas()) return;
    if (!animationId) {
      lastTime = 0;
      animationId = requestAnimationFrame(animate);
    }
  }

  function observeHud() {
    const hud = getHud();
    if (!hud) return;
    new MutationObserver(() => {
      if (hudIsVisible()) start();
      else if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }).observe(hud, { attributes: true, attributeFilter: ["style", "class"] });
  }

  function init() {
    if (!getHud()) { setTimeout(init, 300); return; }
    setupCanvas();
    observeHud();
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
