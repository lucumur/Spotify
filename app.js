const COLORS = {
  song: '#d9d8d3',
  a: '#f4be54',
  ten: '#9d82ff',
  fifty: '#56dfe6',
  unranked: '#6f7279',
  fresh: '#ff6f7d',
  saved: '#b8ff3d',
  release: '#f4be54',
  album: '#9d82ff',
  artist: '#56dfe6',
  genre: '#ff6f7d',
  playlist: '#56dfe6',
  ranking: '#f4be54',
  sibling: '#ff6f7d',
  cousin: '#9d82ff',
  child: '#56dfe6'
};

const state = {
  data: null,
  view: 'intrinsic',
  filter: 'Todos',
  query: '',
  selectedId: null,
  transform: { x: 0, y: 0, scale: 1 },
  panning: null
};

const els = {
  svg: document.querySelector('#graph'),
  viewport: document.querySelector('#viewport'),
  rings: document.querySelector('#rankRings'),
  links: document.querySelector('#links'),
  attributes: document.querySelector('#attributeNodes'),
  songs: document.querySelector('#songNodes'),
  filters: document.querySelector('#filters'),
  count: document.querySelector('#resultCount'),
  search: document.querySelector('#search'),
  network: document.querySelector('#network'),
  details: document.querySelector('#details'),
  detailsTemplate: document.querySelector('#detailsTemplate'),
  empty: document.querySelector('#emptyState'),
  legend: document.querySelector('#legend'),
  instruction: document.querySelector('#instruction'),
  playlistName: document.querySelector('#playlistName')
};

const normalize = text => String(text || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const svgElement = (tag, attrs = {}) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
};

const truncate = (text, length = 28) => text.length > length ? `${text.slice(0, length - 1)}…` : text;

async function init() {
  try {
    const response = await fetch('songs.json');
    if (!response.ok) throw new Error(`No se pudieron cargar los datos (${response.status})`);
    state.data = await response.json();
    els.playlistName.textContent = state.data.playlist.name;
    layoutSongs();
    bindControls();
    renderFilters();
    renderLegend();
    renderGraph();
    resetView(false);
  } catch (error) {
    els.empty.hidden = false;
    els.empty.querySelector('strong').textContent = 'No se pudo abrir la red';
    els.empty.querySelector('span').textContent = error.message;
  }
}

function bindControls() {
  document.querySelectorAll('.view-tab').forEach(button => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      state.filter = 'Todos';
      document.querySelectorAll('.view-tab').forEach(tab => tab.classList.toggle('active', tab === button));
      renderFilters();
      renderLegend();
      renderGraph();
    });
  });

  let searchTimer;
  els.search.addEventListener('input', event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = normalize(event.target.value.trim());
      updateVisibility();
    }, 90);
  });

  document.querySelector('#resetView').addEventListener('click', () => resetView());
  document.querySelector('#zoomIn').addEventListener('click', () => zoomBy(1.2));
  document.querySelector('#zoomOut').addEventListener('click', () => zoomBy(.82));

  els.svg.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = els.svg.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.1 : .9, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  els.svg.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.song-node')) return;
    state.panning = {
      startX: event.clientX,
      startY: event.clientY,
      x: state.transform.x,
      y: state.transform.y
    };
    els.svg.classList.add('panning');
  });

  window.addEventListener('pointermove', event => {
    if (!state.panning) return;
    state.transform.x = state.panning.x + event.clientX - state.panning.startX;
    state.transform.y = state.panning.y + event.clientY - state.panning.startY;
    applyTransform();
  });

  window.addEventListener('pointerup', () => {
    state.panning = null;
    els.svg.classList.remove('panning');
  });

  window.addEventListener('resize', () => resetView(false));
}

function tierFor(song) {
  if (song.rankCategories.includes('A.1')) return { key: 'a', color: COLORS.a };
  if (song.rankCategories.includes('10.1')) return { key: 'ten', color: COLORS.ten };
  if (song.rankCategories.includes('50.1')) return { key: 'fifty', color: COLORS.fifty };
  return { key: 'unranked', color: COLORS.unranked };
}

function ringForPosition(position) {
  if (position <= 3) return { radius: 78, index: position - 1, total: 3 };
  if (position <= 10) return { radius: 138, index: position - 4, total: 7 };
  if (position <= 30) return { radius: 220, index: position - 11, total: 20 };
  if (position <= 50) return { radius: 285, index: position - 31, total: 20 };
  if (position <= 90) return { radius: 365, index: position - 51, total: 40 };
  return { radius: 445, index: position - 91, total: 40 };
}

function layoutSongs() {
  state.data.songs.forEach(song => {
    const ring = ringForPosition(song.playlistPosition);
    const angle = -Math.PI / 2 + (ring.index / ring.total) * Math.PI * 2;
    song.x = Math.cos(angle) * ring.radius;
    song.y = Math.sin(angle) * ring.radius;
  });
}

function filterOptions() {
  if (state.view === 'account') return ['Todos', 'A.1', '10.1', '50.1', 'Fresh', 'En Likes'];
  if (state.view === 'subjective') return ['Todos', 'Hermano', 'Primo', 'Hijo', 'Sin relación'];
  const genres = [...new Set(state.data.songs.map(song => song.genre).filter(Boolean))];
  const common = genres
    .map(genre => ({ genre, count: state.data.songs.filter(song => song.genre === genre).length }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, 5)
    .map(item => item.genre);
  return ['Todos', 'Verificadas', 'Fecha pendiente', ...common];
}

function renderFilters() {
  els.filters.replaceChildren();
  filterOptions().forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button${state.filter === option ? ' active' : ''}`;
    button.textContent = option;
    button.addEventListener('click', () => {
      state.filter = option;
      [...els.filters.children].forEach(item => item.classList.toggle('active', item === button));
      updateVisibility();
    });
    els.filters.append(button);
  });
}

function renderLegend() {
  const definitions = state.view === 'intrinsic'
    ? [['Lanzamiento', COLORS.release], ['Álbum', COLORS.album], ['Artista', COLORS.artist], ['Género', COLORS.genre]]
    : state.view === 'account'
      ? [['En Likes', COLORS.saved], ['Fresh', COLORS.fresh, 'transparent'], ['Playlist', COLORS.playlist], ['Ranking', COLORS.ranking]]
      : [['Hermano', COLORS.sibling], ['Primo', COLORS.cousin], ['Hijo', COLORS.child]];

  els.legend.replaceChildren();
  definitions.forEach(([label, color, fill]) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.style.setProperty('--legend-color', color);
    item.style.setProperty('--legend-fill', fill || color);
    item.innerHTML = `<i></i>${label}`;
    els.legend.append(item);
  });
}

function renderGraph() {
  els.rings.replaceChildren();
  els.links.replaceChildren();
  els.attributes.replaceChildren();
  els.songs.replaceChildren();

  [
    [78, 'A.1'],
    [138, '10.1'],
    [285, '50.1'],
    [445, 'SIN ORDEN']
  ].forEach(([radius, label]) => {
    els.rings.append(svgElement('circle', { class: 'rank-ring', cx: 0, cy: 0, r: radius }));
    const text = svgElement('text', { class: 'rank-ring-label', x: 7, y: -radius + 13 });
    text.textContent = label;
    els.rings.append(text);
  });

  state.data.songs.forEach(song => {
    const tier = tierFor(song);
    const group = svgElement('g', {
      class: `song-node ${tier.key} ${song.fresh ? 'fresh' : 'saved'} ${song.playlistPosition <= 3 ? 'priority' : ''} ${state.selectedId === song.id ? 'selected' : ''} ${state.selectedId && state.selectedId !== song.id ? 'dimmed' : ''}`,
      transform: `translate(${song.x} ${song.y})`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${song.title}, ${song.artist}`,
      'data-id': song.id
    });
    group.style.setProperty('--node-color', song.fresh ? COLORS.fresh : tier.color);
    const radius = song.playlistPosition <= 3 ? 9 : song.playlistPosition <= 10 ? 7 : 5.5;
    group.append(
      svgElement('circle', { class: 'node-hit', r: 15 }),
      svgElement('circle', { class: 'node-halo', r: radius + 5 }),
      svgElement('circle', {
        class: 'node-core',
        r: radius,
        fill: song.fresh ? 'transparent' : tier.color
      })
    );
    const text = svgElement('text', { x: radius + 7, y: 3 });
    text.textContent = `${song.chartRank ? `#${song.chartRank} · ` : ''}${truncate(song.title, 23)}`;
    group.append(text);
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
    song.element = group;
    els.songs.append(group);
  });

  updateVisibility();
  if (state.selectedId) renderAttributes(state.data.songs.find(song => song.id === state.selectedId));
}

function matchesCurrentFilter(song) {
  const searchable = normalize(`${song.title} ${song.artist} ${song.album}`);
  if (state.query && !searchable.includes(state.query)) return false;
  if (state.filter === 'Todos') return true;

  if (state.view === 'account') {
    if (['A.1', '10.1', '50.1'].includes(state.filter)) return song.rankCategories.includes(state.filter);
    if (state.filter === 'Fresh') return song.fresh;
    if (state.filter === 'En Likes') return song.savedToLikes;
  }

  if (state.view === 'intrinsic') {
    if (state.filter === 'Verificadas') return song.metadata.verified;
    if (state.filter === 'Fecha pendiente') return !song.releaseDate;
    return song.genre === state.filter;
  }

  if (state.view === 'subjective') {
    if (state.filter === 'Sin relación') return song.subjectiveLinks.length === 0;
    const type = { Hermano: 'sibling', Primo: 'cousin', Hijo: 'child' }[state.filter];
    return song.subjectiveLinks.some(link => link.type === type);
  }
  return true;
}

function updateVisibility() {
  if (!state.data) return;
  const visible = state.data.songs.filter(matchesCurrentFilter);
  const visibleIds = new Set(visible.map(song => song.id));
  state.data.songs.forEach(song => song.element?.classList.toggle('filtered', !visibleIds.has(song.id)));
  els.count.textContent = `${visible.length} de ${state.data.songs.length}`;
  els.empty.hidden = visible.length > 0;

  if (state.selectedId && !visibleIds.has(state.selectedId)) {
    state.selectedId = null;
    els.attributes.replaceChildren();
    els.links.replaceChildren();
    showEmptyDetails();
  }
}

function selectSong(id) {
  state.selectedId = id;
  const song = state.data.songs.find(item => item.id === id);
  state.data.songs.forEach(item => {
    item.element?.classList.toggle('selected', item.id === id);
    item.element?.classList.toggle('dimmed', item.id !== id);
  });
  els.instruction.hidden = true;
  renderAttributes(song);
  renderDetails(song);
  focusOnSong(song);
}

function attributesFor(song) {
  if (state.view === 'intrinsic') {
    return [
      { type: 'LANZAMIENTO', value: formatMonthYear(song.releaseDate), color: COLORS.release, pending: !song.releaseDate },
      { type: 'ÁLBUM', value: song.album || 'Pendiente', color: COLORS.album, pending: !song.album },
      { type: 'ARTISTA', value: song.artist || 'Pendiente', color: COLORS.artist, pending: !song.artist },
      { type: 'GÉNERO', value: song.genre || 'Pendiente', color: COLORS.genre, pending: !song.genre }
    ];
  }
  if (state.view === 'account') {
    const ranking = song.rankCategories.length
      ? `${song.chartRank ? `#${song.chartRank} · ` : ''}${song.rankCategories.join(' · ')}`
      : 'Sin orden definido';
    return [
      {
        type: song.fresh ? 'FRESH' : 'LIKES',
        value: song.fresh ? 'Aún no ingresada' : song.likedAt || 'Fecha pendiente',
        color: song.fresh ? COLORS.fresh : COLORS.saved,
        pending: !song.fresh && !song.likedAt
      },
      {
        type: 'PLAYLIST',
        value: truncate(song.playlistMemberships[0].name, 30),
        color: COLORS.playlist
      },
      {
        type: 'RANKING',
        value: ranking,
        color: COLORS.ranking
      }
    ];
  }
  return [
    { type: 'HERMANO', value: 'Sin definir', color: COLORS.sibling, pending: true },
    { type: 'PRIMO', value: 'Sin definir', color: COLORS.cousin, pending: true },
    { type: 'HIJO', value: 'Sin definir', color: COLORS.child, pending: true }
  ];
}

function renderAttributes(song) {
  els.links.replaceChildren();
  els.attributes.replaceChildren();
  const attributes = attributesFor(song);
  const radius = state.view === 'intrinsic' ? 122 : 112;

  attributes.forEach((attribute, index) => {
    const angle = -Math.PI / 2 + (index / attributes.length) * Math.PI * 2;
    const x = song.x + Math.cos(angle) * radius;
    const y = song.y + Math.sin(angle) * radius;
    const line = svgElement('line', {
      class: 'attribute-link',
      x1: song.x,
      y1: song.y,
      x2: x,
      y2: y
    });
    line.style.setProperty('--link-color', attribute.color);
    els.links.append(line);

    const group = svgElement('g', {
      class: `attribute-node${attribute.pending ? ' placeholder' : ''}`,
      transform: `translate(${x} ${y})`
    });
    group.style.setProperty('--attr-color', attribute.color);
    group.append(svgElement('circle', { r: 34 }));
    const type = svgElement('text', { class: 'attr-type', y: -7 });
    type.textContent = attribute.type;
    const value = svgElement('text', { y: 8 });
    value.textContent = truncate(attribute.value, 22);
    group.append(type, value);
    els.attributes.append(group);
  });
}

function renderDetails(song) {
  const fragment = els.detailsTemplate.content.cloneNode(true);
  const tier = tierFor(song);
  const fallback = fragment.querySelector('.cover-fallback');
  fallback.style.setProperty('--cover-color', song.fresh ? COLORS.fresh : tier.color);
  const image = fragment.querySelector('.song-cover');
  if (song.artwork) {
    image.src = song.artwork;
    image.alt = `Portada de ${song.album}`;
    image.addEventListener('load', () => image.classList.add('loaded'));
  }
  fragment.querySelector('.position-badge').textContent = song.chartRank ? `#${song.chartRank}` : `Nº ${song.playlistPosition}`;
  fragment.querySelector('.song-title').textContent = song.title;
  fragment.querySelector('.song-artist').textContent = song.artist;
  fragment.querySelector('.song-release').textContent = formatDate(song.releaseDate);
  fragment.querySelector('.song-genre').textContent = song.genre || 'Pendiente';
  fragment.querySelector('.song-album').textContent = song.album || 'Pendiente';
  fragment.querySelector('.liked-date').textContent = song.fresh
    ? 'Fresh — aún no ingresada'
    : song.likedAt || 'Guardada — fecha pendiente';
  fragment.querySelector('.playlist-membership').textContent =
    `${song.playlistMemberships[0].name} · ${song.playlistMemberships[0].addedRelative}`;
  fragment.querySelector('.max-ranking').textContent = song.rankCategories.length
    ? `#${song.chartRank} · ${song.rankCategories.join(' · ')}`
    : 'Sin orden definido';

  const status = fragment.querySelector('.status-row');
  status.append(makeChip(song.fresh ? 'Fresh' : 'En Likes', song.fresh ? COLORS.fresh : COLORS.saved));
  status.append(makeChip(song.metadata.verified ? 'Metadata verificada' : 'Metadata pendiente', tier.color, true));

  const badges = fragment.querySelector('.rank-badges');
  song.rankCategories.forEach(category => {
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.style.setProperty('--badge-color', category === 'A.1' ? COLORS.a : category === '10.1' ? COLORS.ten : COLORS.fifty);
    badge.textContent = category;
    badges.append(badge);
  });
  if (!song.rankCategories.length) {
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.style.setProperty('--badge-color', COLORS.unranked);
    badge.textContent = 'SIN ORDEN DEFINIDO';
    badges.append(badge);
  }

  const spotify = fragment.querySelector('.spotify-button');
  spotify.href = song.spotifyUrl;
  spotify.setAttribute('aria-label', `Buscar ${song.title} en Spotify`);
  els.details.replaceChildren(fragment);
  els.details.scrollTop = 0;
}

function makeChip(label, color, outline = false) {
  const chip = document.createElement('span');
  chip.className = `status-chip${outline ? ' outline' : ''}`;
  chip.style.setProperty('--chip-color', color);
  chip.textContent = label;
  return chip;
}

function showEmptyDetails() {
  els.details.innerHTML = `
    <div class="details-empty">
      <div class="empty-orbit" aria-hidden="true"><span></span></div>
      <p class="eyebrow">FICHA DE CANCIÓN</p>
      <h2>Ninguna selección</h2>
      <p>Selecciona un nodo para consultar su información, estado dentro de tu cuenta y relaciones personales.</p>
    </div>`;
}

function formatDate(date) {
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatMonthYear(date) {
  if (!date) return 'Pendiente';
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

function focusOnSong(song) {
  const width = els.network.clientWidth;
  const height = els.network.clientHeight;
  const scale = Math.max(.85, state.transform.scale);
  state.transform = {
    x: width / 2 - song.x * scale,
    y: height / 2 - song.y * scale,
    scale
  };
  els.viewport.style.transition = 'transform 240ms ease';
  applyTransform();
  setTimeout(() => { els.viewport.style.transition = 'none'; }, 250);
}

function resetView(animate = true) {
  const width = els.network.clientWidth;
  const height = els.network.clientHeight;
  const scale = Math.min(.96, Math.max(.56, (Math.min(width, height) - 60) / 900));
  state.transform = { x: width / 2, y: height / 2, scale };
  els.viewport.style.transition = animate ? 'transform 240ms ease' : 'none';
  applyTransform();
  if (animate) setTimeout(() => { els.viewport.style.transition = 'none'; }, 250);
}

function zoomBy(factor, centerX = els.network.clientWidth / 2, centerY = els.network.clientHeight / 2) {
  const oldScale = state.transform.scale;
  const newScale = Math.max(.42, Math.min(2.4, oldScale * factor));
  state.transform.x = centerX - ((centerX - state.transform.x) / oldScale) * newScale;
  state.transform.y = centerY - ((centerY - state.transform.y) / oldScale) * newScale;
  state.transform.scale = newScale;
  applyTransform();
}

function applyTransform() {
  const { x, y, scale } = state.transform;
  els.viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
}

init();
