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
- **Room reverb + warmth**: richer piano tone without sample downloads

## Local Server

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Old Machine Choices

- No build step, npm, fonts, images, or sample files
- ES5-style JavaScript for older browser engines
- `AudioContext` with `webkitAudioContext` fallback
- Additive piano synthesis with hammer attack and generated reverb
- Voice limiting to keep CPU use low on old Linux laptops
- Big click and touch targets for small hands

## Live Demo

After publishing, enable GitHub Pages on the `main` branch to host at:

`https://ajgreyling.github.io/keyboard-piano/`
