import { readFile, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../playlist-source.json', import.meta.url), 'utf8'));
let existingByPosition = new Map();
let existingGenreByPosition = new Map();
try {
  const existing = JSON.parse(await readFile(new URL('../songs.json', import.meta.url), 'utf8'));
  existingByPosition = new Map(existing.songs
    .filter(song => song.metadata?.verified)
    .map(song => [song.playlistPosition, song]));
  existingGenreByPosition = new Map(existing.songs
    .filter(song => song.genre)
    .map(song => [song.playlistPosition, song.genre]));
} catch {
  // Primera generación: todavía no existe un archivo enriquecido.
}

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toLowerCase();

function similarity(expected, candidate) {
  const a = normalize(expected);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 12;
  if (a.includes(b) || b.includes(a)) return 8;
  const tokens = new Set(a.split(' '));
  const overlap = b.split(' ').filter(token => tokens.has(token)).length;
  return Math.min(6, overlap * 1.5);
}

function score(song, result) {
  const leadArtist = song.artist.split(',')[0];
  return similarity(song.title, result.trackName) * 2
    + similarity(leadArtist, result.artistName)
    + similarity(song.album, result.collectionName) * 0.5;
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let lastRequestAt = 0;

async function lookup(song) {
  const term = encodeURIComponent(`${song.title} ${song.artist.split(',')[0]}`);
  const url = `https://itunes.apple.com/search?term=${term}&country=US&media=music&entity=song&limit=15`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const wait = Math.max(0, 3200 - (Date.now() - lastRequestAt));
      if (wait) await sleep(wait);
      lastRequestAt = Date.now();
      const response = await fetch(url);
      if (!response.ok) {
        if ([403, 429].includes(response.status) && attempt < 3) {
          await sleep(10000 * attempt);
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const ranked = payload.results
        .map(result => ({ result, score: score(song, result) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      return best && best.score >= 17 ? { ...best.result, matchScore: best.score } : null;
    } catch (error) {
      if (attempt === 3) {
        console.error(`No se pudo enriquecer #${song.position} ${song.title}: ${error.message}`);
      }
    }
  }
  return null;
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const matches = await mapConcurrent(source, 1, async song => {
  const cached = existingByPosition.get(song.position);
  if (!cached) return lookup(song);
  return {
    trackName: cached.title,
    artistName: cached.artist,
    collectionName: cached.album,
    releaseDate: cached.releaseDate,
    primaryGenreName: cached.genre,
    artworkUrl100: cached.artwork?.replace('600x600bb', '100x100bb'),
    trackViewUrl: cached.appleUrl,
    matchScore: cached.metadata.confidence
  };
});

const NETWORK_PHYSICS = [
  {
    "key": "top3",
    "label": "Top 3",
    "attraction": 4,
    "targetRadius": 82
  },
  {
    "key": "top10",
    "label": "Top 10",
    "attraction": 3,
    "targetRadius": 145
  },
  {
    "key": "top25",
    "label": "Top 25",
    "attraction": 2,
    "targetRadius": 215
  },
  {
    "key": "top50",
    "label": "Top 50",
    "attraction": 1,
    "targetRadius": 295
  },
  {
    "key": "nofresh",
    "label": "No Fresh",
    "attraction": 0.5,
    "targetRadius": 390
  },
  {
    "key": "fresh",
    "label": "Fresh",
    "attraction": 0.25,
    "targetRadius": 485
  }
];

function networkPhysicsFor(song) {
  const band = song.position <= 3
    ? NETWORK_PHYSICS[0]
    : song.position <= 10
      ? NETWORK_PHYSICS[1]
      : song.position <= 25
        ? NETWORK_PHYSICS[2]
        : song.position <= 50
          ? NETWORK_PHYSICS[3]
          : song.saved
            ? NETWORK_PHYSICS[4]
            : NETWORK_PHYSICS[5];
  return {
    playlistAttraction: band.attraction,
    buoyancyBand: band.label,
    targetRadius: band.targetRadius
  };
}

const songs = source.map((song, index) => {
  const match = matches[index];
  const releaseDate = match?.releaseDate?.slice(0, 10) || null;
  const categories = [];
  if (song.position <= 50) categories.push('50.1');
  if (song.position <= 10) categories.push('10.1');
  if (song.position <= 3) categories.push('A.1');

  return {
    id: `track-${String(song.position).padStart(3, '0')}`,
    title: match?.trackName || song.title,
    artist: match?.artistName || song.artist,
    album: match?.collectionName || song.album,
    releaseDate,
    releaseMonthYear: releaseDate?.slice(0, 7) || null,
    genre: match?.primaryGenreName || existingGenreByPosition.get(song.position) || null,
    artwork: match?.artworkUrl100?.replace('100x100bb', '600x600bb') || null,
    appleUrl: match?.trackViewUrl || null,
    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist.split(',')[0]}`)}`,
    playlistPosition: song.position,
    chartRank: song.position <= 50 ? song.position : null,
    rankCategories: categories,
    savedToLikes: song.saved,
    fresh: !song.saved,
    networkPhysics: networkPhysicsFor(song),
    likedAt: null,
    playlistMemberships: [{
      name: 'Septiembre 15 2026 HITS',
      spotifyId: '0M743ojL83o52L5xr3aDIX',
      addedRelative: song.position === 130 ? '7 hours ago' : '13 hours ago'
    }],
    subjectiveLinks: [],
    notes: '',
    lyricsUrl: null,
    metadata: {
      source: match ? 'Apple Search API' : 'Captura de Spotify',
      confidence: match ? Math.round(match.matchScore * 10) / 10 : null,
      verified: Boolean(match)
    }
  };
});

const output = {
  project: 'Constelación sonora',
  playlist: {
    name: 'Septiembre 15 2026 HITS',
    spotifyId: '0M743ojL83o52L5xr3aDIX',
    spotifyUrl: 'https://open.spotify.com/playlist/0M743ojL83o52L5xr3aDIX',
    capturedOn: '2026-09-15',
    totalSongs: songs.length,
    rankedSongs: 50,
    networkPhysics: {
      model: 'Atracción de playlist con buoyancy radial inversa',
      attractionScale: NETWORK_PHYSICS
    }
  },
  songs
};

await writeFile(new URL('../songs.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
const verified = songs.filter(song => song.metadata.verified).length;
console.log(`Generadas ${songs.length} canciones; ${verified} coincidencias verificadas; ${songs.length - verified} pendientes.`);
