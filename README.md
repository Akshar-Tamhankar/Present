# ♡ six months

A love-themed game in three acts, ending in a gift:

- **Act I — the song.** Hearts float in toward the big heart in the middle;
  click (or Space) exactly on the beat and the love meter fills.
- **Act II — petal catch.** Hearts tumble through the breeze; click them
  before they drift away.
- **Act III — the finale.** Quick-time moments: a ring closes on a heart —
  hit it the instant it seals.

Then the gift box: drag the bow to untie it, lift the lid, and the reveal is
**HAPPY 6 MONTH ANNIVERSARY!!!!** plus a golden **redeem-a-kiss** ticket.

The scene is a Ghost-of-Tsushima-style vista, love-themed: cherry blossom
canopy hanging into frame, sunrise fog over a mirror pond, god rays, and a
carpet of petals and hearts. Everything is drawn in code — no image assets,
loads instantly. Nothing can be lost, only retried — and every retry gets a
little kinder.

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
js/song.js          built-in synthesized song (direct-DSP render)
js/beatmap.js       beat times for your own song
js/scene.js         the whole painted scene + game rendering
js/game.js          timing, judging, scoring
js/gift.js          bow-drag + lid-lift unwrapping
js/main.js          screen flow and wiring
tools/serve.js      tiny local dev server
tools/beatmapper.html  tap-along beatmap maker
```
