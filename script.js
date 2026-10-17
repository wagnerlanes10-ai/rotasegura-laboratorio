var mapa;
var tileLayerAtual;
var userLat = -22.9068;
var userLng = -43.1729;
var modoNavegacaoAtivo = false; // Estado para controlar se o mapa segue o GPS

function inicializarApp() {
  try {
    // 1. Inicializa o mapa
    mapa = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([userLat, userLng], 15);

    mudarTileMap();

    // 2. Garante o recálculo correto do tamanho na janela
    setTimeout(function() {
      if (mapa) mapa.invalidateSize();
    }, 400);

    window.onresize = function() {
      if (mapa) mapa.invalidateSize();
    };

    // 3. Monitorização do GPS em tempo real
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        function(position) {
          userLat = position.coords.latitude;
          userLng = position.coords.longitude;
          
          // Se o botão de navegação estiver ativo, o mapa centra-se automaticamente no utilizador
          if (modoNavegacaoAtivo && mapa) {
            mapa.panTo([userLat, userLng]);
          }
        },
        function(err) {
          console.warn("GPS Indisponível ou sem permissão", err);
        },
        { enableHighAccuracy: true }
      );
    }

    // 4. Configuração do Botão de Navegação / Seguir GPS
    var btnRecentralizar = document.getElementById('btn-recentralizar');
    if (btnRecentralizar) {
      btnRecentralizar.addEventListener('click', function() {
        modoNavegacaoAtivo = !modoNavegacaoAtivo; // Alterna o estado

        if (modoNavegacaoAtivo) {
          btnRecentralizar.classList.add('active-nav');
          btnRecentralizar.innerHTML = '<span>📍</span> A seguir GPS...';
          if (mapa) {
            mapa.flyTo([userLat, userLng], 17, { animate: true, duration: 1.0 });
          }
        } else {
          btnRecentralizar.classList.remove('active-nav');
          btnRecentralizar.innerHTML = '<span>🧭</span> Navegar / Seguir GPS';
        }

        setTimeout(function() {
          if (mapa) mapa.invalidateSize();
        }, 300);
      });
    }

    // Se o utilizador mexer manualmente no mapa, desativa o modo de seguimento automático
    if (mapa) {
      mapa.on('dragstart', function() {
        if (modoNavegacaoAtivo) {
          modoNavegacaoAtivo = false;
          var btn = document.getElementById('btn-recentralizar');
          if (btn) {
            btn.classList.remove('active-nav');
            btn.innerHTML = '<span>🧭</span> Navegar / Seguir GPS';
          }
        }
      });
    }

  } catch (e) {
    console.error("Erro na inicialização do script:", e);
  }
}

function mudarTileMap() {
  if (!mapa) return;
  var url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  if (tileLayerAtual) {
    mapa.removeLayer(tileLayerAtual);
  }

  tileLayerAtual = L.tileLayer(url, {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapa);
}

// Inicia assim que a página estiver carregada
window.onload = inicializarApp;
