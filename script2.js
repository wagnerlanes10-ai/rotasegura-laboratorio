
/* =========================================================
   RotaSegura — script2.js
   Parte 1/4 — HUD, câmera e cartão de navegação
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

// ===== CARTÃO DINÂMICO =====
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

// ===== MODO PARA-BRISA / HUD =====
async function startHUD() {
  if (typeof hudActive !== 'undefined' && hudActive) return;

  hudActive = true;

  const hud = document.getElementById('hud');
  const navCard = document.getElementById('navCard');

  if (hud) hud.style.display = 'block';
  if (navCard) navCard.style.display = 'none';

  let cameraOk = false;

  try {
    cameraOk = await startCamera();
  } catch (e) {
    cameraOk = false;
  }

  // A câmera pode demorar a abrir. Só inicia a trilha
  // depois de confirmar que o modo continua ativo.
  if (!hudActive) {
    stopCamera();
    return;
  }

  const mapEl = document.getElementById('map');

  if (cameraOk) {
    if (mapEl) {
      mapEl.style.opacity = '0';
      mapEl.style.transition = 'opacity 0.6s';
    }

    startArrowCanvas();
  } else {
    if (mapEl) {
      mapEl.style.opacity = '1';
      mapEl.style.transition = 'opacity 0.6s';
    }

    if (typeof toast === 'function') {
      toast('📷 Câmera indisponível — usando mapa 3D', false);
    }

    if (typeof map !== 'undefined' && map) {
      map.easeTo({
        pitch: 60,
        bearing: typeof currentHeading === 'number'
          ? currentHeading
          : 0,
        duration: 1000
      });
    }
  }

  if (currentRoute) {
    try {
      const step = currentRoute.legs[0].steps[0];

      const distanceEl = document.getElementById('hudDistance');
      const instructionEl = document.getElementById('hudInstruction');
      const streetEl = document.getElementById('hudStreet');

      if (distanceEl) {
        distanceEl.textContent = formatDist(step.distance);
      }

      if (instructionEl) {
        instructionEl.textContent = traduzirInstrucao(step.maneuver);
      }

      if (streetEl) {
        streetEl.textContent = step.name || '—';
      }
    } catch (e) {
      console.warn('Não foi possível atualizar a instrução inicial:', e);
    }
  }

  atualizarBotaoSom();
  iniciarVerificacaoVoz();
  iniciarAtualizacaoCard();
}

// ===== ENCERRAR MODO PARA-BRISA =====
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
    map.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 600
    });
  }

  if (
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
    if (typeof toast === 'function') toast('🔊 Som ligado');
  } else {
    pararVoz();
    if (typeof toast === 'function') toast('🔇 Som desligado');
  }
}

function atualizarBotaoSom() {
  const btn = document.getElementById('hudSoundBtn');
  if (!btn) return;

  btn.textContent = vozAtiva ? '🔊 Som' : '🔇 Mudo';
}

// ===== IDENTIFICAR MANOBRAS IMPORTANTES =====
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

  if (
    (tipo === 'fork' || tipo === 'merge') &&
    !modifier
  ) {
    return false;
  }

  return true;
}

// ===== ATUALIZAÇÃO DO CARTÃO DE NAVEGAÇÃO =====
function iniciarAtualizacaoCard() {
  if (cardLoopId) return;

  cardLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!currentRoute || !routeCoords || !userPos) return;

    if (
      typeof isValidCoord === 'function' &&
      !isValidCoord(userPos[0], userPos[1])
    ) {
      return;
    }

    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();

    let stepAtual = null;
    let distanciaAte = 0;

    const steps = currentRoute.legs?.[0]?.steps || [];

    if (!steps.length) return;

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

      distanciaAte = distanciaAoLongoDaRota(
        idxAtual,
        idxCurva
      );
    }

    if (!stepAtual) return;

    const elDist = document.getElementById('hudDistance');
    const elInst = document.getElementById('hudInstruction');
    const elSt = document.getElementById('hudStreet');

    if (elDist) {
      elDist.textContent = formatDist(distanciaAte);
    }

    if (elInst) {
      elInst.textContent = traduzirInstrucao(stepAtual.maneuver);
      elInst.dataset.distancia = String(distanciaAte);
    }

    if (elSt) {
      elSt.textContent = stepAtual.name || '—';
    }
  }, 2000);
}

function pararAtualizacaoCard() {
  if (cardLoopId) {
    clearInterval(cardLoopId);
    cardLoopId = null;
  }
}

// A próxima parte continua com os recursos de voz,
// cálculo de distância e acompanhamento das manobras.

/* =========================================================
   PARTE 2/4 — VOZ, DISTÂNCIAS E PROJEÇÃO DA ROTA
   ========================================================= */

// ===== VOZ =====
function falar(texto) {
  if (!vozAtiva || !vozSuportada || !texto) return;

  try {
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('Não foi possível reproduzir a voz:', e);
  }
}

function pararVoz() {
  try {
    if (vozSuportada) speechSynthesis.cancel();
  } catch (e) {}
}

// ===== ENCONTRAR O PONTO MAIS PRÓXIMO DA ROTA =====
function encontrarPontoMaisProximoDaRota() {
  if (!routeCoords?.length || !userPos) return 0;

  if (
    typeof isValidCoord === 'function' &&
    !isValidCoord(userPos[0], userPos[1])
  ) {
    return 0;
  }

  let melhorIdx = ultimoIndiceRota;
  let melhorDist = Infinity;

  const inicio = Math.max(0, ultimoIndiceRota - 50);
  const fim = Math.min(
    routeCoords.length - 1,
    ultimoIndiceRota + 50
  );

  for (let i = inicio; i <= fim; i++) {
    const c = routeCoords[i];
    if (!c) continue;

    const d = haversine(
      userPos[0],
      userPos[1],
      c[1],
      c[0]
    );

    if (d < melhorDist) {
      melhorDist = d;
      melhorIdx = i;
    }
  }

  ultimoIndiceRota = melhorIdx;
  return melhorIdx;
}

// ===== DISTÂNCIA RESTANTE AO LONGO DA ROTA =====
function distanciaAoLongoDaRota(idx1, idx2) {
  if (!routeCoords || idx1 >= idx2) return 0;

  let total = 0;

  for (let i = idx1; i < idx2; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];

    if (!c1 || !c2) continue;

    total += haversine(
      c1[1], c1[0],
      c2[1], c2[0]
    );
  }

  return total;
}

// ===== LOCALIZAR A PRÓXIMA MANOBRA IMPORTANTE =====
function encontrarIndiceDaProximaCurva() {
  if (!currentRoute || !routeCoords) return -1;
  if (!currentRoute.legs?.[0]) return -1;

  const steps = currentRoute.legs[0].steps;
  if (!steps?.length) return -1;

  let distAcumulada = 0;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];

    distAcumulada += s.distance || 0;

    if (i === 0) continue;

    const tipo = s.maneuver?.type || '';
    const modifier = s.maneuver?.modifier || '';

    if (
      !ehManobraCritica(
        tipo,
        modifier,
        s.distance || 0
      )
    ) {
      continue;
    }

    return encontrarIndicePorDistancia(distAcumulada);
  }

  return -1;
}

// ===== CONVERTER DISTÂNCIA EM ÍNDICE DA ROTA =====
function encontrarIndicePorDistancia(distanciaAlvo) {
  if (!routeCoords?.length) return -1;

  let acumulado = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];

    if (!c1 || !c2) continue;

    acumulado += haversine(
      c1[1], c1[0],
      c2[1], c2[0]
    );

    if (acumulado >= distanciaAlvo) return i;
  }

  return routeCoords.length - 1;
}

// ===== CALCULAR DIREÇÃO ENTRE DOIS PONTOS =====
function bearingDegrees(a, b) {
  const rad = Math.PI / 180;

  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLon = (b.lon - a.lon) * rad;

  const y = Math.sin(dLon) * Math.cos(lat2);

  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) *
    Math.cos(dLon);

  return (Math.atan2(y, x) / rad + 360) % 360;
}

// ===== PONTOS DA TRILHA NEON =====
function getRoutePointsNeon() {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
    return null;
  }

  if (!Array.isArray(userPos) || userPos.length < 2) {
    return null;
  }

  const lat = Number(userPos[0]);
  const lon = Number(userPos[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  let nearestIdx = encontrarPontoMaisProximoDaRota();

  nearestIdx = Math.max(
    0,
    Math.min(nearestIdx, routeCoords.length - 1)
  );

  let nextIdx = Math.min(
    nearestIdx + 3,
    routeCoords.length - 1
  );

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

    if (
      !p ||
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1])
    ) {
      continue;
    }

    const dLon = (p[0] - lon) * rad;
    const dLat = (p[1] - lat) * rad;

    const east = dLon * 6371000 * cosLat;
    const north = dLat * 6371000;
    const angle = heading * rad;

    const forward =
      north * Math.cos(angle) +
      east * Math.sin(angle);

    const lateral =
      east * Math.cos(angle) -
      north * Math.sin(angle);

    if (forward > 0.5 && forward < 160) {
      points.push({ forward, lateral });
    }
  }

  return points.length >= 3 ? points : null;
}

// ===== PROJETAR A ROTA NA TELA =====
function projectPointNeon(point, width, height) {
  const horizonY = height * 0.43;
  const focalLength = Math.min(width, height) * 0.72;
  const depth = Math.max(1, point.forward);
  const scale = focalLength / (depth + 12);

  return {
    x: width / 2 + point.lateral * scale,
    y:
      horizonY +
      height * 0.48 *
      (1 - 12 / (depth + 12)),
    scale,
    depth
  };
}

// ===== CONTROLE DE AVISOS DE VOZ POR DISTÂNCIA =====
let vozDistLoopId = null;

function iniciarVerificacaoVozPorDistancia() {
  if (vozDistLoopId) return;

  vozDistLoopId = setInterval(() => {
    if (!hudActive || !vozAtiva) return;
    if (!currentRoute || !routeCoords || !userPos) return;

    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();

    if (idxCurva < 0) return;

    const dist = distanciaAoLongoDaRota(
      idxAtual,
      idxCurva
    );

    const instrucaoEl = document.getElementById('hudInstruction');
    const instrucao = instrucaoEl?.textContent?.trim() || '';

    if (instrucao !== ultimaStepTexto) {
      faixasFaladas = { 300: false, 100: false, 30: false };
      ultimaStepTexto = instrucao;
    }

    if (typeof deveFalar === 'function' && !deveFalar(instrucao)) {
      return;
    }

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
      falar(instrucao);
    }
  }, 1000);
}

function pararVerificacaoVozPorDistancia() {
  if (vozDistLoopId) {
    clearInterval(vozDistLoopId);
    vozDistLoopId = null;
  }
}

// A Parte 3 continuará com o desenho e a animação das setas.

/* =========================================================
   PARTE 3/4 — CÂMERA, TRILHA NEON E SETAS CURVADAS
   ========================================================= */

// ===== ABRIR A CÂMERA TRASEIRA =====
async function startCamera() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return false;
  }

  try {
    // Evita abrir uma segunda transmissão da câmera.
    if (cameraStream && cameraActive) return true;

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

    Object.assign(video.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      zIndex: '0',
      background: '#000'
    });

    await video.play();
    cameraActive = true;
    return true;

  } catch (error) {
    console.warn('Câmera indisponível:', error);

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    cameraActive = false;
    return false;
  }
}

// ===== FECHAR A CÂMERA =====
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const video = document.getElementById('cameraVideo');

  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
  }

  cameraActive = false;
}

// ===== CRIAR A CAMADA DAS SETAS =====
function startArrowCanvas() {
  if (arrowCanvas && arrowCanvas.isConnected) return;

  const oldCanvas = document.getElementById('arrowCanvas');
  if (oldCanvas) oldCanvas.remove();

  arrowCanvas = document.createElement('canvas');
  arrowCanvas.id = 'arrowCanvas';

  Object.assign(arrowCanvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '1500',
    pointerEvents: 'none',
    mixBlendMode: 'screen'
  });

  document.body.appendChild(arrowCanvas);

  arrowCtx = arrowCanvas.getContext('2d', { alpha: true });

  if (!arrowCtx) {
    arrowCanvas.remove();
    arrowCanvas = null;
    return;
  }

  resizeArrowCanvas();

  window.addEventListener('resize', resizeArrowCanvas);

  elapsed = 0;
  lastTime = 0;

  animateArrows();
}

// ===== ENCERRAR A CAMADA DAS SETAS =====
function stopArrowCanvas() {
  if (arrowAnimId !== null) {
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

// ===== AJUSTAR O CANVAS AO TAMANHO DA TELA =====
function resizeArrowCanvas() {
  if (!arrowCanvas || !arrowCtx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvasW = window.innerWidth;
  canvasH = window.innerHeight;

  arrowCanvas.width = Math.round(canvasW * dpr);
  arrowCanvas.height = Math.round(canvasH * dpr);

  arrowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== DESENHAR UMA SETA NEON =====
function desenharSetaNeon(x, y, tamanho, alpha = 0.9, angulo = 0) {
  if (!arrowCtx) return;

  arrowCtx.save();
  arrowCtx.translate(x, y);
  arrowCtx.rotate(angulo);
  arrowCtx.globalAlpha = alpha;

  // Brilho externo
  arrowCtx.shadowColor = '#00eaff';
  arrowCtx.shadowBlur = tamanho * 1.2;
  arrowCtx.strokeStyle = '#00eaff';
  arrowCtx.lineWidth = Math.max(2, tamanho * 0.17);
  arrowCtx.lineCap = 'round';
  arrowCtx.lineJoin = 'round';

  // Ponta e corpo da seta
  arrowCtx.beginPath();
  arrowCtx.moveTo(-tamanho * 0.55, tamanho * 0.35);
  arrowCtx.lineTo(0, -tamanho * 0.35);
  arrowCtx.lineTo(tamanho * 0.55, tamanho * 0.35);
  arrowCtx.stroke();

  // Núcleo luminoso mais fino
  arrowCtx.shadowBlur = 3;
  arrowCtx.strokeStyle = '#d9ffff';
  arrowCtx.lineWidth = Math.max(1, tamanho * 0.055);

  arrowCtx.beginPath();
  arrowCtx.moveTo(-tamanho * 0.55, tamanho * 0.35);
  arrowCtx.lineTo(0, -tamanho * 0.35);
  arrowCtx.lineTo(tamanho * 0.55, tamanho * 0.35);
  arrowCtx.stroke();

  arrowCtx.restore();
}

// ===== ANIMAR A TRILHA E AS SETAS =====
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

  if (hudActive && cameraActive && currentRoute) {
    const pts = getRoutePointsNeon();

    if (pts && pts.length > 2) {
      const proj = pts.map(p => projectPointNeon(p, W, H));

      // Desenha a trilha ciano acompanhando a rota.
      arrowCtx.save();
      arrowCtx.beginPath();

      let started = false;

      for (const p of proj) {
        const visivel =
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.y >= H * 0.36 &&
          p.y <= H * 0.94 &&
          p.x >= -W * 0.1 &&
          p.x <= W * 1.1;

        if (!visivel) {
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
      arrowCtx.strokeStyle = 'rgba(0, 220, 255, 0.45)';
      arrowCtx.lineWidth = 4;
      arrowCtx.shadowColor = '#00dfff';
      arrowCtx.shadowBlur = 12;
      arrowCtx.stroke();
      arrowCtx.restore();

      // Setas distribuídas ao longo da rota.
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

        const size = Math.max(
          8,
          Math.min(25, 520 / (p.depth + 20))
        );

        const alpha = Math.max(
          0.3,
          Math.min(0.95, 1 - p.depth / 180)
        );

        // A seta aponta para cima. A orientação segue a
        // direção local da rota quando calculável.
        let angulo = 0;

        if (i > 0) {
          const anterior = proj[i - 1];
          const dx = p.x - anterior.x;
          const dy = p.y - anterior.y;

          if (Number.isFinite(dx) && Number.isFinite(dy)) {
            angulo = Math.atan2(dx, -dy);
          }
        }

        desenharSetaNeon(p.x, p.y, size, alpha, angulo);
        lastY = p.y;
      }
    }
  }

  arrowAnimId = requestAnimationFrame(animateArrows);
}

// A Parte 4 fará a integração final dos reportes,
// botões e encerramento dos recursos.

/* =========================================================
   ROTASEGURA — SCRIPT2.JS
   PARTE 4 DE 4
   Voz, alternância do HUD, reportes e encerramento
   ========================================================= */

// Evita repetir a mesma instrução de voz
let ultimaInstrucaoFalada = '';

/* ---------------------------------------------------------
   VERIFICAÇÃO DE INSTRUÇÕES POR VOZ
   --------------------------------------------------------- */

function deveFalar(instrucao) {
  if (!instrucao) return false;

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

  return criticas.some(texto => instrucao.includes(texto));
}

function iniciarVerificacaoVoz() {
  if (vozLoopId) return;

  vozLoopId = setInterval(() => {
    if (!hudActive || !vozAtiva) return;

    const elemento = document.getElementById('hudInstruction');
    if (!elemento) return;

    const instrucao = elemento.textContent?.trim();

    if (
      !instrucao ||
      instrucao === '—' ||
      instrucao === 'Aguardando rota…'
    ) {
      return;
    }

    if (instrucao === ultimaInstrucaoFalada) return;

    ultimaInstrucaoFalada = instrucao;

    if (deveFalar(instrucao) && !ultimaStepTexto) {
      falar(instrucao);
    }
  }, 2000);

  iniciarVerificacaoVozPorDistancia();
}

/* ---------------------------------------------------------
   ALTERNAR MODO DE NAVEGAÇÃO / HUD
   --------------------------------------------------------- */

function toggleNavigationView() {
  if (hudActive) {
    stopHUD();
    return;
  }

  if (typeof currentRoute !== 'undefined' && !currentRoute) {
    if (typeof toast === 'function') {
      toast('Defina um destino e calcule a rota primeiro.', false);
    }
    return;
  }

  startHUD();
}

/* ---------------------------------------------------------
   ABRIR FORMULÁRIO DE REPORTE DE RISCO
   --------------------------------------------------------- */

function openReportFromBtn() {
  if (
    typeof gpsOk === 'undefined' ||
    !gpsOk ||
    typeof userPos === 'undefined' ||
    !userPos
  ) {
    if (typeof toast === 'function') {
      toast('Sem GPS. Ative a localização e tente novamente.', false);
    }
    return;
  }

  pendingReport = {
    lat: userPos[0],
    lng: userPos[1]
  };

  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  const coordenadas = document.getElementById('reportCoords');

  if (coordenadas) {
    coordenadas.textContent =
      `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }

  const formulario = document.getElementById('reportSheet');

  if (formulario) {
    formulario.style.display = 'block';
  }
}

function closeReport() {
  const formulario = document.getElementById('reportSheet');

  if (formulario) {
    formulario.style.display = 'none';
  }

  pendingReport = null;
}

/* ---------------------------------------------------------
   ENVIAR REPORTE PARA A API
   --------------------------------------------------------- */

async function submitReport() {
  if (!pendingReport) {
    if (typeof toast === 'function') {
      toast('Obtenha sua localização antes de reportar.', false);
    }
    return;
  }

  let deviceId;

  try {
    deviceId = localStorage.getItem('rs_device_id');

    if (!deviceId) {
      deviceId =
        'dev_' +
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);

      localStorage.setItem('rs_device_id', deviceId);
    }
  } catch (erro) {
    deviceId = 'dev_' + Date.now().toString(36);
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

  const botao = document.getElementById('repSubmit');

  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Enviando...';
  }

  try {
    const resposta = await fetch('/api/risk/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const dados = await resposta.json().catch(() => ({}));

    if (resposta.status === 429 || dados.rejected) {
      toast('Reporte recusado: ' + (dados.error || 'limite de envios.'), false);
      return;
    }

    if (!resposta.ok || !dados.ok) {
      toast('Não foi possível enviar o reporte.', false);
      return;
    }

    const mensagens = {
      created: 'Reporte de risco criado!',
      confirmed: `Risco confirmado! (${dados.count || 1})`,
      merged: 'Reporte associado a um risco existente.'
    };

    toast(mensagens[dados.action] || 'Reporte enviado!');

    closeReport();

    const observacao = document.getElementById('repNote');
    if (observacao) observacao.value = '';

    if (typeof loadRisks === 'function') {
      await loadRisks();
    }
  } catch (erro) {
    console.error('[RotaSegura] Erro ao enviar reporte:', erro);
    toast('Erro de conexão ao enviar o reporte.', false);
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = 'Enviar reporte';
    }
  }
}

/* ---------------------------------------------------------
   ENCERRAMENTO SEGURO DOS RECURSOS
   --------------------------------------------------------- */

window.addEventListener('beforeunload', () => {
  if (typeof stopCamera === 'function') stopCamera();
  if (typeof stopArrowCanvas === 'function') stopArrowCanvas();
  if (typeof pararVoz === 'function') pararVoz();
  if (typeof pararAtualizacaoCard === 'function') {
    pararAtualizacaoCard();
  }
  if (typeof pararVerificacaoVozPorDistancia === 'function') {
    pararVerificacaoVozPorDistancia();
  }
});

console.log('[RotaSegura] Parte 4 carregada.');
