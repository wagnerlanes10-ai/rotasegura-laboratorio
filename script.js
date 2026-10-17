// Inicialização do Mapa Leaflet
let mapa;
let tileLayerAtual;
let userLat = -22.9068; // Exemplo inicial (Rio de Janeiro / região)
let userLng = -43.1729;

function inicializarApp() {
  // Cria o mapa centrado nas coordenadas
  mapa = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([userLat, userLng], 15);

  // Aplica o tema inicial (Dia/Noite com base na hora)
  atualizarTemaDiaNoite();

  // Ativar Geolocalização Real do Utilizador se disponível
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        
        // Se estiver em modo de navegação, atualiza a posição do mapa
        if (document.body.classList.contains('perspective-mode')) {
          mapa.panTo([userLat, userLng]);
        }

        // Verifica o clima com base na nova posição
        checarChuvaEAtivarOverlay(userLat, userLng);
      },
      (error) => {
        console.warn("Geolocalização não disponível ou negada. A usar posição padrão.", error);
      },
      { enableHighAccuracy: true }
    );
  }

  // Configurar Botão Recentralizar (Ativa Perspetiva 3D)
  const btnRecentralizar = document.getElementById('btn-recentralizar');
  if (btnRecentralizar) {
    btnRecentralizar.addEventListener('click', () => {
      // Ativa a perspetiva 3D no CSS
      document.body.classList.add('perspective-mode');
      
      // Centraliza suavemente no local atual
      mapa.flyTo([userLat, userLng], 17, {
        animate: true,
        duration: 1.0
      });
    });
  }

  // Se o utilizador mexer/arrastar o mapa manualmente, remove a perspetiva 3D para visão livre
  mapa.on('dragstart', () => {
    document.body.classList.remove('perspective-mode');
  });

  // Verificação inicial de chuva
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
      // Códigos de meteorologia associados a chuva, chuvisco ou trovoada
      const isRaining = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;

      if (isRaining) {
        rainOverlay.classList.add('active');
      } else {
        rainOverlay.classList.remove('active');
      }
    }
  } catch (error) {
    console.error("Erro ao verificar o estado do tempo para a chuva:", error);
  }
}

// ==========================================
// ALTERNÂNCIA DIA / NOITE E MAPAS BASE
// ==========================================
function atualizarTemaDiaNoite() {
  const horaAtual = new Date().getHours();
  // Considera noite das 18h às 06h
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

  // URLs de mapas elegantes (CartoDB Dark para Noite, CartoDB Voyager para Dia)
  const urlNight = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const urlDay = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const novaUrl = tipo === 'night' ? urlNight : urlDay;

  if (tileLayerAtual) {
    mapa.removeLayer(tileLayerAtual);
  }

  tileLayerAtual = L.tileLayer(novaUrl, {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(mapa);
}

// Executar inicialização assim que a página carregar
window.addEventListener('DOMContentLoaded', inicializarApp);
