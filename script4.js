/*
 * ROTASEGURA — HUD FUTURISTA (VERSÃO ORIGINAL CORRIGIDA)
 * Trilha grande, setas animadas e visual de para-brisa.
 */

(() => {
  "use strict";

  const HUD_ID = "hud";
  const CANVAS_ID = "routeHudCanvas";

  let canvas;
  let ctx;
  let animationId;
  let lastTime = 0;
  let elapsed = 0;
  let resizeObserver;

  const style = document.createElement("style");
  style.textContent = `
    #${CANVAS_ID} {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1501;
      pointer-events: none;
      display: block;
      mix-blend-mode: screen;
    }
    #${HUD_ID} { overflow: hidden; }
    @media (prefers-reduced-motion: reduce) {
      #${CANVAS_ID} { animation: none; }
    }
  `;
  document.head.appendChild(style);

  function getHud() { return document.getElementById(HUD_ID); }

  function setupCanvas() {
    const hud = getHud();
    if (!hud) return false;

    // CORREÇÃO: Esconde as setas antigas para não ficarem duplicadas
    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = 'none';

    if (!canvas) {
      canvas = document.getElementById(CANVAS_ID);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = CANVAS_ID;
        hud.appendChild(canvas);
      }
      ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return false;

      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(hud);
      window.addEventListener("resize", resizeCanvas);
    }
    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hudIsVisible() {
    const hud = getHud();
    if (!hud) return false;
    const s = getComputedStyle(hud);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0;
  }

  // CORREÇÃO: Lendo as variáveis globais corretamente (sem window.)
  function getRoute() {
    if (typeof routeCoords === 'undefined' || !Array.isArray(routeCoords)) return [];
    return routeCoords.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  // CORREÇÃO: Lendo as variáveis globais corretamente (sem window.)
  function getPosition() {
    if (typeof userPos === 'undefined' || !Array.isArray(userPos)) return null;
    if (Number.isFinite(userPos[0]) && Number.isFinite(userPos[1])) {
      return { lat: userPos[0], lon: userPos[1] };
    }
    return null;
  }

  function distanceMeters(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a.lat * rad, lat2 = b.lat * rad;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function bearingDegrees(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a.lat * rad, lat2 = b.lat * rad;
    const dLon = (b.lon - a.lon) * rad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  function findNearestRouteIndex(route, position) {
    let nearestIndex = 0, nearestDistance = Infinity;
    route.forEach((point, index) => {
      const distance = distanceMeters(position, { lon: point[0], lat: point[1] });
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
    });
    return nearestIndex;
  }

  function getRoutePoints() {
    const route = getRoute();
    const position = getPosition();
    if (route.length < 2 || !position) return null;

    const nearestIndex = findNearestRouteIndex(route, position);
    const nextIndex = Math.min(nearestIndex + 1, route.length - 1);
    const origin = { lon: position.lon, lat: position.lat };
    const nextPoint = { lon: route[nextIndex][0], lat: route[nextIndex][1] };
    const previousPoint = { lon: route[Math.max(0, nearestIndex - 1)][0], lat: route[Math.max(0, nearestIndex - 1)][1] };

    let heading = bearingDegrees(previousPoint, nextPoint);
    if (!Number.isFinite(heading)) heading = 0;

    const rad = Math.PI / 180;
    const cosLat = Math.cos(origin.lat * rad);

    return route.slice(nearestIndex).map(point => {
      const target = { lon: point[0], lat: point[1] };
      const dLon = (target.lon - origin.lon) * rad;
      const dLat = (target.lat - origin.lat) * rad;
      const east = dLon * 6371000 * cosLat;
      const north = dLat * 6371000;
      const angle = heading * rad;
      const forward = north * Math.cos(angle) + east * Math.sin(angle);
      const lateral = east * Math.cos(angle) - north * Math.sin(angle);
      return { forward, lateral };
    });
  }

  // Matemática original que deixa a trilha GRANDE igual à Imagem 2
  function projectPoint(point, width, height) {
    const horizon = height * 0.39;
    const bottom = height * 0.94;
    const depth = Math.max(0, point.forward);

    const perspective = Math.min(1.8, 0.14 + depth / 75);

    return {
      x: width / 2 + point.lateral * perspective,
      y: bottom - depth * 1.5,
      visible: point.forward > -3 && point.forward < 180
    };
  }

  function drawGlowLine(points, width, height) {
    if (points.length < 2) return;
    const projected = points.map(point => projectPoint(point, width, height));

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Halo
    ctx.beginPath();
    projected.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "rgba(0, 220, 255, 0.18)";
    ctx.lineWidth = 25;
    ctx.shadowColor = "#00d9ff";
    ctx.shadowBlur = 35;
    ctx.stroke();

    // Linha principal
    ctx.beginPath();
    projected.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "rgba(0, 225, 255, 0.75)";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 18;
    ctx.stroke();

    // Núcleo
    ctx.beginPath();
    projected.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "rgba(225, 255, 255, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.restore();
  }

  function drawChevron(x, y, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#a8f7ff";
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.shadowColor = "#00dfff";
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(-size, size * 0.3);
    ctx.lineTo(0, -size * 0.45);
    ctx.lineTo(size, size * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnimatedArrows(points, width, height) {
    if (points.length < 2) return;
    const projected = points.map(point => projectPoint(point, width, height));

    for (let i = 1; i < projected.length; i++) {
      const a = projected[i - 1];
      const b = projected[i];
      if (!a.visible && !b.visible) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 8) continue;

      const count = Math.max(1, Math.floor(length / 75));
      for (let j = 0; j < count; j++) {
        const fraction = (j / count + (elapsed * 0.00035) % 1) % 1;
        const x = a.x + dx * fraction;
        const y = a.y + dy * fraction;
        const size = Math.max(7, Math.min(22, 7 + (height - y) / 45));
        const alpha = Math.max(0.15, Math.min(0.95, 1 - y / height));
        drawChevron(x, y, size, alpha);
      }
    }
  }

  function drawFallback(width, height) {
    const x = width / 2;
    const y = height * 0.72;
    const pulse = 1 + Math.sin(elapsed * 0.003) * 0.08;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 220, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#00dfff";
    ctx.shadowBlur = 20;

    ctx.beginPath();
    ctx.moveTo(x - 24 * pulse, y + 15);
    ctx.lineTo(x, y - 18 * pulse);
    ctx.lineTo(x + 24 * pulse, y + 15);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!canvas || !ctx) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);
    if (!hudIsVisible()) return;

    const points = getRoutePoints();

    // CORREÇÃO: se a rota for válida, desenha a trilha. Se não, usa o fallback.
    if (!points || points.length < 2) {
      drawFallback(width, height);
      return;
    }

    // Ignora os primeiros 2 metros para não desenhar o "zigue-zague" em cima do carro
    const forwardPoints = points.filter(point => point.forward > 2 && point.forward < 180);

    if (forwardPoints.length < 2) {
      drawFallback(width, height);
      return;
    }

    drawGlowLine(forwardPoints, width, height);
    drawAnimatedArrows(forwardPoints, width, height);

    const pulse = 0.7 + Math.sin(elapsed * 0.004) * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.91, 3 + pulse * 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(170, 250, 255, 0.9)";
    ctx.shadowColor = "#00dfff";
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();
  }

  function animate(time) {
    if (!lastTime) lastTime = time;
    const delta = Math.min(time - lastTime, 50);
    lastTime = time;
    elapsed += delta;
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

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function observeHud() {
    const hud = getHud();
    if (!hud) return;
    const observer = new MutationObserver(() => {
      if (hudIsVisible()) start();
      else if (ctx && canvas) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    });
    observer.observe(hud, { attributes: true, attributeFilter: ["style", "class"] });
  }

  function initialize() {
    if (!getHud()) { setTimeout(initialize, 300); return; }
    setupCanvas();
    observeHud();
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  window.RotaSeguraHUD = { start, stop, redraw: draw };
})();
