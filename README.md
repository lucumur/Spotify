# Red musical interactiva

Un mapa navegable de canciones relacionadas. Cada nodo representa una canción y cada línea explica una relación musical: sonido, época, escena, producción o influencia.

## Funciones

- Red SVG con zoom, desplazamiento y nodos arrastrables.
- Buscador por canción, artista o álbum.
- Filtros por género.
- Panel lateral con metadatos y explicación de cada conexión.
- Enlaces a Spotify.
- Diseño adaptable para computadora y móvil.
- Sin dependencias de compilación: HTML, CSS y JavaScript.

## Editar las canciones

Los nodos y relaciones viven en `songs.json`.

Cada canción necesita un `id` único. Las relaciones usan esos identificadores en `source` y `target`.

```json
{
  "songs": [
    {
      "id": "enjoy-the-silence",
      "title": "Enjoy the Silence",
      "artist": "Depeche Mode",
      "album": "Violator",
      "year": 1990,
      "genre": "Synthpop",
      "spotifyUrl": "https://open.spotify.com/search/Enjoy%20the%20Silence%20Depeche%20Mode"
    }
  ],
  "links": [
    {
      "source": "enjoy-the-silence",
      "target": "blue-monday",
      "type": "Sonido",
      "reason": "Sintetizadores oscuros y pulso bailable."
    }
  ]
}
```

## Desarrollo local

Como los datos se cargan desde JSON, abre el proyecto mediante un servidor local:

```bash
python -m http.server 8080
```

Después visita `http://localhost:8080`.

## Publicación

El flujo incluido en `.github/workflows/pages.yml` publica el sitio mediante GitHub Pages al enviar cambios a `main`.

