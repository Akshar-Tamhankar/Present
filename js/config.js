/* ==========================================================================
   CONFIG — this is the only file you need to edit to personalize the gift.
   Everything below is safe to change. Keep the quotes.
   ========================================================================== */

window.CONFIG = {

  /* ---- Words -------------------------------------------------------- */
  eyebrow:  'a little something for',
  name:     'you',                       // ← her name
  tagline:  "six months. let's make some noise about it.",

  // Shown under the big HAPPY ANNIVERSARY, before the ticket.
  note: "six months of you. best thing that's happened to me. here's to the next six, and the six after that, and… you get it.",

  // The golden ticket
  ticketTitle:  'ONE KISS',
  ticketFine:   '(or more 😉)',
  ticketTerms:  'This ticket entitles the bearer to redeem the above, at any time, ' +
                'in any place, no questions asked. Non-transferable. ' +
                'Infinitely renewable. Never expires.',
  ticketSerial: '№ 000001',
  ticketSigned: 'signed, me ♡',


  /* ---- Music --------------------------------------------------------
     songUrl: null  →  use the built-in generated song (always in sync).
     To use YOUR song: drop the file in assets/ and set:
         songUrl: 'assets/song.mp3',
     Then generate a beatmap for it with tools/beatmapper.html and paste
     the result into js/beatmap.js.
     -------------------------------------------------------------------- */
  songUrl: null,

  // Only used by the built-in generated song.
  bpm: 128,


  /* ---- Difficulty ---------------------------------------------------
     Timing windows in milliseconds (how close to the beat you must click).
     Bigger = easier. These are already forgiving.
     -------------------------------------------------------------------- */
  windows: { perfect: 85, great: 145, good: 205 },

  // Fraction of a "perfect run" needed to fill the love meter. 0.55 = kind.
  fillThreshold: 0.55,

  // After this many failed attempts, the windows get 25% wider each time.
  mercyAfter: 1,


  /* ---- Feel ---------------------------------------------------------- */
  approachTime: 1.55,   // seconds a note takes to travel inward
  audioOffsetMs: 0      // set by the calibration screen; leave at 0
};
