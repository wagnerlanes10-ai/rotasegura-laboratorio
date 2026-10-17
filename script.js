let mapa;
let tileLayerAtual;
let userLat = -22.9068; 
let userLng = -43.1729;

function inicializarApp() {
  mapa = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([userLat, userLng], 15);

  atualizarTemaDiaNoite();

  // Força o mapa a recarregar todos os tiles visíveis
  setTimeout(() => {
    if (mapa) {
      mapa.invalidateSize();
    }
  }, 300);

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        if (document.body.classList.contains('perspective-mode')) {
          mapa.panTo([userLat, userLng]);
        }
        checarChuvaEAtivarOverlay(userLat, userLng);
      },
      (error) => {
        console.warn("Geolocalização não disponível.", error);
      },
      { enableHighAccuracy: true }
    );
  }

  const btnRecentralizar = document.getElementById('btn-recentralizar');
  if (btnRecentralizar) {
    btnRecentralizar.addEventListener('click', () => {
      document.body.classList.add('perspective-mode');
      
      setTimeout(() => {
        if (mapa) mapa.invalidateSize();
      }, 300);

      mapa.flyTo([userLat, userLng], 17, {
        animate: true,
        duration: 1.0
      });
    });
  }

  mapa.on('dragstart', () => {
    document.body.classList.remove('perspective-mode');
    setTimeout(() => {
      if (mapa) mapa.invalidateSize();
    }, 300);
  });

  checarChuvaEAtivarOverlay(userLat, userLng);
}

async function checarChuvaEAtivarOverlay(lat, lng) {
  const rainOverlay = document.getElementById('rainOverlay');
  if (!rainOverlay) return;

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
    const data = await response.json();
    
    if (data && data.current_weather) {
      const weatherCode = data.current_weather.weathercode;
      const isRaining = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;

      if (isRaining) {
        rainOverlay.classList.add('active');
      } else {
        rainOverlay.classList.remove('active');
      }
    }
  } catch (error) {
    console.error("Erro ao verificar chuva:", error);
  }
}

function atualizarTemaDiaNoite() {
  const horaAtual = new Date().getHours();
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

window.addEventListener('DOMContentLoaded', inicializarApp);
