
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

// ===== ALTERNAR MAPA / PARA-BRISA =====
function toggleNavigationView() {
  if (typeof hudActive !== 'undefined' && hudActive) {
    stopHUD();
  } else {
    startHUD();
  }
}

// ===== HUD =====
async function startHUD() {
  if (typeof hudActive !== 'undefined' && hudActive) return;

  hudActive = true;

  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'block';

  const navCard = document.getElementById('navCard');
  if (navCard) navCard.style.display = 'none';

  const cameraOk = await startCamera();

  // O usuário pode ter saído do modo HUD enquanto a câmera abria.
  if (!hudActive) {
    stopCamera();
    return;
  }

  if (cameraOk) {
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.style.opacity = '0';
      mapEl.style.transition = 'opacity 0.6s';
    }
    startArrowCanvas();
  } else {
    toast('📷 Câmera indisponível — usando mapa 3D', false);

    if (typeof map !== 'undefined' && map) {
      map.easeTo({
        pitch: 60,
        bearing: typeof currentHeading !== 'undefined' ? currentHeading || 0 : 0,
        duration: 1000
      });
    }
  }

  if (typeof currentRoute !== 'undefined' && currentRoute) {
    try {
      const step = currentRoute.legs[0].steps[0];
      const distEl = document.getElementById('hudDistance');
      const instEl = document.getElementById('hudInstruction');
      const streetEl = document.getElementById('hudStreet');

      if (distEl) distEl.textContent = formatDist(step.distance);
      if (instEl) instEl.textContent = traduzirInstrucao(step.maneuver);
      if (streetEl) streetEl.textContent = step.name || '—';
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

  if (typeof map !== 'undefined' && map) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }

  if (
    typeof currentRoute !== 'undefined' &&
    currentRoute &&
    typeof routeCoords !== 'undefined' &&
    routeCoords &&
    routeCoords.length > 1
  ) {
    const navCard = document.getElementById('navCard');
    if (navCard) navCard.style.display = 'flex';
  }

  faixasFaladas = { 300: false, 100: false, 30: false };
  ultimaStepTexto = '';
  ultimaInstrucaoFalada = '';
  ultimoIndiceRota = 0;
}

// ===== BOTÃO DE SOM =====
function toggleSound() {
  vozAtiva = !vozAtiva;

  try {
    localStorage.setItem('rs_voz_ativa', vozAtiva ? 'true' : 'false');
  } catch (e) {}

  atualizarBotaoSom();

  if (vozAtiva) {
    toast('🔊 Som ligado');
  } else {
    pararVoz();
    toast('🔇 Som desligado');
  }
}

function atualizarBotaoSom() {
  const btn = document.getElementById('hudSoundBtn');
  if (!btn) return;

  btn.textContent = vozAtiva ? '🔊 Som' : '🔇 Mudo';
}

// ===== MANOBRAS CRÍTICAS =====
function ehManobraCritica(tipo, modifier, distanciaStep) {
  if (distanciaStep < 10) return false;

  const tiposCriticos = [
    'turn',
    'fork',
    'merge',
    'roundabout',
    'uturn',
    'end of road',
    'on ramp',
    'off ramp',
    'arrive'
  ];

  if (!tiposCriticos.includes(tipo)) return false;

  if ((tipo === 'fork' || tipo === 'merge') && !modifier) {
    return false;
  }

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

    const steps = currentRoute.legs?.[0]?.steps;
    if (!steps || !steps.length) return;

    if (idxCurva < 0) {
      stepAtual = steps[steps.length - 1];
      distanciaAte = distanciaAoLongoDaRota(
        idxAtual,
        routeCoords.length - 1
      );
    } else {
      let acumulado = 0;

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        acumulado += s.distance || 0;

        if (i === 0) continue;

        const tipo = s.maneuver?.type || '';
        const modifier = s.maneuver?.modifier || '';

        if (!ehManobraCritica(tipo, modifier, s.distance || 0)) {
          continue;
        }

        const idxStep = encontrarIndicePorDistancia(acumulado);

        if (idxStep >= idxCurva) {
          stepAtual = s;
          break;
        }
      }

      if (!stepAtual) stepAtual = steps[steps.length - 1];

      distanciaAte = distanciaAoLongoDaRota(idxAtual, idxCurva);
    }

    if (!stepAtual) return;

    const elDist = document.getElementById('hudDistance');
    const elInst = document.getElementById('hudInstruction');
    const elSt = document.getElementById('hudStreet');

    if (elDist) elDist.textContent = formatDist(distanciaAte);

    if (elInst) {
      elInst.textContent = traduzirInstrucao(stepAtual.maneuver);
      elInst.dataset.distancia = String(distanciaAte);
    }

    if (elSt) elSt.textContent = stepAtual.name || '—';
  }, 2000);
}

function pararAtualizacaoCard() {
  if (cardLoopId) {
    clearInterval(cardLoopId);
    cardLoopId = null;
  }
}

// ===== VOZ =====
function falar(texto) {
  if (!vozAtiva || !vozSuportada || !texto) return;

  try {
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.volume = 1;

    speechSynthesis.speak(utter);
  } catch (e) {}
}

function pararVoz() {
  try {
    if (vozSuportada) speechSynthesis.cancel();
  } catch (e) {}
}

// ===== HELPERS DA ROTA =====
function encontrarPontoMaisProximoDaRota() {
  if (!routeCoords?.length || !userPos) return 0;
  if (!isValidCoord(userPos[0], userPos[1])) return 0;

  let melhorIdx = Math.min(ultimoIndiceRota, routeCoords.length - 1);
  let melhorDist = Infinity;

  const inicio = Math.max(0, ultimoIndiceRota - 50);
  const fim = Math.min(routeCoords.length - 1, ultimoIndiceRota + 50);

  for (let i = inicio; i <= fim; i++) {
    const c = routeCoords[i];
    if (!c) continue;

    const d = haversine(userPos[0], userPos[1], c[1], c[0]);

    if (d < melhorDist) {
      melhorDist = d;
      melhorIdx = i;
    }
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
  if (!currentRoute.legs?.[0]) return -1;

  const steps = currentRoute.legs[0].steps;
  if (!steps?.length) return -1;

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
  if (!routeCoords?.length) return -1;

  let acumulado = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];

    if (!c1 || !c2) continue;

    acumulado += haversine(c1[1], c1[0], c2[1], c2[0]);

    if (acumulado >= distanciaAlvo) return i;
  }

  return routeCoords.length - 1;
}

// ===== MATEMÁTICA DA TRILHA NEON =====
function bearingDegrees(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLon = (b.lon - a.lon) * rad;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (Math.atan2(y, x) / rad + 360) % 360;
}

function getRoutePointsNeon() {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) return null;
  if (!Array.isArray(userPos) || userPos.length < 2) return null;

  const lat = Number(userPos[0]);
  const lon = Number(userPos[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let nearestIdx = encontrarPontoMaisProximoDaRota();
  nearestIdx = Math.max(0, Math.min(nearestIdx, routeCoords.length - 1));

  let nextIdx = Math.min(nearestIdx + 3, routeCoords.length - 1);

  if (nextIdx === nearestIdx && nearestIdx > 0) {
    nextIdx = nearestIdx - 1;
  }

  const a = {
    lat: routeCoords[nearestIdx][1],
    lon: routeCoords[nearestIdx][0]
  };

  const b = {
    lat: routeCoords[nextIdx][1],
    lon: routeCoords[nextIdx][0]
  };

  const heading = bearingDegrees(a, b);
  const rad = Math.PI / 180;
  const cosLat = Math.cos(lat * rad);
  const points = [{ forward: 0.5, lateral: 0 }];

  for (
    let i = nearestIdx + 1;
    i < Math.min(nearestIdx + 45, routeCoords.length);
    i++
  ) {
    const p = routeCoords[i];

    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      continue;
    }

    const dLon = (p[0] - lon) * rad;
    const dLat = (p[1] - lat) * rad;

    const east = dLon * 6371000 * cosLat;
    const north = dLat * 6371000;
    const angle = heading * rad;

    const forward =
      north * Math.cos(angle) + east * Math.sin(angle);

    const lateral =
      east * Math.cos(angle) - north * Math.sin(angle);

    if (forward > 0.5 && forward < 160) {
      points.push({ forward, lateral });
    }
  }

  return points.length >= 3 ? points : null;
}

function projectPointNeon(point, width, height) {
  const horizonY = height * 0.43;
  const focalLength = Math.min(width, height) * 0.72;
  const depth = Math.max(1, point.forward);
  const scale = focalLength / (depth + 12);

  return {
    x: width / 2 + point.lateral * scale,
    y: horizonY + (height * 0.48) * (1 - 12 / (depth + 12)),
    scale,
    depth
  };
}

// ===== VOZ POR DISTÂNCIA =====
let vozDistLoopId = null;

function iniciarVerificacaoVozPorDistancia() {
  if (vozDistLoopId) return;

  vozDistLoopId = setInterval(() => {
    if (!hudActive || !vozAtiva) return;
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
    if (!hudActive || !vozAtiva) return;

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
    'Vire à direita',
    'Vire à esquerda',
    'Curva acentuada à direita',
    'Curva acentuada à esquerda',
    'Retorne',
    'Chegada ao destino',
    'Mantenha-se à direita',
    'Mantenha-se à esquerda'
  ];

  return criticas.some(c => instrucao.includes(c));
}

// ===== CÂMERA TRASEIRA =====
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
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
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
      background: #000;
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
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const video = document.getElementById('cameraVideo');

  if (video) {
    video.srcObject = null;
    video.remove();
  }

  cameraActive = false;
}

// ===== CANVAS DAS SETAS NEON =====
function startArrowCanvas() {
  if (arrowCanvas) return;

  const old = document.getElementById('arrowCanvas');
  if (old) old.remove();

  arrowCanvas = document.createElement('canvas');
  arrowCanvas.id = 'arrowCanvas';

  arrowCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1500;
    pointer-events: none;
    mix-blend-mode: screen;
  `;

  document.body.appendChild(arrowCanvas);

  arrowCtx = arrowCanvas.getContext('2d', { alpha: true });

  if (!arrowCtx) {
    arrowCanvas.remove();
    arrowCanvas = null;
    return;
  }

  resizeArrowCanvas();
  window.addEventListener('resize', resizeArrowCanvas);
  animateArrows();
}

function stopArrowCanvas() {
  if (arrowAnimId) {
    cancelAnimationFrame(arrowAnimId);
    arrowAnimId = null;
  }

  if (arrowCanvas) {
    arrowCanvas.remove();
    arrowCanvas = null;
    arrowCtx = null;
  }

  window.removeEventListener('resize', resizeArrowCanvas);
}

function resizeArrowCanvas() {
  if (!arrowCanvas || !arrowCtx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvasW = window.innerWidth;
  canvasH = window.innerHeight;

  arrowCanvas.width = canvasW * dpr;
  arrowCanvas.height = canvasH * dpr;

  arrowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== ANIMAÇÃO DA TRILHA =====
let elapsed = 0;
let lastTime = 0;

function animateArrows(time = 0) {
  if (!arrowCtx || !arrowCanvas) return;

  if (!lastTime) lastTime = time;

  elapsed += Math.min(time - lastTime, 50);
  lastTime = time;

  const W = canvasW;
  const H = canvasH;

  arrowCtx.clearRect(0, 0, W, H);

  if (hudActive && cameraActive) {
    const pts = getRoutePointsNeon();

    if (pts && pts.length > 2) {
      const proj = pts.map(p => projectPointNeon(p, W, H));

      // Trilha ciano acompanha os pontos da rota calculada.
      arrowCtx.save();
      arrowCtx.beginPath();

      let started = false;

      for (const p of proj) {
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.y < H * 0.36 ||
          p.y > H * 0.94 ||
          p.x < -W * 0.1 ||
          p.x > W * 1.1
        ) {
          started = false;
          continue;
        }

        if (!started) {
          arrowCtx.moveTo(p.x, p.y);
          started = true;
        } else {
          arrowCtx.lineTo(p.x, p.y);
        }
      }

      arrowCtx.lineCap = 'round';
      arrowCtx.lineJoin = 'round';
      arrowCtx.strokeStyle = 'rgba(0, 220, 255, 0.42)';
      arrowCtx.lineWidth = 4;
      arrowCtx.shadowColor = '#00dfff';
      arrowCtx.shadowBlur = 12;
      arrowCtx.stroke();
      arrowCtx.restore();

      // Setas menores e espaçadas para não cobrir os controles.
      const minGap = Math.max(48, H * 0.065);
      let lastY = H + minGap;

      for (let i = proj.length - 1; i >= 0; i--) {
        const p = proj[i];

        if (
          p.y < H * 0.37 ||
          p.y > H * 0.88 ||
          p.x < W * 0.12 ||
          p.x > W * 0.88
        ) {
          continue;
        }

        if (Math.abs(lastY - p.y) < minGap) continue;

        const size = Math.max(8, Math.min(25, 520 / (p.depth + 20)));
        const alpha = Math.max(0.3, Math.min(0.95, 1 - p.depth / 180));

        desenharSetaNeon(p.x, p.y, size, alpha);
        lastY = p.y;
      }
    }
  }

  arrowAnimId = requestAnimationFrame(animateArrows);
}

// ===== REPORTAR RISCO =====
function openReportFromBtn() {
  if (!gpsOk || !userPos) {
    return toast('🚫 Sem GPS.', false);
  }

  pendingReport = {
    lat: userPos[0],
    lng: userPos[1]
  };

  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  const e = document.getElementById('reportCoords');

  if (e) {
    e.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  const sheet = document.getElementById('reportSheet');
  if (sheet) sheet.style.display = 'block';
}

function closeReport() {
  const sheet = document.getElementById('reportSheet');
  if (sheet) sheet.style.display = 'none';

  pendingReport = null;
}

async function submitReport() {
  if (!pendingReport) return;

  let deviceId = localStorage.getItem('rs_device_id');

  if (!deviceId) {
    deviceId =
      'dev_' +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);

    localStorage.setItem('rs_device_id', deviceId);
  }

  const payload = {
    lat: pendingReport.lat,
    lng: pendingReport.lng,
    severity: document.getElementById('repSev')?.value || 'medio',
    type: document.getElementById('repType')?.value || 'Outro',
    note: document.getElementById('repNote')?.value || '',
    radius_m: 200,
    device_id: deviceId
  };

  const btn = document.getElementById('repSubmit');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }

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

    const note = document.getElementById('repNote');
    if (note) note.value = '';

    await loadRisks();
  } catch (e) {
    toast('Erro de rede.', false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar reporte';
    }
  }
}

window.addEventListener('beforeunload', () => {
  stopCamera();
  stopArrowCanvas();
  pararVoz();
  pararAtualizacaoCard();
});

console.log(
  '[RotaSegura] script2.js carregado — HUD, câmera e trilha neon'
);
