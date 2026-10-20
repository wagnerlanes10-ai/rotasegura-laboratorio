
/* ==========================================
   RotaSegura — Modo Para-brisa
   Gotas animadas + limpador + botão liga/desliga
   ========================================== */
(() => {
  'use strict';

  let ativo = false;
  let limpadorAtivo = false;
  let animacao = 0;
  let canvas, ctx, botao;
  let gotas = [];
  let largura = 0;
  let altura = 0;
  let ultimoTempo = 0;
  let proximaLimpeza = 0;
  let progressoLimpador = -1;

  function criarInterface() {
    if (document.getElementById('rsWindshield')) return;

    canvas = document.createElement('canvas');
    canvas.id = 'rsWindshield';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '650',
      pointerEvents: 'none',
      display: 'none'
    });
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    botao = document.createElement('button');
    botao.id = 'rsWindshieldToggle';
    botao.type = 'button';
    botao.textContent = '💧 Modo Para-brisa';
    botao.setAttribute('aria-pressed', 'false');

    Object.assign(botao.style, {
      position: 'fixed',
      right: '14px',
      bottom: '18px',
      zIndex: '2600',
      padding: '12px 16px',
      borderRadius: '24px',
      border: '1px solid #00bfff',
      background: 'rgba(3, 18, 40, .94)',
      color: '#f4faff',
      font: '600 14px system-ui, sans-serif',
      boxShadow: '0 0 14px rgba(0,191,255,.28)',
      cursor: 'pointer'
    });

    botao.addEventListener('click', alternar);
    document.body.appendChild(botao);

    window.addEventListener('resize', redimensionar);
    redimensionar();
  }

  function redimensionar() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    largura = window.innerWidth;
    altura = window.innerHeight;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    criarGotas();
  }

  function criarGotas() {
    gotas = [];
    const quantidade = Math.min(
      150,
      Math.max(45, Math.round(largura * altura / 11000))
    );

    for (let i = 0; i < quantidade; i++) {
      gotas.push({
        x: Math.random() * largura,
        y: Math.random() * altura,
        raio: 0.8 + Math.random() * 2.2,
        velocidade: 12 + Math.random() * 32,
        deriva: -5 + Math.random() * 10,
        opacidade: 0.12 + Math.random() * 0.3,
        limpa: 0
      });
    }
  }

  function alternar() {
    ativo = !ativo;

    if (ativo) {
      canvas.style.display = 'block';
      botao.textContent = '💧 Desligar Para-brisa';
      botao.setAttribute('aria-pressed', 'true');
      proximaLimpeza = performance.now() + 4500;
      ultimoTempo = 0;
      animacao = requestAnimationFrame(desenhar);
    } else {
      canvas.style.display = 'none';
      botao.textContent = '💧 Modo Para-brisa';
      botao.setAttribute('aria-pressed', 'false');
      limpadorAtivo = false;
      progressoLimpador = -1;
      cancelAnimationFrame(animacao);
      ctx.clearRect(0, 0, largura, altura);
    }
  }

  function desenhar(tempo) {
    if (!ativo) return;

    const dt = ultimoTempo
      ? Math.min((tempo - ultimoTempo) / 1000, 0.04)
      : 0.016;
    ultimoTempo = tempo;

    ctx.clearRect(0, 0, largura, altura);

    // Reflexo muito discreto nas bordas do vidro
    const gradiente = ctx.createLinearGradient(0, 0, largura, altura);
    gradiente.addColorStop(0, 'rgba(100,190,255,.035)');
    gradiente.addColorStop(0.5, 'rgba(100,190,255,0)');
    gradiente.addColorStop(1, 'rgba(100,190,255,.045)');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, largura, altura);

    if (tempo >= proximaLimpeza && !limpadorAtivo) {
      limpadorAtivo = true;
      progressoLimpador = 0;
    }

    for (const g of gotas) {
      g.y += g.velocidade * dt;
      g.x += g.deriva * dt;

      if (g.y > altura + 5 || g.x < -5 || g.x > largura + 5) {
        g.x = Math.random() * largura;
        g.y = -5;
        g.limpa = 0;
      }

      // A faixa limpa diminui temporariamente as gotas
      if (g.limpa > 0) g.limpa = Math.max(0, g.limpa - dt);

      const transparência = g.opacidade * (g.limpa > 0 ? 0.12 : 1);

      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.raio * 0.7, g.raio * 1.5, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(205,235,255,${transparência})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(g.x - g.raio * 0.25, g.y - g.raio * 0.4, g.raio * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${transparência * 0.8})`;
      ctx.fill();
    }

    // Limpador visual: arco que atravessa a parte inferior do vidro
    if (limpadorAtivo) {
      progressoLimpador += dt * 1.45;
      const p = progressoLimpador;

      if (p >= 1) {
        limpadorAtivo = false;
        progressoLimpador = -1;
        proximaLimpeza = tempo + 6500;

        // Gotas voltam gradualmente após a passagem
        for (const g of gotas) {
          if (g.y > altura * 0.35) g.limpa = 1.2;
        }
      } else {
        const inicio = largura * 0.08;
        const fim = largura * 0.92;
        const x = inicio + (fim - inicio) * p;
        const y = altura * 0.80 - Math.sin(p * Math.PI) * altura * 0.28;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = '#8beaff';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(190,240,255,.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(largura * 0.5, altura * 0.94);
        ctx.quadraticCurveTo(largura * 0.34, altura * 0.88, x, y);
        ctx.stroke();
        ctx.restore();
      }
    }

    animacao = requestAnimationFrame(desenhar);
  }

  function iniciar() {
    criarInterface();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
