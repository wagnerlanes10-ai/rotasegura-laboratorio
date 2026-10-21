
/* =========================================================
   RotaSegura — script3.js
   Efeito de chuva no para-brisa
   Modos: auto / on / off
   ========================================================= */

(() => {
  'use strict';

  const STORAGE_KEY = 'rs_rain_mode';
  const VALID_MODES = ['auto', 'on', 'off'];

  let rainMode = 'auto';
  let rainDetected = false;
  let rainCanvas = null;
  let rainCtx = null;
  let animationId = null;
  let drops = [];
  let width = 0;
  let height = 0;
  let lastFrame = 0;

  const MAX_DROPS = 100;
  const FRAME_INTERVAL = 1000 / 30;

  // ---------------------------------------------------------
  // Estado e configuração
  // ---------------------------------------------------------

  function loadRainMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (VALID_MODES.includes(saved)) {
        rainMode = saved;
      }
    } catch (error) {
      rainMode = 'auto';
    }
  }

  function saveRainMode() {
    try {
      localStorage.setItem(STORAGE_KEY, rainMode);
    } catch (error) {
      // O efeito continua funcionando mesmo sem armazenamento.
    }
  }

  function isWindshieldVisible() {
    const hud = document.getElementById('hud');

    if (!hud) return false;

    const style = window.getComputedStyle(hud);

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      hud.offsetWidth > 0 &&
      hud.offsetHeight > 0
    );
  }

  function shouldShowRain() {
    if (rainMode === 'off') return false;
    if (rainMode === 'on') return true;

    // No modo automático, só exibe chuva se outro código
    // informar que a chuva foi confirmada.
    return rainDetected;
  }

  // ---------------------------------------------------------
  // Canvas da chuva
  // ---------------------------------------------------------

  function createRainCanvas() {
    if (rainCanvas) return;

    const hud = document.getElementById('hud');
    if (!hud) return;

    rainCanvas = document.createElement('canvas');
    rainCanvas.id = 'rsRainCanvas';

    Object.assign(rainCanvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '5',
      display: 'block'
    });

    // O HUD recebe o canvas sem bloquear os botões.
    const hudPosition = window.getComputedStyle(hud).position;

    if (hudPosition === 'static') {
      hud.style.position = 'relative';
    }

    hud.appendChild(rainCanvas);

    rainCtx = rainCanvas.getContext('2d');

    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(hud);
      rainCanvas._resizeObserver = observer;
    }

    createDrops();
  }

  function resizeCanvas() {
    if (!rainCanvas) return;

    const hud = document.getElementById('hud');
    if (!hud) return;

    const rect = hud.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);

    rainCanvas.width = Math.round(width * dpr);
    rainCanvas.height = Math.round(height * dpr);

    rainCtx = rainCanvas.getContext('2d');

    if (rainCtx) {
      rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    createDrops();
  }

  function createDrops() {
    if (!width || !height) return;

    drops = [];

    for (let i = 0; i < MAX_DROPS; i++) {
      drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 5 + Math.random() * 17,
        speed: 1.5 + Math.random() * 4,
        drift: -0.5 + Math.random(),
        opacity: 0.12 + Math.random() * 0.32,
        thickness: 0.6 + Math.random() * 1.2
      });
    }
  }

  // ---------------------------------------------------------
  // Desenho das gotas
  // ---------------------------------------------------------

  function drawRain() {
    if (!rainCtx || !rainCanvas) return;

    rainCtx.clearRect(0, 0, width, height);

    for (const drop of drops) {
      rainCtx.beginPath();

      rainCtx.moveTo(drop.x, drop.y);

      rainCtx.lineTo(
        drop.x + drop.drift * 2,
        drop.y + drop.length
      );

      rainCtx.strokeStyle =
        `rgba(155, 220, 255, ${drop.opacity})`;

      rainCtx.lineWidth = drop.thickness;
      rainCtx.lineCap = 'round';
      rainCtx.stroke();

      drop.y += drop.speed;
      drop.x += drop.drift;

      if (drop.y > height + drop.length) {
        drop.y = -drop.length;
        drop.x = Math.random() * width;
      }

      if (drop.x < -10) drop.x = width + 5;
      if (drop.x > width + 10) drop.x = -5;
    }
  }

  // ---------------------------------------------------------
  // Animação
  // ---------------------------------------------------------

  function animate(timestamp) {
    animationId = null;

    if (!shouldShowRain() ||
        !isWindshieldVisible() ||
        document.hidden) {
      stopRainAnimation();
      return;
    }

    if (timestamp - lastFrame >= FRAME_INTERVAL) {
      lastFrame = timestamp;
      drawRain();
    }

    animationId = requestAnimationFrame(animate);
  }

  function startRainAnimation() {
    if (animationId !== null) return;

    createRainCanvas();

    if (!rainCanvas || !rainCtx) return;

    rainCanvas.style.display = 'block';
    lastFrame = 0;

    animationId = requestAnimationFrame(animate);
  }

  function stopRainAnimation() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (rainCtx && rainCanvas) {
      rainCtx.clearRect(0, 0, width, height);
    }

    if (rainCanvas) {
      rainCanvas.style.display = 'none';
    }
  }

  // ---------------------------------------------------------
  // Atualização do efeito
  // ---------------------------------------------------------

  function updateRainVisibility() {
    if (shouldShowRain() &&
        isWindshieldVisible() &&
        !document.hidden) {
      startRainAnimation();
    } else {
      stopRainAnimation();
    }

    updateRainButton();
  }

  function updateRainButton() {
    const button =
      document.getElementById('rainBtn') ||
      document.getElementById('wsBtn');

    if (!button) return;

    const labels = {
      auto: 'Chuva automática',
      on: 'Chuva ligada manualmente',
      off: 'Chuva desligada'
    };

    button.setAttribute(
      'data-rain-mode',
      rainMode
    );

    button.setAttribute(
      'aria-label',
      labels[rainMode]
    );

    button.title =
      labels[rainMode] +
      (rainMode === 'auto'
        ? (rainDetected
            ? ' — chuva confirmada'
            : ' — aguardando confirmação')
        : '');

    button.classList.toggle(
      'rs-rain-active',
      shouldShowRain()
    );
  }

  // ---------------------------------------------------------
  // Controle do usuário
  // Chamado pelo botão do menu
  // ---------------------------------------------------------

  window.toggleRainFromMenu = function () {
    const nextMode = {
      auto: 'on',
      on: 'off',
      off: 'auto'
    };

    rainMode = nextMode[rainMode] || 'auto';

    saveRainMode();
    updateRainVisibility();

    const messages = {
      auto: rainDetected
        ? 'Chuva automática: chuva confirmada.'
        : 'Chuva automática: aguardando confirmação do clima.',
      on: 'Efeito de chuva ligado manualmente.',
      off: 'Efeito de chuva desligado.'
    };

    if (typeof window.toast === 'function') {
      window.toast(messages[rainMode]);
    } else {
      console.info('[RotaSegura]', messages[rainMode]);
    }

    return rainMode;
  };

  // ---------------------------------------------------------
  // Integração com o sistema de clima
  //
  // Outro script pode chamar:
  // window.setRainDetected(true);
  // ou
  // window.setRainDetected(false);
  //
  // true  = chuva confirmada
  // false = chuva não confirmada
  // ---------------------------------------------------------

  window.setRainDetected = function (isRaining) {
    rainDetected = isRaining === true;
    updateRainVisibility();
  };

  // Consulta o modo atual.
  window.getRainMode = function () {
    return rainMode;
  };

  // ---------------------------------------------------------
  // Acompanhar a troca de telas e a visibilidade
  // ---------------------------------------------------------

  document.addEventListener(
    'visibilitychange',
    updateRainVisibility
  );

  window.addEventListener(
    'pageshow',
    updateRainVisibility
  );

  window.addEventListener(
    'pagehide',
    stopRainAnimation
  );

  // Reavalia se o HUD foi mostrado ou ocultado.
  function observeHud() {
    const hud = document.getElementById('hud');

    if (!hud || !window.MutationObserver) return;

    const observer = new MutationObserver(() => {
      updateRainVisibility();
    });

    observer.observe(hud, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // ---------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------

  function initRain() {
    loadRainMode();
    createRainCanvas();
    observeHud();
    updateRainVisibility();

    console.info(
      '[RotaSegura] Controle de chuva iniciado:',
      rainMode
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initRain,
      { once: true }
    );
  } else {
    initRain();
  }
})();
