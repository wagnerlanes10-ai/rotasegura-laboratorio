/* =========================================================
   RotaSegura — script2.js (Parte 2)
   HUD, câmera, TRILHA NEON 3D, report, voz, card dinâmico
   ========================================================= */

// ===== CÂMERA =====
let cameraStream = null;
let cameraActive = false;

// ===== CANVAS DAS SETAS =====
let arrowCanvas = null;
let arrowCtx = null;
let arrowAnimId = null;
let canvasW = 0;
let canvasH = 0;

// ===== CARD DINÂMICO =====
let cardLoopId = null;

// ===== VOZ =====
let vozAtiva = true;
let ultimaInstrucaoFalada = '';
let vozSuportada = ('speechSynthesis' in window);

let faixasFaladas = { 300: false, 100: false, 30: false };
let ultimaStepTexto = '';
let ultimoIndiceRota = 0;

try {
  const saved = localStorage.getItem('rs_voz_ativa');
  if (saved === 'false') vozAtiva = false;
} catch (e) {}

// ===== HUD =====
async function startHUD() {
  hudActive = true;
  const cameraOk = await startCamera();
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'block';

  const navCard = document.getElementById('navCard');
  if (navCard) navCard.style.display = 'none';

  if (cameraOk) {
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.style.opacity = '0';
      mapEl.style.transition = 'opacity 0.6s';
    }
    startArrowCanvas();
  } else {
    toast('📷 Câmera negada — modo mapa 3D', false);
    map.easeTo({ pitch: 60, bearing: currentHeading || 0, duration: 1000 });
  }

  if (currentRoute) {
    try {
      const step = currentRoute.legs[0].steps[0];
      document.getElementById('hudDistance').textContent = formatDist(step.distance);
      document.getElementById('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
      document.getElementById('hudStreet').textContent = step.name || '—';
    } catch (e) {}
  }

  atualizarBotaoSom();
  iniciarVerificacaoVoz();
  iniciarAtualizacaoCard();
}

function stopHUD() {
  hudActive = false;
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  stopCamera();
  stopArrowCanvas();
  pararVoz();
  pararAtualizacaoCard();
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.opacity = '1';
    mapEl.style.transition = 'opacity 0.6s';
  }
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });

  if (currentRoute && routeCoords && routeCoords.length > 1) {
    const navCard = document.getElementById('navCard');
    if (navCard) navCard.style.display = 'flex';
  }

  faixasFaladas = { 300: false, 100: false, 30: false };
  ultimaStepTexto = '';
  ultimoIndiceRota = 0;
}

// ===== BOTÃO DE SOM =====
function toggleSound() {
  vozAtiva = !vozAtiva;
  try { localStorage.setItem('rs_voz_ativa', vozAtiva ? 'true' : 'false'); } catch (e) {}
  atualizarBotaoSom();
  if (vozAtiva) toast('🔊 Som ligado');
  else { pararVoz(); toast('🔇 Som desligado'); }
}

function atualizarBotaoSom() {
  const btn = document.getElementById('hudSoundBtn');
  if (!btn) return;
  btn.textContent = vozAtiva ? '🔊 Som' : '🔇 Mudo';
}

// ===== FUNÇÃO CENTRAL: O QUE É UMA MANOBRA CRÍTICA =====
function ehManobraCritica(tipo, modifier, distanciaStep) {
  if (distanciaStep < 10) return false;
  const tiposCriticos = [
    'turn', 'fork', 'merge', 'roundabout', 'uturn',
    'end of road', 'on ramp', 'off ramp', 'arrive'
  ];
  if (!tiposCriticos.includes(tipo)) return false;
  if ((tipo === 'fork' || tipo === 'merge') && !modifier) return false;
  return true;
}

// ===== CARD DINÂMICO =====
function iniciarAtualizacaoCard() {
  if (cardLoopId) return;
  cardLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!currentRoute || !routeCoords || !userPos) return;
    if (!isValidCoord(userPos[0], userPos[1])) return;

    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();

    let stepAtual = null;
    let distanciaAte = 0;

    if (idxCurva < 0) {
      const steps = currentRoute.legs[0].steps;
      stepAtual = steps[steps.length - 1];
      distanciaAte = distanciaAoLongoDaRota(idxAtual, routeCoords.length - 1);
    } else {
      const steps = currentRoute.legs[0].steps;
      let acumulado = 0;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const distanciaStep = s.distance || 0;
        acumulado += distanciaStep;
        if (i === 0) continue;

        const tipo = s.maneuver?.type || '';
        const modifier = s.maneuver?.modifier || '';
        if (!ehManobraCritica(tipo, modifier, distanciaStep)) continue;

        const idxStep = encontrarIndicePorDistancia(acumulado);
        if (idxStep >= idxCurva) { stepAtual = s; break; }
      }
      if (!stepAtual) stepAtual = steps[steps.length - 1];
      distanciaAte = distanciaAoLongoDaRota(idxAtual, idxCurva);
    }

    if (!stepAtual) return;

    try {
      const elDist = document.getElementById('hudDistance');
      const elInst = document.getElementById('hudInstruction');
      const elSt = document.getElementById('hudStreet');
      if (elDist) elDist.textContent = formatDist(distanciaAte);
      if (elInst) {
        elInst.textContent = traduzirInstrucao(stepAtual.maneuver);
        elInst.dataset.distancia = String(distanciaAte);
      }
      if (elSt) elSt.textContent = stepAtual.name || '—';
    } catch (e) {}
  }, 2000);
}

function pararAtualizacaoCard() {
  if (cardLoopId) { clearInterval(cardLoopId); cardLoopId = null; }
}

// ===== VOZ =====
function falar(texto) {
  if (!vozAtiva) return;
  if (!vozSuportada) return;
  if (!texto) return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    speechSynthesis.speak(utter);
  } catch (e) {}
}

function pararVoz() {
  try { if (vozSuportada) speechSynthesis.cancel(); } catch (e) {}
}

// ===== HELPERS =====
function encontrarPontoMaisProximoDaRota() {
  if (!routeCoords || !routeCoords.length || !userPos) return 0;
  if (!isValidCoord(userPos[0], userPos[1])) return 0;
  let melhorIdx = ultimoIndiceRota;
  let melhorDist = Infinity;
  const inicio = Math.max(0, ultimoIndiceRota - 50);
  const fim = Math.min(routeCoords.length - 1, ultimoIndiceRota + 50);
  for (let i = inicio; i <= fim; i++) {
    const c = routeCoords[i];
    const d = haversine(userPos[0], userPos[1], c[1], c[0]);
    if (d < melhorDist) { melhorDist = d; melhorIdx = i; }
  }
  ultimoIndiceRota = melhorIdx;
  return melhorIdx;
}

function distanciaAoLongoDaRota(idx1, idx2) {
  if (!routeCoords || idx1 >= idx2) return 0;
  let total = 0;
  for (let i = idx1; i < idx2; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];
    if (!c1 || !c2) continue;
    total += haversine(c1[1], c1[0], c2[1], c2[0]);
  }
  return total;
}

function encontrarIndiceDaProximaCurva() {
  if (!currentRoute || !routeCoords) return -1;
  if (!currentRoute.legs || !currentRoute.legs[0]) return -1;
  const steps = currentRoute.legs[0].steps;
  if (!steps || !steps.length) return -1;
  let distAcumulada = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const tipo = s.maneuver?.type || '';
    const modifier = s.maneuver?.modifier || '';
    const distanciaStep = s.distance || 0;
    distAcumulada += distanciaStep;
    if (i === 0) continue;
    if (!ehManobraCritica(tipo, modifier, distanciaStep)) continue;
    return encontrarIndicePorDistancia(distAcumulada);
  }
  return -1;
}

function encontrarIndicePorDistancia(distanciaAlvo) {
  if (!routeCoords || !routeCoords.length) return -1;
  let acumulado = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];
    if (!c1 || !c2) continue;
    const d = haversine(c1[1], c1[0], c2[1], c2[0]);
    acumulado += d;
    if (acumulado >= distanciaAlvo) return i;
  }
  return routeCoords.length - 1;
}

// ===== MATEMÁTICA DA TRILHA NEON =====
function bearingDegrees(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad, lat2 = b.lat * rad;
  const dLon = (b.lon - a.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

function getRoutePointsNeon() {
  const route = routeCoords;
  const pos = userPos;
  if (!route || route.length < 2 || !pos) return null;

  let nearestIdx = 0, minDst = Infinity;
  route.forEach((p, i) => {
    const d = haversine(pos[0], pos[1], p[1], p[0]);
    if (d < minDst) { minDst = d; nearestIdx = i; }
  });

  if (nearestIdx > route.length - 5) nearestIdx = Math.max(0, route.length - 5);

  const heading = bearingDegrees(
    {lat: route[nearestIdx][1], lon: route[nearestIdx][0]},
    {lat: route[Math.min(nearestIdx+1, route.length-1)][1], lon: route[Math.min(nearestIdx+1, route.length-1)][0]}
  );

  const rad = Math.PI / 180;
  const cosLat = Math.cos(pos[0] * rad);
  const points = [];

  // Amostragem a cada 2 pontos para suavizar o zigue-zague do GPS
  for (let i = nearestIdx; i < Math.min(nearestIdx + 40, route.length); i += 2) {
    const pt = route[i];
    const dLon = (pt[0] - pos[1]) * rad;
    const dLat = (pt[1] - pos[0]) * rad;
    
    const east = dLon * 6371000 * cosLat;
    const north = dLat * 6371000;
    const angle = heading * rad;
    
    const forward = north * Math.cos(angle) + east * Math.sin(angle);
    const lateral = east * Math.cos(angle) - north * Math.sin(angle);

    // Ignora os primeiros 5 metros para não bugar em cima do carro
    if (forward > 5 && forward < 200) {
      points.push({ forward, lateral });
    }
  }
  return points.length > 1 ? points : null;
}

function projectPointNeon(point, width, height) {
  const focalLength = 350;
  const camHeight = 1.5;   
  const horizonY = height * 0.30;

  const depth = Math.max(1, point.forward);
  const scale = focalLength / depth;
  
  const x = (width / 2) + (point.lateral * scale);
  const y = horizonY + (camHeight * scale);

  return { x, y, scale };
}

// ===== VOZ POR DISTÂNCIA =====
let vozDistLoopId = null;
function iniciarVerificacaoVozPorDistancia() {
  if (vozDistLoopId) return;
  vozDistLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!vozAtiva) return;
    if (!currentRoute || !routeCoords || !userPos) return;
    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();
    if (idxCurva < 0) return;
    const dist = distanciaAoLongoDaRota(idxAtual, idxCurva);
    const instrucaoEl = document.getElementById('hudInstruction');
    const instrucao = instrucaoEl?.textContent?.trim() || '';
    if (instrucao !== ultimaStepTexto) {
      faixasFaladas = { 300: false, 100: false, 30: false };
      ultimaStepTexto = instrucao;
    }
    if (!deveFalar(instrucao)) return;
    if (dist <= 30 && !faixasFaladas[30]) {
      faixasFaladas[30] = true;
      faixasFaladas[100] = true;
      faixasFaladas[300] = true;
      falar(instrucao + ' agora');
    } else if (dist <= 100 && !faixasFaladas[100]) {
      faixasFaladas[100] = true;
      faixasFaladas[300] = true;
      falar(instrucao);
    } else if (dist <= 300 && !faixasFaladas[300]) {
      faixasFaladas[300] = true;
      falar(instrucao + ' em 300 metros');
    }
  }, 2000);
}

let vozLoopId = null;
function iniciarVerificacaoVoz() {
  if (vozLoopId) return;
  vozLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!vozAtiva) return;
    const el = document.getElementById('hudInstruction');
    if (!el) return;
    const inst = el.textContent?.trim();
    if (!inst || inst === '—' || inst === 'Aguardando rota…') return;
    if (inst === ultimaInstrucaoFalada) return;
    if (deveFalar(inst) && !ultimaStepTexto) {
      ultimaInstrucaoFalada = inst;
      falar(inst);
    } else {
      ultimaInstrucaoFalada = inst;
    }
  }, 2000);
  iniciarVerificacaoVozPorDistancia();
}

function deveFalar(instrucao) {
  const criticas = [
    'Vire à direita', 'Vire à esquerda',
    'Curva acentuada à direita', 'Curva acentuada à esquerda',
    'Retorne', 'Chegada ao destino',
    'Mantenha-se à direita', 'Mantenha-se à esquerda'
  ];
  return criticas.some(c => instrucao.includes(c));
}

// ===== CÂMERA =====
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    let video = document.getElementById('cameraVideo');
    if (!video) {
      video = document.createElement('video');
      video.id = 'cameraVideo';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      document.body.appendChild(video);
    }
    video.srcObject = cameraStream;
    await video.play().catch(() => {});
    video.style.cssText = `
      position: fixed; inset: 0; width: 100%; height: 100%;
      object-fit: cover; z-index: 0; background: #000;
    `;
    cameraActive = true;
    return true;
  } catch (e) {
    cameraActive = false;
    return false;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) { video.srcObject = null; video.remove(); }
  cameraActive = false;
}

// ===== CANVAS DAS SETAS (TRILHA NEON) =====
function startArrowCanvas() {
  if (arrowCanvas) return;
  
  // Remove canvas antigo se existir
  const old = document.getElementById('arrowCanvas');
  if (old) old.remove();

  arrowCanvas = document.createElement('canvas');
  arrowCanvas.id = 'arrowCanvas';
  arrowCanvas.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    z-index: 1500; pointer-events: none; mix-blend-mode: screen;
  `;
  document.body.appendChild(arrowCanvas);
  arrowCtx = arrowCanvas.getContext('2d', { alpha: true });
  resizeArrowCanvas();
  window.addEventListener('resize', resizeArrowCanvas);
  animateArrows();
}

function stopArrowCanvas() {
  if (arrowAnimId) { cancelAnimationFrame(arrowAnimId); arrowAnimId = null; }
  if (arrowCanvas) {
    arrowCanvas.remove();
    arrowCanvas = null;
    arrowCtx = null;
  }
  window.removeEventListener('resize', resizeArrowCanvas);
}

function resizeArrowCanvas() {
  if (!arrowCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  arrowCanvas.width = canvasW * dpr;
  arrowCanvas.height = canvasH * dpr;
  arrowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== ANIMAÇÃO (DESENHA A TRILHA NEON) =====
let elapsed = 0;
let lastTime = 0;

function animateArrows(time) {
  if (!arrowCtx || !arrowCanvas) return;
  
  if (!lastTime) lastTime = time;
  elapsed += time - lastTime;
  lastTime = time;

  const W = canvasW;
  const H = canvasH;
  arrowCtx.clearRect(0, 0, W, H);

  if (!hudActive) {
    arrowAnimId = requestAnimationFrame(animateArrows);
    return;
  }

  const pts = getRoutePointsNeon();

  if (pts) {
    const proj = pts.map(p => projectPointNeon(p, W, H));

    // 1. Trilha Neon Larga
    arrowCtx.beginPath();
    arrowCtx.moveTo(proj[0].x, proj[0].y);
    for (let i = 1; i < proj.length; i++) arrowCtx.lineTo(proj[i].x, proj[i].y);

    arrowCtx.lineCap = "round";
    arrowCtx.lineJoin = "round";

    arrowCtx.strokeStyle = "rgba(0, 220, 255, 0.15)";
    arrowCtx.lineWidth = 70;
    arrowCtx.stroke();

    arrowCtx.strokeStyle = "rgba(0, 220, 255, 0.4)";
    arrowCtx.lineWidth = 25;
    arrowCtx.stroke();

    arrowCtx.strokeStyle = "#a8f7ff";
    arrowCtx.lineWidth = 5;
    arrowCtx.shadowColor = "#00dfff";
    arrowCtx.shadowBlur = 15;
    arrowCtx.stroke();
    arrowCtx.shadowBlur = 0;

    // 2. Setas Chevron Gigantes
    for (let i = 1; i < proj.length; i++) {
      const a = proj[i-1];
      const b = proj[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 60) {
        const ang = Math.atan2(dy, dx) + Math.PI / 2;
        const size = Math.max(15, b.scale * 3);

        arrowCtx.save();
        arrowCtx.translate(b.x, b.y);
        arrowCtx.rotate(ang);
        
        arrowCtx.beginPath();
        arrowCtx.moveTo(0, -size);
        arrowCtx.lineTo(size * 0.6, size * 0.5);
        arrowCtx.lineTo(0, size * 0.1);
        arrowCtx.lineTo(-size * 0.6, size * 0.5);
        arrowCtx.closePath();
        
        arrowCtx.fillStyle = "#00e5ff";
        arrowCtx.fill();
        arrowCtx.strokeStyle = "#fff";
        arrowCtx.lineWidth = 2;
        arrowCtx.stroke();
        arrowCtx.restore();
      }
    }
  }

  arrowAnimId = requestAnimationFrame(animateArrows);
}

// ===== REPORT =====
function openReportFromBtn() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS.', false);
  pendingReport = { lat: userPos[0], lng: userPos[1] };
  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  const e = document.getElementById('reportCoords');
  if (e) e.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  const s = document.getElementById('reportSheet');
  if (s) s.style.display = 'block';
}

function closeReport() {
  const s = document.getElementById('reportSheet');
  if (s) s.style.display = 'none';
  pendingReport = null;
}

async function submitReport() {
  if (!pendingReport) return;
  let deviceId = localStorage.getItem('rs_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('rs_device_id', deviceId);
  }
  const payload = {
    lat: pendingReport.lat,
    lng: pendingReport.lng,
    severity: (document.getElementById('repSev')?.value) || 'medio',
    type: (document.getElementById('repType')?.value) || 'Outro',
    note: (document.getElementById('repNote')?.value) || '',
    radius_m: 200,
    device_id: deviceId
  };
  const btn = document.getElementById('repSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    const r = await fetch('/api/risk/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || data.rejected) {
      toast('⛔ ' + (data.error || 'Muitos reportes.'), false);
      return;
    }
    if (!r.ok || !data.ok) {
      toast('Erro: ' + (data.error || r.status), false);
      return;
    }
    const msgs = {
      created: '✅ Reporte criado!',
      confirmed: `✅ Confirmado! (${data.count || 1})`,
      merged: '✅ Somado a um risco'
    };
    toast(msgs[data.action] || '✅ Reporte enviado!');
    closeReport();
    const n = document.getElementById('repNote');
    if (n) n.value = '';
    await loadRisks();
  } catch (e) {
    toast('Erro de rede.', false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
  }
}

window.addEventListener('beforeunload', () => {
  stopCamera();
  stopArrowCanvas();
  pararVoz();
  pararAtualizacaoCard();
});

console.log('[RotaSegura] script2.js carregado — manobras completas + trilha neon');
