let map;
let userPos = null;
let currentRoute = null;
let userMarker = null;
let isFollowingUser = true;

// Inicia o mapa com o estilo OpenFreeMap (Gratuito)
map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-43.1729, -22.9068],
  zoom: 14,
  pitch: 0,
  bearing: 0,
  attributionControl: false
});

map.on('load', () => {
  // Adiciona o marcador do usuário
  const el = document.createElement('div');
  el.className = 'user-marker';
  el.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="#34d399" style="filter: drop-shadow(0 0 8px rgba(52,211,153,0.8)); transform-origin: center; transition: transform 0.3s;">
    <path d="M12 2L22 20L12 17L2 20L12 2Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
  
  userMarker = new maplibregl.Marker({ element: el }).setLngLat([-43.1729, -22.9068]).addTo(map);
});

// GPS Tracking
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    userPos = [lon, lat];
    
    if (userMarker) userMarker.setLngLat(userPos);
    
    if (isFollowingUser) {
      map.easeTo({ center: userPos, zoom: 16, duration: 1000 });
    }
    
    // Atualiza a velocidade e o HUD (definido no script2)
    if (typeof updateHudSpeed === 'function') {
      updateHudSpeed(pos.coords.speed ? pos.coords.speed * 3.6 : 0);
    }
    
    // Atualiza a direção da seta
    if (pos.coords.heading && userMarker) {
      const svg = userMarker.getElement().querySelector('svg');
      if (svg) svg.style.transform = `rotate(${pos.coords.heading}deg)`;
    }
  }, err => console.log(err), { enableHighAccuracy: true });
}

function centerOnUser() {
  if (userPos) {
    isFollowingUser = true;
    map.easeTo({ center: userPos, zoom: 17, pitch: 0, duration: 1000 });
    document.getElementById('bottomPanel').classList.remove('active');
    document.getElementById('navCard').style.display = 'none';
  }
}

// Calcula Rota
async function calcRoute() {
  const q = document.getElementById('destInput').value.trim();
  if (!q || !userPos) return showToast('Destino ou GPS indisponível');
  
  showToast('Buscando destino...');
  
  try {
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`);
    const gData = await geo.json();
    if (!gData.length) return showToast('Destino não encontrado');
    
    const destPos = [parseFloat(gData[0].lon), parseFloat(gData[0].lat)];
    
    const rt = await fetch(`https://router.project-osrm.org/route/v1/driving/${userPos[0]},${userPos[1]};${destPos[0]},${destPos[1]}?overview=full&geometries=geojson&steps=true`);
    const rData = await rt.json();
    
    if (rData.code !== 'Ok') return showToast('Rota não encontrada');
    
    currentRoute = rData.routes[0];
    
    // Desenha a linha no mapa
    if (map.getSource('route')) {
      map.getSource('route').setData({ type: 'Feature', geometry: currentRoute.geometry });
    } else {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRoute.geometry } });
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#34d399', 'line-width': 6, 'line-opacity': 0.9 }
      });
    }
    
    // Ajusta a câmera para ver a rota toda
    const bounds = currentRoute.geometry.coordinates.reduce((acc, coord) => {
      return acc.extend(coord);
    }, new maplibregl.LngLatBounds(currentRoute.geometry.coordinates[0], currentRoute.geometry.coordinates[0]));
    
    map.fitBounds(bounds, { padding: 50, pitch: 0, bearing: 0 });
    isFollowingUser = false;
    
    // Atualiza a UI
    const dist = (currentRoute.distance / 1000).toFixed(1).replace('.', ',');
    const dur = Math.round(currentRoute.duration / 60);
    
    document.getElementById('bottomPanel').classList.add('active');
    document.getElementById('distChip').textContent = dist + ' km';
    document.getElementById('timeChip').textContent = dur + ' min';
    document.getElementById('riskChip').textContent = '0';
    
    document.getElementById('navCard').style.display = 'flex';
    document.getElementById('navCardDistance').textContent = dist + ' km';
    document.getElementById('navCardInstruction').textContent = 'Rota calculada';
    
    // Configura o HUD
    if (typeof setupHudRoute === 'function') setupHudRoute(currentRoute);
    
    showToast('Rota calculada!');
  } catch (e) {
    showToast('Erro ao calcular rota');
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
