# Constelación sonora

Archivo musical personal en forma de red interactiva. La primera colección importada es **Septiembre 15 2026 HITS**, con 130 canciones reconstruidas desde capturas de Spotify.

## Funciones

- Nodo central de playlist enlazado explícitamente con sus 130 canciones.
- Física radial de playlist: Top 3 = 4; Top 10 = 3; Top 25 = 2; Top 50 = 1; No Fresh = 0.5; Fresh = 0.25.
- El peso engrosa los enlaces y la buoyancy inversa separa radialmente los nodos.
- Red SVG con zoom y desplazamiento.
- Buscador por canción, artista, álbum o género.
- Tres pestañas de nodos: información intrínseca, datos de cuenta y relaciones subjetivas.
- Categorías acumulativas de ranking: `50.1`, `10.1` y `A.1`.
- Distinción entre canciones guardadas en Likes y canciones `Fresh`.
- Género informado para las 130 canciones; las clasificaciones editoriales iniciales se distinguen de las verificadas por API.
- Panel lateral con metadatos, estado personal, ranking, lyrics y notas.
- Enlaces a Spotify.
- Diseño adaptable para computadora y móvil.
- Sin dependencias de compilación: HTML, CSS y JavaScript.

## Modelo de datos

Los nodos viven en `songs.json`. `playlist-source.json` conserva la transcripción de las capturas y `scripts/enrich.mjs` permite completar metadatos desde Apple Search API.

Las fechas de incorporación a Likes permanecen en `null` cuando no existe evidencia: la fecha relativa mostrada por Spotify corresponde a la incorporación a la playlist, no necesariamente a Likes.

```json
{
  "id": "track-001",
  "title": "Andromeda",
  "artist": "Weyes Blood",
  "album": "Titanic Rising",
  "releaseDate": "2019-04-05",
  "playlistPosition": 1,
  "chartRank": 1,
  "rankCategories": ["50.1", "10.1", "A.1"],
  "savedToLikes": true,
  "fresh": false,
  "likedAt": null,
  "subjectiveLinks": []
}
```

## Desarrollo local

Como los datos se cargan desde JSON, abre el proyecto mediante un servidor local:

```bash
python -m http.server 8080
```

Después visita `http://localhost:8080`.

## Enriquecimiento

```bash
node scripts/enrich.mjs
```

El script conserva coincidencias verificadas y deja como pendientes las que no alcanza a corroborar.

## Publicación

El flujo incluido en `.github/workflows/pages.yml` publica el sitio mediante GitHub Pages al enviar cambios a `main`.
