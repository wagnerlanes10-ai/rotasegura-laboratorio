/* =========================================================
   ROTASEGURA — SCRIPT4.JS
   HUD FUTURISTA: TRILHA CIANO + SETAS CURVAS
   Ajustado para celular fixo (movimento na tela)
   ========================================================= */

(function () {
  'use strict';

  let ativo = false;
  let canvas = null;
  let ctx = null;
  let animId = null;
  let resizeHandler = null;
  let observer = null;

  let W = 0;
  let H = 0;
  let offset = 0;
  let curvaAtual = 0;
  let curvaAlvo = 0;
  let velocidadeFake = 0;

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));

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
      if (!visivel && ativo) parar();
    });

    observer.observe(hud, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    if (getComputedStyle(hud).display !== 'none') {
      iniciar();
    }

    console.log('[RotaSegura] HUD curvo carregado.');
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
    if (!ctx) {
      canvas.remove();
      canvas = null;
      ativo = false;
      return;
    }

    resizeHandler = redimensionar;
    window.addEventListener('resize', resizeHandler, { passive: true });
    redimensionar();

    offset = 0;
    curvaAtual = 0;
    curvaAlvo = 0;

    animId = requestAnimationFrame(loop);
  }

  function parar() {
    ativo = false;
    if (animId !== null) cancelAnimationFrame(animId);
    animId = null;
    if (canvas) canvas.remove();
    canvas = null;
    ctx = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
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
    const texto = (el ? el.textContent : '').toLocaleLowerCase('pt-BR');
    let curva = 0;

    if (/esquerda/.test(texto) && /acentuada|fechada|curva/.test(texto)) curva = -0.8;
    else if (/direita/.test(texto) && /acentuada|fechada|curva/.test(texto)) curva = 0.8;
    else if (/esquerda/.test(texto)) curva = -0.4;
    else if (/direita/.test(texto)) curva = 0.4;
    else if (/retorno|retorne/.test(texto)) curva = 0.65;

    curvaAlvo = curva;
  }

  function rotaDisponivel() {
    return (
      typeof routeCoords !== 'undefined' &&
      Array.isArray(routeCoords) &&
      routeCoords.length > 2 &&
      typeof userPos !== 'undefined' &&
      Array.isArray(userPos) &&
      Number.isFinite(userPos[0]) &&
      Number.isFinite(userPos[1])
    );
  }

  function distancia2(a, b) {
    const latMedia = (a[1] + b[1]) * Math.PI / 360;
    const dx = (a[0] - b[0]) * Math.cos(latMedia);
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  function bearing(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a[1] * rad;
    const lat2 = b[1] * rad;
    const deltaLon = (b[0] - a[0]) * rad;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function diferencaAngulo(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  function pontosDaRota() {
    if (!rotaDisponivel()) return null;
    const coords = routeCoords;
    const pos = [userPos[1], userPos[0]];

    let indiceProximo = 0;
    let menorDistancia = Infinity;

    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
      const d = distancia2(pos, c);
      if (d < menorDistancia) {
        menorDistancia = d;
        indiceProximo = i;
      }
    }

    let heading = null;
    if (typeof currentHeading === 'number' && Number.isFinite(currentHeading)) {
      heading = currentHeading;
    }

    if (heading === null) {
      const seguinte = coords[Math.min(indiceProximo + 1, coords.length - 1)];
      heading = bearing(coords[indiceProximo], seguinte);
    }

    const pontos = [];
    const amostras = 12;
    const restante = coords.length - 1 - indiceProximo;

    if (restante < 1) return null;

    for (let k = 0; k < amostras; k++) {
      const fracao = (k + 1) / amostras;
      const indice = Math.min(coords.length - 1, indiceProximo + Math.max(1, Math.round(restante * fracao)));
      const destino = coords[indice];

      if (!destino || !Number.isFinite(destino[0]) || !Number.isFinite(destino[1])) continue;

      const angulo = bearing(pos, destino);
      const relativo = clamp(diferencaAngulo(angulo, heading), -65, 65) * Math.PI / 180;
      const profundidade = (k + 1) / amostras;

      // Ajuste para celular fixo: Y comeca perto e vai para longe (subindo a tela)
      const x = W / 2 + Math.tan(relativo) * W * (0.12 + profundidade * 0.55);
      const y = H * (0.85 - profundidade * 0.5);

      pontos.push({
        x: clamp(x, W * 0.08, W * 0.92),
        y: y,
        profundidade: profundidade
      });
    }

    return pontos.length > 2 ? pontos : null;
  }

  function loop() {
    if (!ativo || !ctx || !canvas) return;
    ctx.clearRect(0, 0, W, H);

    const pontos = pontosDaRota();

    if (pontos) {
      desenharTrilha(pontos);
    } else {
      calcularFallback();
      curvaAtual += (curvaAlvo - curvaAtual) * 0.035;
      desenharFallback();
    }

    // A velocidade do offset aumenta se houver velocidade, ou fica fixa pra dar sensacao de movimento
    offset = (offset + 0.015) % 1; 
    animId = requestAnimationFrame(loop);
  }

  function caminhoSuave(pontos) {
    if (!pontos.length) return;
    ctx.beginPath();
    ctx.moveTo(pontos[0].x, pontos[0].y);
    for (let i = 1; i < pontos.length - 1; i++) {
      const meioX = (pontos[i].x + pontos[i + 1].x) / 2;
      const meioY = (pontos[i].y + pontos[i + 1].y) / 2;
      ctx.quadraticCurveTo(pontos[i].x, pontos[i].y, meioX, meioY);
    }
    const ultimo = pontos[pontos.length - 1];
    ctx.lineTo(ultimo.x, ultimo.y);
  }

  function interpolarPonto(pontos, f) {
    const t = clamp(f, 0, 1) * (pontos.length - 1);
    const i = Math.floor(t);
    const j = Math.min(i + 1, pontos.length - 1);
    const fracao = t - i;
    return {
      x: pontos[i].x + (pontos[j].x - pontos[i].x) * fracao,
      y: pontos[i].y + (pontos[j].y - pontos[i].y) * fracao
    };
  }

  function desenharTrilha(pontos) {
    ctx.save();
    caminhoSuave(pontos);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,220,255,0.15)';
    ctx.lineWidth = W * 0.15;
    ctx.shadowColor = '#00dfff';
    ctx.shadowBlur = 32;
    ctx.stroke();

    caminhoSuave(pontos);
    ctx.strokeStyle = 'rgba(0,210,255,0.22)';
    ctx.lineWidth = W * 0.085;
    ctx.shadowBlur = 20;
    ctx.stroke();

    caminhoSuave(pontos);
    ctx.strokeStyle = 'rgba(100,245,255,0.8)';
    ctx.lineWidth = Math.max(2, W * 0.009);
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    const quantidade = 5;
    for (let i = 0; i < quantidade; i++) {
      const f = (i / quantidade + offset) % 1;
      const ponto = interpolarPonto(pontos, f);
      const seguinte = interpolarPonto(pontos, Math.min(1, f + 0.025));

      const angulo = Math.atan2(seguinte.y - ponto.y, seguinte.x - ponto.x) + Math.PI / 2;
      const tamanho = W * (0.055 + ponto.y / H * 0.035);

      ctx.save();
      ctx.translate(ponto.x, ponto.y);
      ctx.rotate(angulo);

      ctx.globalAlpha = 0.45 + ponto.y / H * 0.5;
      ctx.fillStyle = '#00e5ff';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.5, W * 0.0035);
      ctx.shadowColor = '#00eaff';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      ctx.moveTo(0, -tamanho * 0.65);
      ctx.lineTo(tamanho * 0.48, tamanho * 0.2);
      ctx.lineTo(0, tamanho * 0.02);
      ctx.lineTo(-tamanho * 0.48, tamanho * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function desenharFallback() {
    const cx = W / 2;
    const topo = H * 0.35;
    const base = H * 0.96;

    const desvio = curvaAtual * W * 0.24;
    const pontos = [];

    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = cx + desvio * Math.pow(1 - t, 1.4);
      const y = base - (base - topo) * t;
      pontos.push({ x: x, y: y });
    }

    ctx.save();
    caminhoSuave(pontos);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,220,255,0.17)';
    ctx.lineWidth = W * 0.14;
    ctx.shadowColor = '#00dfff';
    ctx.shadowBlur = 28;
    ctx.stroke();

    caminhoSuave(pontos);
    ctx.strokeStyle = 'rgba(0,220,255,0.72)';
    ctx.lineWidth = Math.max(3, W * 0.012);
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 4; i++) {
      const f = (i / 4 + offset) % 1;
      const p = interpolarPonto(pontos, f);
      const ahead = interpolarPonto(pontos, Math.min(1, f + 0.035));

      const angulo = Math.atan2(ahead.y - p.y, ahead.x - p.x) + Math.PI / 2;
      const tamanho = W * 0.075;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angulo);

      ctx.fillStyle = '#00dfff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00eaff';
      ctx.shadowBlur = 15;

      ctx.beginPath();
      ctx.moveTo(0, -tamanho * 0.6);
      ctx.lineTo(tamanho * 0.45, tamanho * 0.25);
      ctx.lineTo(0, tamanho * 0.04);
      ctx.lineTo(-tamanho * 0.45, tamanho * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }

  window.addEventListener('load', instalar, { once: true });
})();
