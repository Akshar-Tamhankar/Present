/* ==========================================================================
   beatmap.js — where the note times live when you're using YOUR OWN song.

   If CONFIG.songUrl is null, this file is ignored entirely: the built-in
   generated song emits its own perfectly-matched beatmap.

   When you're ready to use a real track:
     1. put the file in  assets/
     2. set  songUrl: 'assets/song.mp3'  in js/config.js
     3. open  tools/beatmapper.html , tap along to the song, hit EXPORT
     4. paste the exported array into CUSTOM below
   ========================================================================== */

window.Beatmap = (function () {

  /* Times in SECONDS from the start of the audio file. */
  const CUSTOM = [
    // 1.234, 1.876, 2.501, ...
  ];

  /**
   * Fallback for a custom song with no hand-tapped map:
   * lay notes on a straight grid. Rough, but playable.
   */
  function fromBpm(bpm, offsetSec, durationSec, subdivision) {
    const spb = 60 / bpm / (subdivision || 1);
    const out = [];
    for (let t = offsetSec; t < durationSec - 1.0; t += spb) out.push(+t.toFixed(4));
    return out;
  }

  /** Drop notes that are impossibly close together (double-taps while mapping). */
  function clean(times, minGap) {
    const gap = minGap == null ? 0.11 : minGap;
    const sorted = times.slice().sort(function (a, b) { return a - b; });
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
      if (!out.length || sorted[i] - out[out.length - 1] >= gap) out.push(sorted[i]);
    }
    return out;
  }

  return { CUSTOM: CUSTOM, fromBpm: fromBpm, clean: clean };
})();
