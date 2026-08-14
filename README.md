# ♡ six months

A love-themed rhythm gauntlet where **the song is the level**. One 128 BPM
track with real build-ups and drops — and **eleven** gameplay modes, one per
section, every switch called by a gold banner:

- **home** — hearts shrink onto the big heart; click on the beat
- **cupid's volley** — arrows loosed from the wings; click as they strike
- **the tunnel** — the vista rips away; notes race out of a neon void
- **catch us** — drifting hearts, click them all, whiffs are free
- **love letter** — a paper dart glides; click through every rose gate
- **starfall** — comet hearts fall to a line… then a portal flips gravity
- **our orbit** — a radar sweep; click as the pair passes each spark
- **sweet tooth** — truffles pop from a valentine box; click at the top
- **in bloom** — roses unfurl along a vine; click at full bloom
- **above the clouds** — the world becomes a sunrise cloudscape
- **the finale** — QTE rings sealing on scattered hearts

One mechanic underneath it all — click on time — so it stays easy to *play*
while never looking the same twice. Tuned kind by default (wide windows, low
meter bar, strays keep your combo, retries widen everything). Then the gift box: drag the bow, lift the
lid — **HAPPY 6 MONTH ANNIVERSARY!!!!** and a golden **redeem-a-kiss**
ticket.

The scene is a Ghost-of-Tsushima-style vista, love-themed: cherry blossom
canopy hanging into frame, sunrise fog over a mirror pond, god rays, wind
streaks, and a carpet of petals and hearts — all drawn in code, with mouse
parallax for depth. The chorus goes **kiai** (osu-style fever): gold target,
rushing petals, screen-shake perfects, combo milestones. DOM choreography
(title letters, the reveal, stat counters, ticket tilt) runs on a vendored
anime.js; everything else is hand-rolled canvas. Nothing can be lost, only
retried — and every retry gets a little kinder.

## Run it locally

```bash
node tools/serve.js
```

Then open http://localhost:5178. (Opening `index.html` directly won't work —
browsers block audio fetches on `file://`.)

## Make it hers

Everything personal lives in **`js/config.js`** — name, tagline, the note
under the big reveal, and every word on the golden ticket. Edit and refresh.

## Use your song

Out of the box it plays a built-in synthesized track (so beat sync is perfect
with zero setup). To use a real song — *your* song:

1. Drop the file in `assets/`, e.g. `assets/song.mp3`
2. In `js/config.js` set `songUrl: 'assets/song.mp3'`
3. Open `tools/beatmapper.html` in a browser, load the same file, hit play,
   and **tap along** wherever you want a heart. Export → it copies the beat
   list to your clipboard.
4. Paste it into `js/beatmap.js` inside `CUSTOM = [ … ]`

No beatmap? It falls back to an even grid from `bpm` in config — playable,
but tapping the map takes two minutes and feels way better.

Custom tracks get the full ride too: the game synthesises tunnel sections
through the middle of the song, a catch break between them, and a QTE finale
near the end.

## Difficulty

Also in `js/config.js`:

- `windows` — hit timing tolerances in ms (bigger = kinder)
- `fillThreshold` — how much of a perfect run fills the meter (0.55 default)
- `mercyAfter` — after this many misses of the win, windows widen 25% per try

The game can't be lost, only retried — it's a gift, not a test. There's also
a **calibrate** screen (link under "i'm ready") that measures audio latency
and stores it in the browser.

## Put it on a real link

The whole thing is static files — any static host works. Two easy options:

**Netlify Drop** (fastest): go to https://app.netlify.com/drop and drag this
folder in. Free account, instant URL, done.

**Vercel**: `npm i -g vercel`, then run `vercel` in this folder.

**GitHub Pages**: push to a repo → Settings → Pages → deploy from branch.

Text her the link. 💗

## Files

```
index.html          screens + markup
style.css           all styling, gift box 3D, golden ticket
js/config.js        ← the only file you need to edit
js/audio.js         Web Audio engine + sample-accurate song clock
js/song.js          built-in 128BPM track (direct-DSP) + phase/beat maps
js/beatmap.js       beat times for your own song
js/scene.js         the whole painted scene + game rendering
js/game.js          timing, judging, scoring, phase engine, kiai
js/gift.js          bow-drag + lid-lift unwrapping
js/fx.js            DOM choreography (anime.js): title, reveal, tilt
js/vendor/anime.min.js  anime.js v3.2.2 (MIT), vendored so it works offline
js/main.js          screen flow and wiring
tools/serve.js      tiny local dev server
tools/beatmapper.html  tap-along beatmap maker
```
