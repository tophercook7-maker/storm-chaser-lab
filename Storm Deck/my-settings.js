/* ═══════════════════════════════════════════════════════════════
   MY SETTINGS  —  this is YOUR file. Change it.

   This is real code. The Storm Deck reads this file every time it
   starts, and whatever you put in here is what it does.

   To edit it: right-click this file > Open with > Notepad.
   Change a value, SAVE, then refresh the Storm Deck (press F5).

   Rules of the road:
     - Keep the quotes "like this" around words.
     - Numbers don't get quotes.
     - Don't delete the commas at the end of lines.
     - If you break it, the Deck will tell you exactly what broke.
       You cannot hurt anything. Break it on purpose once. Really.
   ═══════════════════════════════════════════════════════════════ */

const MY = {

  // ── WHO YOU ARE ────────────────────────────────────────────────
  // Your name shows up on the Deck header and on your chase log.
  spotterName: "Storm Spotter",

  // Your SKYWARN spotter ID. You don't have one yet. You will.
  // When you get certified, put it here. (See the SKYWARN folder.)
  spotterID: "not certified yet",


  // ── WHERE YOU ARE ──────────────────────────────────────────────
  // MISSION 1: change these to YOUR town.
  // Find your numbers at https://www.latlong.net  — type in your
  // town, and it gives you a latitude and a longitude.
  //
  // Latitude  = how far north (bigger number = further north)
  // Longitude = how far west (in the USA this is always NEGATIVE)
  //
  // Right now these point at Hot Springs, Arkansas.
  lat: 34.5037,
  lon: -93.0552,
  townName: "Hot Springs, AR",

  // Your state's two-letter code. Used to pull warnings for your state.
  state: "AR",


  // ── YOUR RADAR ─────────────────────────────────────────────────
  // Every NEXRAD radar in the country has a 4-letter callsign.
  // KLZK is Little Rock, Arkansas. Yours might be different.
  // Find yours: https://radar.weather.gov  — click your area, the
  // callsign is in the address bar.
  //
  // A few nearby ones to try:
  //   KLZK = Little Rock, AR      KSRX = Fort Smith, AR
  //   KTLX = Oklahoma City, OK    KINX = Tulsa, OK
  //   KNQA = Memphis, TN          KSHV = Shreveport, LA
  radarStation: "KLZK",


  // ── HOW THE DECK BEHAVES ───────────────────────────────────────

  // How often the Deck goes and gets fresh data, in seconds.
  // 60 is good. Don't go below 30 — that's just being rude to a
  // free government server that a lot of people depend on.
  refreshSeconds: 60,

  // How far out to zoom the map when it opens.
  // Bigger number = zoomed IN closer. 7 shows most of a state.
  mapZoom: 7,

  // Should the Deck make noise when a Tornado Warning appears
  // anywhere in your state? true = yes, false = no.
  soundTheAlarm: true,

  // MISSION 6: you'll come back and add your own event to this list.
  // These are the alerts the Deck treats as RED — the big ones.
  redAlerts: [
    "Tornado Warning",
    "Particularly Dangerous Situation",
    "Extreme Wind Warning",
    "Flash Flood Emergency",
  ],

};
