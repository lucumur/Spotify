const TYPE_COLORS = {
  Sonido: '#bcff3c',
  'Atmósfera': '#a98bff',
  'Emoción': '#ff5c8a',
  Escena: '#5ce1e6',
  Álbum: '#ffba49',
  Artista: '#ffba49',
  Historia: '#ff7a5c',
  Narrativa: '#ff5c8a',
  'Producción': '#bcff3c',
  'Época': '#5ce1e6',
  Influencia: '#a98bff'
};

const state = {
  data: null,
  genre: 'Todos',
  query: '',
  selectedId: null,
  transform: { x: 0, y: 0, scale: 1 },
  draggingNode: null,
  panning: null,
  animationFrame: null
};

const els = {
  svg: document.querySelector('#graph'),
  viewport: document.querySelector('#viewport'),
  links: document.querySelector('#links'),
  nodes: document.querySelector('#nodes'),
  network: document.querySelector('#network'),
  filters: document.querySelector('#genreFilters'),
  count: document.querySelector('#resultCount'),
  search: document.querySelector('#search'),
  details: document.querySelector('#details'),
  template: document.querySelector('#detailsTemplate'),
  legend: document.querySelector('#legend'),
  empty: document.querySelector('#emptyState')
};

const normalize = (text) => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const svgElement = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
};

async function init() {
  try {
    const response = await fetch('songs.json');
    if (!response.ok) throw new Error(`No se pudieron cargar los datos (${response.status})`);
    state.data = await response.json();
    seedPositions();
    buildFilters();
    buildLegend();
    bindControls();
    applyFilters();
    resetView(false);
  } catch (error) {
    els.empty.hidden = false;
    els.empty.querySelector('span').textContent = 'No se pudo abrir la red';
    els.empty.querySelector('p').textContent = error.message;
  }
}

function seedPositions() {
  const width = Math.max(els.network.clientWidth, 700);
  const height = Math.max(els.network.clientHeight, 500);
  state.data.songs.forEach((song, index) => {
    const angle = (index / state.data.songs.length) * Math.PI * 2;
    const radius = Math.min(width, height) * (0.22 + (index % 3) * 0.035);
    song.x = width / 2 + Math.cos(angle) * radius;
    song.y = height / 2 + Math.sin(angle) * radius;
    song.vx = 0;
    song.vy = 0;
  });
}

function buildFilters() {
  const genres = ['Todos', ...new Set(state.data.songs.map(song => song.genre))];
  genres.forEach(genre => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button${genre === state.genre ? ' active' : ''}`;
    button.textContent = genre;
    button.addEventListener('click', () => {
      state.genre = genre;
      [...els.filters.children].forEach(item => item.classList.toggle('active', item === button));
      applyFilters();
    });
    els.filters.append(button);
  });
}

function buildLegend() {
  const types = [...new Set(state.data.links.map(link => link.type))];
  types.slice(0, 5).forEach(type => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.style.setProperty('--legend-color', TYPE_COLORS[type] || '#888');
    item.innerHTML = `<i></i>${type}`;
    els.legend.append(item);
  });
}

function bindControls() {
  let debounce;
  els.search.addEventListener('input', event => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = normalize(event.target.value.trim());
      applyFilters();
    }, 100);
  });

  document.querySelector('#resetView').addEventListener('click', () => resetView());
  document.querySelector('#zoomIn').addEventListener('click', () => zoomBy(1.2));
  document.querySelector('#zoomOut').addEventListener('click', () => zoomBy(0.82));

  els.svg.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = els.svg.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  els.svg.addEventListener('pointerdown', startPan);
  window.addEventListener('pointermove', movePointer);
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('resize', () => renderGraph());
}

function getVisibleData() {
  const songs = state.data.songs.filter(song => {
    const genreMatch = state.genre === 'Todos' || song.genre === state.genre;
    const haystack = normalize(`${song.title} ${song.artist} ${song.album}`);
    return genreMatch && (!state.query || haystack.includes(state.query));
  });
  const ids = new Set(songs.map(song => song.id));
  const links = state.data.links.filter(link => ids.has(link.source) && ids.has(link.target));
  return { songs, links, ids };
}

function applyFilters() {
  const visible = getVisibleData();
  els.count.textContent = `${visible.songs.length} ${visible.songs.length === 1 ? 'canción' : 'canciones'}`;
  els.empty.hidden = visible.songs.length > 0;

  if (state.selectedId && !visible.ids.has(state.selectedId)) {
    state.selectedId = null;
    showEmptyDetails();
  }

  renderGraph(visible);
  startSimulation();
}

function renderGraph(visible = getVisibleData()) {
  els.links.replaceChildren();
  els.nodes.replaceChildren();
  const songsById = new Map(state.data.songs.map(song => [song.id, song]));

  visible.links.forEach(link => {
    const line = svgElement('line', { class: 'link', 'data-source': link.source, 'data-target': link.target });
    line.style.setProperty('--link-color', TYPE_COLORS[link.type] || '#aaa');
    link.element = line;
    els.links.append(line);
  });

  visible.songs.forEach(song => {
    const group = svgElement('g', {
      class: `node${state.selectedId === song.id ? ' selected' : ''}`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${song.title}, ${song.artist}, ${song.year}`,
      'data-id': song.id
    });
    group.style.setProperty('--node-color', song.color);

    const halo = svgElement('circle', { class: 'halo', r: 21 });
    const core = svgElement('circle', { class: 'core', r: 11, fill: song.color });
    const titleWidth = Math.min(Math.max(song.title.length * 6.2, 58), 150);
    const labelBg = svgElement('rect', { class: 'label-bg', x: 17, y: -16, width: titleWidth + 12, height: 33, rx: 7 });
    const title = svgElement('text', { x: 23, y: -2 });
    title.textContent = song.title.length > 23 ? `${song.title.slice(0, 22)}…` : song.title;
    const artist = svgElement('text', { class: 'artist-label', x: 23, y: 11 });
    artist.textContent = song.artist;
    group.append(halo, core, labelBg, title, artist);

    group.addEventListener('click', event => {
      event.stopPropagation();
      selectSong(song.id);
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectSong(song.id);
      }
    });
    group.addEventListener('pointerdown', event => startNodeDrag(event, song));
    song.element = group;
    els.nodes.append(group);
  });

  state.data.links.forEach(link => {
    link.sourceNode = songsById.get(link.source);
    link.targetNode = songsById.get(link.target);
  });
  updatePositions();
  updateSelectionStyles();
}

function startSimulation() {
  cancelAnimationFrame(state.animationFrame);
  let ticks = 0;

  const tick = () => {
    const { songs, links } = getVisibleData();
    const width = els.network.clientWidth;
    const height = els.network.clientHeight;

    for (let i = 0; i < songs.length; i++) {
      for (let j = i + 1; j < songs.length; j++) {
        const a = songs[i];
        const b = songs[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distanceSq = Math.max(dx * dx + dy * dy, 80);
        const distance = Math.sqrt(distanceSq);
        const force = 1300 / distanceSq;
        dx /= distance;
        dy /= distance;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    links.forEach(link => {
      const a = link.sourceNode;
      const b = link.targetNode;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = (distance - 145) * 0.0025;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    });

    songs.forEach(song => {
      if (state.draggingNode !== song) {
        song.vx += (width / 2 - song.x) * 0.00035;
        song.vy += (height / 2 - song.y) * 0.00035;
        song.vx *= 0.91;
        song.vy *= 0.91;
        song.x = Math.max(45, Math.min(width - 180, song.x + song.vx));
        song.y = Math.max(35, Math.min(height - 35, song.y + song.vy));
      }
    });

    updatePositions();
    ticks += 1;
    if (ticks < 300) state.animationFrame = requestAnimationFrame(tick);
  };
  state.animationFrame = requestAnimationFrame(tick);
}

function updatePositions() {
  const visible = getVisibleData();
  visible.songs.forEach(song => song.element?.setAttribute('transform', `translate(${song.x}, ${song.y})`));
  visible.links.forEach(link => {
    if (!link.element) return;
    link.element.setAttribute('x1', link.sourceNode.x);
    link.element.setAttribute('y1', link.sourceNode.y);
    link.element.setAttribute('x2', link.targetNode.x);
    link.element.setAttribute('y2', link.targetNode.y);
  });
}

function selectSong(id) {
  state.selectedId = id;
  const song = state.data.songs.find(item => item.id === id);
  const related = state.data.links
    .filter(link => link.source === id || link.target === id)
    .map(link => ({
      link,
      song: state.data.songs.find(item => item.id === (link.source === id ? link.target : link.source))
    }));

  const fragment = els.template.content.cloneNode(true);
  const article = fragment.querySelector('.song-details');
  article.style.setProperty('--song-color', song.color);
  fragment.querySelector('.song-genre').textContent = song.genre;
  fragment.querySelector('.song-title').textContent = song.title;
  fragment.querySelector('.song-artist').textContent = song.artist;
  fragment.querySelector('.song-album').textContent = song.album;
  fragment.querySelector('.song-year').textContent = song.year;
  const spotify = fragment.querySelector('.spotify-button');
  spotify.href = song.spotifyUrl;
  spotify.setAttribute('aria-label', `Abrir ${song.title} en Spotify`);
  fragment.querySelector('.connection-count').textContent = `${related.length} ${related.length === 1 ? 'vínculo' : 'vínculos'}`;

  const list = fragment.querySelector('.connection-list');
  related.forEach(({ link, song: other }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'connection-item';
    button.style.setProperty('--connection-color', TYPE_COLORS[link.type] || other.color);
    button.innerHTML = `
      <span class="connection-swatch"></span>
      <span class="connection-copy"><strong>${other.title}</strong><span>${other.artist}</span></span>
      <span class="connection-type">${link.type}</span>
      <span class="connection-reason">${link.reason}</span>
    `;
    button.addEventListener('click', () => selectSong(other.id));
    list.append(button);
  });

  els.details.replaceChildren(fragment);
  els.details.scrollTop = 0;
  updateSelectionStyles();
}

function updateSelectionStyles() {
  document.querySelectorAll('.node').forEach(node => {
    const id = node.dataset.id;
    const related = !state.selectedId || state.data.links.some(link =>
      (link.source === state.selectedId && link.target === id) ||
      (link.target === state.selectedId && link.source === id)
    );
    node.classList.toggle('selected', id === state.selectedId);
    node.classList.toggle('dimmed', Boolean(state.selectedId) && id !== state.selectedId && !related);
  });

  document.querySelectorAll('.link').forEach(line => {
    const active = state.selectedId && (line.dataset.source === state.selectedId || line.dataset.target === state.selectedId);
    line.classList.toggle('active', Boolean(active));
    line.classList.toggle('dimmed', Boolean(state.selectedId) && !active);
  });
}

function showEmptyDetails() {
  els.details.innerHTML = `
    <div class="details-empty">
      <div class="pulse-orbit" aria-hidden="true"><span></span></div>
      <p class="eyebrow">EXPLORA LA RED</p>
      <h2>Elige una canción</h2>
      <p>Descubre por qué está conectada con las demás y sigue cada enlace en Spotify.</p>
    </div>`;
}

function startNodeDrag(event, song) {
  event.stopPropagation();
  event.preventDefault();
  state.draggingNode = song;
  song.vx = 0;
  song.vy = 0;
  els.svg.setPointerCapture?.(event.pointerId);
}

function startPan(event) {
  if (event.target.closest?.('.node')) return;
  state.panning = { startX: event.clientX, startY: event.clientY, x: state.transform.x, y: state.transform.y };
  els.svg.classList.add('panning');
}

function movePointer(event) {
  if (state.draggingNode) {
    const rect = els.svg.getBoundingClientRect();
    state.draggingNode.x = (event.clientX - rect.left - state.transform.x) / state.transform.scale;
    state.draggingNode.y = (event.clientY - rect.top - state.transform.y) / state.transform.scale;
    updatePositions();
  } else if (state.panning) {
    state.transform.x = state.panning.x + event.clientX - state.panning.startX;
    state.transform.y = state.panning.y + event.clientY - state.panning.startY;
    applyTransform();
  }
}

function endPointer() {
  state.draggingNode = null;
  state.panning = null;
  els.svg.classList.remove('panning');
}

function zoomBy(factor, centerX = els.network.clientWidth / 2, centerY = els.network.clientHeight / 2) {
  const oldScale = state.transform.scale;
  const newScale = Math.max(0.55, Math.min(2.4, oldScale * factor));
  state.transform.x = centerX - ((centerX - state.transform.x) / oldScale) * newScale;
  state.transform.y = centerY - ((centerY - state.transform.y) / oldScale) * newScale;
  state.transform.scale = newScale;
  applyTransform();
}

function resetView(animate = true) {
  state.transform = { x: 0, y: 0, scale: 1 };
  els.viewport.style.transition = animate ? 'transform 240ms ease' : 'none';
  applyTransform();
  setTimeout(() => { els.viewport.style.transition = 'none'; }, 250);
}

function applyTransform() {
  const { x, y, scale } = state.transform;
  els.viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
}

init();

