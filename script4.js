
/* =========================================================
   RotaSegura — script4.js
   HUD futurista: trilha ciano baseada na geometria real da rota.
   Mantém fallback pela instrução quando a rota não está disponível.
   ========================================================= */
(function () {
  'use strict';

  let ativo = false;
  let canvas = null;
  let ctx = null;
  let animId = null;
  let resizeHandler = null;
  let offset = 0;
  let W = 0;
  let H = 0;
  let curvaAtual = 0;
  let curvaAlvo = 0;
  let observer = null;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function instalar() {
    const hud = document.getElementById('hud');

    if (!hud) {
      setTimeout(instalar, 300);
      return;
    }

    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      const visivel = getComputedStyle(hud).display !== 'none';

      if (visivel && !ativo) iniciar();
      else if (!visivel && ativo) parar();
    });

    observer.observe(hud, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    if (getComputedStyle(hud).display !== 'none') iniciar();

    console.log('[RotaSegura HUD] setas de rota prontas');
  }

  function iniciar() {
    if (ativo) return;

    ativo = true;

    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = 'none';

    canvas = document.createElement('canvas');
    canvas.id = 'arrowCanvasCurvo';
    canvas.setAttribute('aria-hidden', 'true');

    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;' +
      'z-index:1501;pointer-events:none;';

    document.body.appendChild(canvas);

    ctx = canvas.getContext('2d', { alpha: true });

    resizeHandler = redimensionar;
    window.addEventListener('resize', resizeHandler, {
      passive: true
    });

    redimensionar();

    offset = 0;
    calcularFallback();

    animId = requestAnimationFrame(loop);
  }

  function parar() {
    ativo = false;

    if (animId !== null) {
      cancelAnimationFrame(animId);
    }

    animId = null;

    if (canvas) canvas.remove();

    canvas = null;
    ctx = null;

    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }

    resizeHandler = null;

    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = '';
  }

  function redimensionar() {
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function calcularFallback() {
    const el = document.getElementById('hudInstruction');

    const t = (el && el.textContent || '')
      .toLocaleLowerCase('pt-BR');

    let f = 0;

    if (/curva acentuada.*direita|vire à direita|vire a direita/.test(t)) {
      f = 0.85;
    } else if (/curva acentuada.*esquerda|vire à esquerda|vire a esquerda/.test(t)) {
      f = -0.85;
    } else if (/curva suave.*direita|rotatória.*direita/.test(t)) {
      f = 0.48;
    } else if (/curva suave.*esquerda|rotatória.*esquerda/.test(t)) {
      f = -0.48;
    } else if (/retorne|retorno/.test(t)) {
      f = 0.65;
    } else if (/direita/.test(t)) {
      f = 0.3;
    } else if (/esquerda/.test(t)) {
      f = -0.3;
    }

    curvaAlvo = f;
  }

  function rotaDisponivel() {
    return typeof routeCoords !== 'undefined' &&
      Array.isArray(routeCoords) &&
      routeCoords.length > 2 &&
      typeof userPos !== 'undefined' &&
      Array.isArray(userPos) &&
      Number.isFinite(userPos[0]) &&
      Number.isFinite(userPos[1]);
  }

  function distancia2(a, b) {
    const dx = (a[0] - b[0]) *
      Math.cos((a[1] + b[1]) * Math.PI / 360);

    const dy = a[1] - b[1];

    return dx * dx + dy * dy;
  }

  function bearing(a, b) {
    const r = Math.PI / 180;

    const p1 = a[1] * r;
    const p2 = b[1] * r;
    const dl = (b[0] - a[0]) * r;

    const y = Math.sin(dl) * Math.cos(p2);

    const x =
      Math.cos(p1) * Math.sin(p2) -
      Math.sin(p1) * Math.cos(p2) * Math.cos(dl);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function deltaAng(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  // Transforma os pontos futuros da rota numa curva em perspectiva.
  function pontosDaRota() {
    if (!rotaDisponivel()) return null;

    const coords = routeCoords;

    // userPos: [latitude, longitude]
    // routeCoords: [longitude, latitude]
    const pos = [userPos[1], userPos[0]];

    let nearest = 0;
    let best = Infinity;

    for (let i = 0; i < coords.length; i++) {
      const d = distancia2(pos, coords[i]);

      if (d < best) {
        best = d;
        nearest = i;
      }
    }

    const heading =
      typeof currentHeading === 'number' &&
      Number.isFinite(currentHeading)
        ? currentHeading
        : bearing(
            coords[nearest],
            coords[Math.min(nearest + 1, coords.length - 1)]
          );

    const out = [];
    const amostras = 9;

    for (let k = 0; k < amostras; k++) {
      const idx = Math.min(
        coords.length - 1,
        nearest + 2 +
          k * Math.max(
            1,
            Math.floor((coords.length - nearest - 1) / amostras)
          )
      );

      const c = coords[idx];
      const b = bearing(pos, c);

      const rel = clamp(
        deltaAng(b, heading),
        -68,
        68
      ) * Math.PI / 180;

      const depth = k / (amostras - 1);

      const x =
        W / 2 +
        Math.tan(rel) * W * (0.15 + depth * 0.62);

      const y = H * (0.78 - depth * 0.43);

      out.push({
        x: clamp(x, W * 0.08, W * 0.92),
        y,
        depth
      });
    }

    return out;
  }

  function loop() {
    if (!ativo || !ctx || !canvas) return;

    ctx.clearRect(0, 0, W, H);

    const pontos = pontosDaRota();

    if (pontos && pontos.length > 2) {
      desenharTrilha(pontos);
    } else {
      calcularFallback();

      curvaAtual += (curvaAlvo - curvaAtual) * 0.035;

      desenharFallback();
    }

    offset = (offset + 0.012) % 1;

    animId = requestAnimationFrame(loop);
  }

  function caminhoSuave(pontos) {
    ctx.beginPath();
    ctx.moveTo(pontos[0].x, pontos[0].y);

    for (let i = 1; i < pontos.length - 1; i++) {
      const mx = (pontos[i].x + pontos[i + 1].x) / 2;
      const my = (pontos[i].y + pontos[i + 1].y) / 2;

      ctx.quadraticCurveTo(
        pontos[i].x,
        pontos[i].y,
        mx,
        my
      );
    }

    const last = pontos[pontos.length - 1];

    ctx.lineTo(last.x, last.y);
  }

  function desenharTrilha(pontos) {
    ctx.save();

    caminhoSuave(pontos);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,220,255,0.18)';
    ctx.lineWidth = W * 0.15;
    ctx.shadowColor = '#00d9ff';
    ctx.shadowBlur = 34;
    ctx.stroke();

    caminhoSuave(pontos);

    ctx.strokeStyle = 'rgba(0,210,255,0.23)';
    ctx.lineWidth = W * 0.085;
    ctx.shadowBlur = 18;
    ctx.stroke();

    caminhoSuave(pontos);

    ctx.strokeStyle = 'rgba(105,245,255,0.82)';
    ctx.lineWidth = Math.max(3, W * 0.012);
    ctx.shadowBlur = 12;
    ctx.stroke();

    ctx.restore();

    // Setas animadas distribuídas pela trilha.
    const count = 5;

    for (let i = 0; i < count; i++) {
      const p = ((i / count + offset) % 1);
      const f = 0.08 + p * 0.82;

      const point = interpolarPonto(pontos, f);

      const ahead = interpolarPonto(
        pontos,
        Math.min(1, f + 0.025)
      );

      const angle =
        Math.atan2(
          ahead.y - point.y,
          ahead.x - point.x
        ) + Math.PI / 2;

      const size = W * (0.075 + f * 0.055);
      const alpha = 0.32 + f * 0.62;

      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;

      ctx.shadowColor = '#00eaff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#00dfff';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.5, W * 0.004);

      ctx.beginPath();
      ctx.moveTo(0, -size * 0.62);
      ctx.lineTo(size * 0.46, size * 0.24);
      ctx.lineTo(0, size * 0.02);
      ctx.lineTo(-size * 0.46, size * 0.24);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function interpolarPonto(pontos, f) {
    const scaled = clamp(f, 0, 1) * (p
