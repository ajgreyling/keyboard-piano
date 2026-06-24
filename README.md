# Kind Keys Piano

A tiny browser piano for old laptops and small children. Plain HTML, CSS, and
JavaScript. No build step, no dependencies.

Inspired by GarageBand jam sessions: turn on **Jam** and the music keeps playing.
Every key you press steers the melody, bass, and chords in a new direction.

## Play

Open `index.html` in a browser, press **Start piano**, then use:

```text
A S D F G H J K L ;
```

- **Jam on**: continuous arpeggios, soft bass, and brush drums follow your lead
- **Your notes steer**: each press sets the new musical direction
- **Pentatonic scale**: gentle exploring stays musical
- **Salamander Grand Piano samples**: real acoustic piano recordings (CC BY 3.0)
- **Room reverb + warmth**: studio-style tone shaping

## Local Server

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Old Machine Choices

- No build step or npm dependencies
- ES5-style JavaScript for older browser engines
- `AudioContext` with `webkitAudioContext` fallback
- Bundled Salamander piano samples (~580 KB for the playable range)
- Voice limiting to keep CPU use low on old Linux laptops
- Big click and touch targets for small hands

## Live Demo

- CongoSky (flagship): `https://congosky.cloud/games/kind-keys/`
- GitHub Pages mirror: `https://ajgreyling.github.io/keyboard-piano/`

Studio roadmap (drums → full GarageBand): see `games/ROADMAP.md` in the
[congosky-cloud](https://github.com/ajgreyling/congosky-cloud) repo.

## Samples

Piano samples from [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3)
by Alexander Holm, distributed via [Tone.js](https://tonejs.github.io/) (CC BY 3.0).
