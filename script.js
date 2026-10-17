// ==========================================
// RotaSegura - Lógica Principal (script.js)
// ==========================================

let mapa;
let tileLayerAtual;
let userLat = -22.9068; // Localização inicial padrão
let userLng = -43.1729;

function inicializarApp() {
  // 1. Cria a instância do mapa Leaflet
  mapa = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([userLat, userLng], 15);

  // 2. Aplica o tema visual adequado ao horário (Dia ou Noite)
  atualizarTemaDiaNoite();

  // 3. Força o recalculo do tamanho do mapa para evitar tela preta
  setTimeout(() => {
    if (mapa) {
      mapa.invalidateSize();
    }
  }, 250);

  // 4. Ativa o acompanhamento do GPS real
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;

        // Em modo de navegação, foca no utilizador
        if (document.body.classList.contains('perspective-mode')) {
          mapa.panTo([userLat, userLng]);
        }

        // Atualiza a verificação de chuva para a nova posição
        checarChuvaEAtivarOverlay(userLat, userLng);
      },
      (error) => {
        console.warn("Geolocalização não disponível. Usando posição padrão.", error);
      },
      { enableHighAccuracy: true }
    );
  }

  // 5. Configura o botão Recentralizar (Ativa Perspetiva 3D à frente)
  const btnRecentralizar = document.getElementById('btn-recentralizar');
  if (btnRecentralizar) {
    btnRecentralizar.addEventListener('click', () => {
      document.body.classList.add('perspective-mode');
      mapa.flyTo([userLat, userLng], 17, {
        animate: true,
        duration: 1.0
      });
    });
  }

  // 6. Ao arrastar o mapa manualmente, sai do modo perspetiva (Modo Livre)
  mapa.on('dragstart', () => {
    document.body.classList.remove('perspective-mode');
  });

  // 7. Verificação meteorológica inicial
  checarChuvaEAtivarOverlay(userLat, userLng);
}

// ==========================================
// DETEÇÃO DE CHUVA (Open-Meteo API Gratuita)
// ==========================================
async function checarChuvaEAtivarOverlay(lat, lng) {
  const rainOverlay = document.getElementById('rainOverlay');
  if (!rainOverlay) return;

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
    const data = await response.json();

    if (data && data.current_weather) {
      const weatherCode = data.current_weather.weathercode;
      // Códigos Open-Meteo para chuva / trovoada (51 a 67, 80 a 82, 95+)
      const isRaining = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;

      if (isRaining) {
        rainOverlay.classList.add('active');
      } else {
        rainOverlay.classList.remove('active');
      }
    }
  } catch (error) {
    console.error("Erro ao verificar condições meteorológicas:", error);
  }
}

// ==========================================
// TEMA AUTOMÁTICO DIA E NOITE
// ==========================================
function atualizarTemaDiaNoite() {
  const horaAtual = new Date().getHours();
  // Modo noite entre as 18:00 e as 06:00
  const eNoite = horaAtual >= 18 || horaAtual < 6;

  if (eNoite) {
    document.body.classList.add('night-theme');
    document.body.classList.remove('day-theme');
    mudarTileMap('night');
  } else {
    document.body.classList.add('day-theme');
    document.body.classList.remove('night-theme');
    mudarTileMap('day');
  }
}

function mudarTileMap(tipo) {
  if (!mapa) return;

  // Noite: CartoDB Dark | Dia: OpenStreetMap
  const urlMapa = tipo === 'night' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  if (tileLayerAtual) {
    mapa.removeLayer(tileLayerAtual);
  }

  tileLayerAtual = L.tileLayer(urlMapa, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '© OpenStreetMap & CartoDB'
  }).addTo(mapa);
}

// Inicializar quando o DOM estiver pronto
window.addEventListener('DOMContentLoaded', inicializarApp);
