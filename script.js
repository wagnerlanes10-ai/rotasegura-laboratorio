var mapa;
var tileLayerAtual;
var routeLayer = null;
var userLat = -22.9068;
var userLng = -43.1729;
var modoNavegacaoAtivo = false;

function inicializarApp() {
  try {
    // 1. Inicializa o mapa
    mapa = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([userLat, userLng], 15);

    mudarTileMap();

    // 2. Garante o carregamento completo dos tiles ajustando o tempo para 600ms
    setTimeout(function() {
      if (mapa) {
        mapa.invalidateSize();
      }
    }, 600);

    window.onresize = function() {
      if (mapa) {
        mapa.invalidateSize();
      }
    };

    // 3. GPS em tempo real
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        function(position) {
          userLat = position.coords.latitude;
          userLng = position.coords.longitude;
          
          if (modoNavegacaoAtivo && mapa) {
            mapa.panTo([userLat, userLng]);
          }
        },
        function(err) {
          console.warn("GPS Indisponível", err);
        },
        { enableHighAccuracy: true }
      );
    }

    // 4. Botão de Pesquisa de Rota
    var btnSearch = document.getElementById('btn-search-route');
    var destInput = document.getElementById('destination-input');

    if (btnSearch && destInput) {
      btnSearch.addEventListener('click', function() {
        var destino = destInput.value.trim();
        if (destino) {
          calcularEDesenharRota(destino);
        } else {
          alert("Por favor, digite um destino.");
        }
      });

      destInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          btnSearch.click();
        }
      });
    }

    // 5. Botão Seguir GPS
    var btnRecentralizar = document.getElementById('btn-recentralizar');
    if (btnRecentralizar) {
      btnRecentralizar.addEventListener('click', function() {
        modoNavegacaoAtivo = !modoNavegacaoAtivo;

        if (modoNavegacaoAtivo) {
          btnRecentralizar.classList.add('active-nav');
          btnRecentralizar.innerHTML = '<span>📍</span> A seguir GPS...';
          if (mapa) {
            mapa.flyTo([userLat, userLng], 17, { animate: true, duration: 1.0 });
          }
        } else {
          btnRecentralizar.classList.remove('active-nav');
          btnRecentralizar.innerHTML = '<span>🧭</span> Seguir GPS';
        }

        setTimeout(function() {
          if (mapa) mapa.invalidateSize();
        }, 300);
      });
    }

    if (mapa) {
      mapa.on('dragstart', function() {
        if (modoNavegacaoAtivo) {
          modoNavegacaoAtivo = false;
          var btn = document.getElementById('btn-recentralizar');
          if (btn) {
            btn.classList.remove('active-nav');
            btn.innerHTML = '<span>🧭</span> Seguir GPS';
          }
        }
      });
    }

  } catch (e) {
    console.error("Erro na inicialização:", e);
  }
}

// Função para Geocodificar e Calcular a Rota
async function calcularEDesenharRota(queryDestino) {
  try {
    var geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryDestino)}`);
    var geoData = await geoRes.json();

    if (!geoData || geoData.length === 0) {
      alert("Destino não encontrado. Tente ser mais específico.");
      return;
    }

    var destLat = parseFloat(geoData[0].lat);
    var destLng = parseFloat(geoData[0].lon);

    var osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    var routeRes = await fetch(osrmUrl);
    var routeData = await routeRes.json();

    if (routeData.routes && routeData.routes.length > 0) {
      var route = routeData.routes[0];
      var coords = route.geometry.coordinates.map(function(c) {
        return [c[1], c[0]];
      });

      if (routeLayer) {
        mapa.removeLayer(routeLayer);
      }

      routeLayer = L.polyline(coords, {
        color: '#0066ff',
        weight: 6,
        opacity: 0.85
      }).addTo(mapa);

      mapa.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

      var distanciaKm = (route.distance / 1000).toFixed(1) + ' km';
      var duracaoMin = Math.round(route.duration / 60) + ' min';
      var nomeLocal = geoData[0].display_name.split(',')[0];

      document.querySelector('.nav-details h2').innerText = distanciaKm;
      document.querySelector('.instruction-main').innerText = 'Destino: ' + nomeLocal;
      document.querySelector('.street-name').innerText = 'Tempo estimado: ' + duracaoMin;
      
      document.querySelector('.route-time b').innerText = duracaoMin;
      
      modoNavegacaoAtivo = true;
      var btn = document.getElementById('btn-recentralizar');
      if (btn) {
        btn.classList.add('active-nav');
        btn.innerHTML = '<span>📍</span> A seguir GPS...';
      }

    } else {
      alert("Não foi possível calcular uma rota de carro para este destino.");
    }

  } catch (e) {
    console.error("Erro ao processar a rota:", e);
    alert("Ocorreu um erro ao calcular a rota. Verifique a sua ligação.");
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

window.onload = inicializarApp;
