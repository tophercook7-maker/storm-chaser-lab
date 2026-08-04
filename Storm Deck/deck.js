/* ═══════════════════════════════════════════════════════════════════════
   STORM DECK  —  the brains.

   This is JavaScript. It's the language that makes web pages DO things.
   Everything below is real, working code that talks to real National
   Weather Service computers. Nothing here is pretend.

   You do NOT have to understand this file yet. The Missions will walk
   you through it one piece at a time. But read it anyway. Getting used
   to looking at code you don't fully understand is most of the job.

   Anything marked  ◀ MISSION  is a place you'll come back and change.
   ═══════════════════════════════════════════════════════════════════════ */


/* ── 1. WHERE THE DATA COMES FROM ──────────────────────────────────────
   These are real addresses of real government servers. You can paste
   any of them into a browser and see the raw data yourself. Do that at
   least once — it makes the whole thing feel less like magic.          */

const NWS = "https://api.weather.gov";   // National Weather Service: warnings + conditions
const IEM = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0"; // Iowa State: radar tiles
const IEMAPI = "https://mesonet.agron.iastate.edu/api/1"; // Iowa State: SPC outlook lookup

/* Why we don't load pictures straight from spc.noaa.gov:
   we tried. Their server refuses to hand images to a web page (the browser
   reports ERR_BLOCKED_BY_ORB). It works if you type the address in yourself,
   but not embedded. So instead we ask Iowa State University — who archive
   every SPC product and DO allow it — for the risk category at YOUR exact
   latitude and longitude. That's better anyway: a national map tells you
   something is happening somewhere. This tells you about your own house.

   Lesson worth keeping: "it works when I test it in the address bar" and
   "it works inside my program" are two different claims. Always check the
   second one. */


/* ── 2. MEMORY ────────────────────────────────────────────────────────
   Variables are just labeled boxes the program puts things in so it can
   find them again later.                                               */

let map;                 // the Leaflet map itself
let warningLayer;        // the group of warning shapes drawn on the map
let stationID = null;    // the weather station nearest to you (found at startup)
let alarmHasSounded = false;
let tickTimer = null;


/* ── 3. STARTUP CHECK ─────────────────────────────────────────────────
   Before anything else, make sure my-settings.js is sane. A missing
   comma in that file would otherwise cause a blank screen with no
   explanation, which is the single most discouraging thing that can
   happen to someone learning to code. So: check, and explain.         */

function checkSettings(){
  if (typeof MY === "undefined")
    return "my-settings.js didn't load at all. It probably has a typo — a missing comma, or a missing quote mark.";
  if (typeof MY.lat !== "number" || typeof MY.lon !== "number")
    return "lat and lon in my-settings.js must be NUMBERS with no quotes around them. Example: lat: 34.5037";
  if (MY.lon > 0)
    return "Your longitude is positive. In the United States longitude is always NEGATIVE. Try -" + MY.lon;
  if (!MY.radarStation || MY.radarStation.length !== 4)
    return "radarStation must be a 4-letter radar callsign in quotes, like \"KLZK\".";
  return null;  // null means "nothing wrong"
}


/* ── 4. THE MAP ───────────────────────────────────────────────────────── */

function buildMap(){
  map = L.map("map", { zoomControl:true, attributionControl:true })
         .setView([MY.lat, MY.lon], MY.mapZoom);

  // The dark base map — roads, borders, city names.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:"© OpenStreetMap, © CARTO", subdomains:"abcd", maxZoom:12
  }).addTo(map);

  // THE RADAR. This is live NEXRAD reflectivity — the same radar data the
  // National Weather Service uses, refreshed about every 5 minutes.
  const radar = L.tileLayer(IEM + "/nexrad-n0q-900913/{z}/{x}/{y}.png", {
    opacity:0.72, maxZoom:12, attribution:"NEXRAD via Iowa State Mesonet"
  }).addTo(map);

  // City labels drawn ON TOP of the radar so you can still read them.
  const labels = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
    { subdomains:"abcd", maxZoom:12 }).addTo(map);

  // A marker for exactly where you are.
  L.marker([MY.lat, MY.lon], {
    icon: L.divIcon({ className:"", html:'<div class="me-dot"></div>', iconSize:[13,13] })
  }).addTo(map).bindPopup("<b>" + MY.townName + "</b><br>You are here.");

  warningLayer = L.layerGroup().addTo(map);

  L.control.layers(null, {
    "Radar (NEXRAD)": radar,
    "City labels": labels,
    "Warning boxes": warningLayer
  }, { collapsed:true }).addTo(map);
}


/* ── 5. GOING AND GETTING THE DATA ────────────────────────────────────
   `fetch` means "go to this address on the internet and bring back what
   you find." It takes time, so we mark the function `async` and use
   `await` — which means "wait right here until it comes back."        */

async function getJSON(url){
  const res = await fetch(url, { headers:{ "Accept":"application/geo+json" } });
  if (!res.ok) throw new Error("Server said " + res.status + " for " + url);
  return await res.json();
}


/* ── 6. SORTING WARNINGS BY HOW SCARY THEY ARE ────────────────────────
   ◀ MISSION 5 & 6 live here.                                          */

function classify(eventName){
  const e = eventName.toLowerCase();
  if (e.includes("tornado") && e.includes("warning"))  return "tornado";
  if (e.includes("extreme wind"))                       return "tornado";
  if (e.includes("severe thunderstorm") && e.includes("warning")) return "severe";
  if (e.includes("flash flood") || e.includes("flood")) return "flood";
  if (e.includes("watch"))                              return "watch";
  return "other";
}

// How many "threat points" each kind of alert is worth.
const POINTS = { tornado:100, severe:65, flood:45, watch:35, other:15 };

const COLORS = {
  tornado:"#ff2f45", severe:"#ffb020", flood:"#35ea7a",
  watch:"#b46bff",  other:"#7b8ba0"
};


/* ── 7. THE MAIN LOOP ─────────────────────────────────────────────────
   This runs at startup and then over and over on a timer.             */

async function refresh(){
  const dot = document.getElementById("statusDot");
  const txt = document.getElementById("statusText");

  try{
    // Ask for two things at the same time instead of one after the other.
    // Promise.all means "start both, tell me when BOTH are done."
    const [mine, torUS] = await Promise.all([
      getJSON(NWS + "/alerts/active?area=" + MY.state),
      getJSON(NWS + "/alerts/active?event=Tornado%20Warning")
    ]);

    const alerts = mine.features || [];
    const nationalTornadoes = (torUS.features || []).length;

    drawWarnings(alerts);
    listWarnings(alerts);
    scoreThreat(alerts, nationalTornadoes);
    refreshImages();
    updateConditions();
    updateOutlook();

    dot.className = "dot live";
    txt.textContent = "LIVE · updated " + new Date().toLocaleTimeString();

  } catch(err){
    // Something went wrong. Say so honestly instead of silently doing nothing.
    dot.className = "dot err";
    txt.textContent = "OFFLINE — " + err.message;
    console.error(err);
  }
}


/* ── 8. DRAWING THE WARNING BOXES ON THE MAP ──────────────────────────
   Every warning the NWS issues comes with a POLYGON — the exact shape
   of the ground it covers. That shape is why modern warnings don't
   panic a whole county for a storm hitting one corner of it.          */

function drawWarnings(alerts){
  warningLayer.clearLayers();

  alerts.forEach(function(a){
    if (!a.geometry) return;          // some alerts have no shape; skip them
    const kind = classify(a.properties.event);
    const color = COLORS[kind];

    L.geoJSON(a.geometry, {
      style:{ color:color, weight:2, fillColor:color, fillOpacity:0.15 }
    })
    .bindPopup(
      "<b style='color:" + color + "'>" + a.properties.event + "</b><br>" +
      "<small>" + a.properties.areaDesc + "</small><br><br>" +
      "<small>" + (a.properties.headline || "") + "</small>"
    )
    .addTo(warningLayer);
  });
}


/* ── 9. THE SIDEBAR LIST ──────────────────────────────────────────── */

function listWarnings(alerts){
  const box = document.getElementById("warnList");
  const tag = document.getElementById("warnCount");
  tag.textContent = alerts.length;

  if (alerts.length === 0){
    box.innerHTML =
      '<div class="empty"><span class="big">☀</span>' +
      'Nothing active in ' + MY.state + ' right now.<br><br>' +
      'That is the normal state of the world. Most of storm chasing is ' +
      'waiting, then being ready when it isn\'t normal.</div>';
    return;
  }

  // Sort so the scariest thing is always at the top.
  const sorted = alerts.slice().sort(function(a,b){
    return POINTS[classify(b.properties.event)] - POINTS[classify(a.properties.event)];
  });

  box.innerHTML = sorted.map(function(a){
    const p = a.properties;
    const kind = classify(p.event);
    const ends = p.ends || p.expires;
    const until = ends ? new Date(ends).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "";
    return '<div class="warn ' + kind + '" data-id="' + a.id + '">' +
             '<div class="ev">' + p.event + (until ? " · until " + until : "") + '</div>' +
             '<div class="ar">' + p.areaDesc + '</div>' +
           '</div>';
  }).join("");

  // Click a warning in the list, fly to it on the map.
  box.querySelectorAll(".warn").forEach(function(el){
    el.onclick = function(){
      const hit = alerts.find(function(a){ return a.id === el.dataset.id; });
      if (hit && hit.geometry){
        map.fitBounds(L.geoJSON(hit.geometry).getBounds(), { maxZoom:9, padding:[40,40] });
      }
    };
  });
}


/* ── 10. THE THREAT METER ─────────────────────────────────────────────
   ◀ MISSION 7: this scoring is MINE. Yours can be smarter.            */

function scoreThreat(alerts, nationalTornadoes){
  let score = 5;
  let counts = { tornado:0, severe:0, watch:0 };

  alerts.forEach(function(a){
    const kind = classify(a.properties.event);
    if (POINTS[kind] > score) score = POINTS[kind];   // worst thing wins
    if (counts[kind] !== undefined) counts[kind]++;
  });

  let word, color, note;
  if (score >= 100){
    word="TORNADO"; color="var(--red)";
    note="A tornado warning is active in your state. This is the real thing. Radar-indicated or spotted — either way, people in that polygon need to be underground or in an interior room.";
  } else if (score >= 65){
    word="SEVERE"; color="var(--amber)";
    note="Severe thunderstorm warning active. That means hail 1 inch or larger, or winds 58 mph or stronger. Watch for rotation developing.";
  } else if (score >= 35){
    word="WATCH"; color="var(--purple)";
    note="A watch is out. Watch = conditions are FAVORABLE. Nothing has happened yet. This is when a spotter gets ready, not scared.";
  } else if (score >= 15){
    word="ADVISORY"; color="var(--accent)";
    note="Minor alerts active. Nothing severe.";
  } else {
    word="QUIET"; color="var(--green)";
    note="No active alerts in " + MY.state + ". Good day to study radar archives and work a Mission.";
  }

  document.getElementById("threatWord").textContent = word;
  document.getElementById("threatWord").style.color = color;
  const bar = document.getElementById("threatBar");
  bar.style.width = Math.min(score,100) + "%";
  bar.style.background = color;
  document.getElementById("threatNote").textContent = note;

  document.getElementById("cTor").textContent = counts.tornado;
  document.getElementById("cSev").textContent = counts.severe;
  document.getElementById("cUS").textContent  = nationalTornadoes;

  // ── the alarm ──
  const banner = document.getElementById("alertBanner");
  if (counts.tornado > 0){
    banner.textContent = "⚠  TORNADO WARNING ACTIVE IN " + MY.state + "  ⚠";
    banner.classList.add("on");
    if (MY.soundTheAlarm && !alarmHasSounded){ beep(); alarmHasSounded = true; }
  } else {
    banner.classList.remove("on");
    alarmHasSounded = false;
  }
}


/* ── 11. THE ALARM ────────────────────────────────────────────────────
   Makes a tone using the browser's built-in sound generator. No sound
   file needed — the computer builds the wave from scratch.            */

function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.55, 1.1].forEach(function(delay){
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(720, ctx.currentTime + delay);
      osc.frequency.linearRampToValueAtTime(480, ctx.currentTime + delay + 0.42);
      gain.gain.setValueAtTime(0.16, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.46);
    });
  }catch(e){ /* browser blocked audio until you click something. fine. */ }
}


/* ── 12. THE PICTURE PANELS ───────────────────────────────────────────
   Satellite, outlook, and your radar's own loop. We stick a timestamp
   on the end of each address so the browser fetches a FRESH copy
   instead of showing you an old one it saved. That trick is called
   cache-busting and you will use it for the rest of your life.        */

function refreshImages(){
  const t = "?t=" + Date.now();
  document.getElementById("imgSat").src = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/1250x750.jpg" + t;
  document.getElementById("imgRad").src = "https://radar.weather.gov/ridge/standard/" + MY.radarStation + "_loop.gif" + t;
  document.getElementById("radTag").textContent = MY.radarStation;
}


/* ── 12b. THE SPC CONVECTIVE OUTLOOK, FOR YOUR HOUSE ──────────────────
   The Storm Prediction Center in Norman, Oklahoma draws a map every day
   of where severe storms are possible. These are the risk levels, in
   order from "meh" to "do not make plans":

     TSTM  General thunderstorms — normal summer stuff.
     MRGL  Marginal   (1/5) — isolated severe possible.
     SLGT  Slight     (2/5) — scattered severe. Pay attention.
     ENH   Enhanced   (3/5) — numerous severe. This is a chase day.
     MDT   Moderate   (4/5) — a widespread, dangerous outbreak is likely.
     HIGH  High       (5/5) — rare. Only a few days a year, nationwide.
                              A HIGH risk day is a day people die.

   If your area is not inside ANY of those shapes, you get nothing back,
   which is its own answer: no severe weather expected. Good.            */

const RISK = {
  TSTM:{ c:"#c1e9c1", n:"General thunderstorms" },
  MRGL:{ c:"#66a366", n:"Marginal risk — 1 of 5" },
  SLGT:{ c:"#ffe066", n:"Slight risk — 2 of 5" },
  ENH: { c:"#ffa366", n:"Enhanced risk — 3 of 5" },
  MDT: { c:"#e06666", n:"MODERATE risk — 4 of 5" },
  HIGH:{ c:"#ee99ee", n:"HIGH RISK — 5 of 5" },
};

async function updateOutlook(){
  const box = document.getElementById("spcRows");
  try{
    const d = await getJSON(IEMAPI + "/nws/outlook_by_point.json?lon=" + MY.lon + "&lat=" + MY.lat);
    const rows = d.data || [];

    // Always show Day 1, 2 and 3 — even the empty ones. "Nothing expected"
    // is real information, and a spotter who only looks on scary days is
    // a spotter who misses the day it sneaks up on him.
    box.innerHTML = [1,2,3].map(function(day){
      const hit = rows.find(function(r){
        return r.day === day && r.category === "CATEGORICAL";
      });
      const key  = hit ? hit.threshold : null;
      const info = RISK[key] || { c:"#2b3648", n:"No severe risk area" };
      const dark = !RISK[key];
      return '<div class="spc">' +
               '<span class="day">Day ' + day + '</span>' +
               '<span class="chip" style="background:' + info.c +
                 (dark ? ';color:#7b8ba0' : '') + '">' + (key || "NONE") + '</span>' +
               '<span class="lbl">' + info.n + '</span>' +
             '</div>';
    }).join("");

  }catch(e){
    box.innerHTML = '<div class="empty">Couldn\'t reach the outlook service.<br>' +
                    '<small>' + e.message + '</small></div>';
  }
}


/* ── 13. CURRENT CONDITIONS ───────────────────────────────────────────
   Dewpoint is the one to watch. It's the moisture ingredient — how much
   fuel the air is holding. Storms need it. Below 55°F you rarely get
   real severe weather; 65°F+ in spring means the atmosphere is loaded. */

async function findStation(){
  try{
    const pt = await getJSON(NWS + "/points/" + MY.lat + "," + MY.lon);
    document.getElementById("wfo").textContent = pt.properties.gridId || "—";
    const st = await getJSON(pt.properties.observationStations);
    stationID = st.features[0].properties.stationIdentifier;
  }catch(e){ console.warn("Couldn't find a weather station near you:", e.message); }
}

async function updateConditions(){
  if (!stationID) return;
  try{
    const ob = await getJSON(NWS + "/stations/" + stationID + "/observations/latest");
    const p = ob.properties;
    const F = function(c){ return (c===null||c===undefined) ? "—" : Math.round(c*9/5+32) + "°"; };
    document.getElementById("obTemp").textContent = F(p.temperature.value);
    document.getElementById("obDew").textContent  = F(p.dewpoint.value);
    const mph = p.windSpeed.value===null ? "—" : Math.round(p.windSpeed.value*0.621371) + "";
    document.getElementById("obWind").textContent = mph;
  }catch(e){ /* station briefly offline; leave the last reading up */ }
}


/* ── 14. GO ───────────────────────────────────────────────────────── */

async function start(){
  const problem = checkSettings();
  if (problem){
    document.getElementById("bootMsg").innerHTML =
      "<p><b>" + problem + "</b></p>" +
      "<p>Open <code>my-settings.js</code> in Notepad, fix that, save it, " +
      "then press <b>F5</b> here to try again.</p>" +
      "<p>This is not a disaster. Every programmer alive sees this screen " +
      "several times a day.</p>";
    return;                          // stop here, leave the boot screen up
  }

  document.getElementById("boot").classList.add("off");
  document.getElementById("hName").textContent = MY.spotterName;
  document.getElementById("hID").textContent   = MY.spotterID;
  document.getElementById("hTown").textContent = MY.townName;

  buildMap();
  await findStation();
  await refresh();

  // Do it again every so often, forever.
  tickTimer = setInterval(refresh, Math.max(30, MY.refreshSeconds) * 1000);

  // Clock in the header. UTC matters: all weather data is in UTC ("Zulu")
  // so that a forecaster in Oklahoma and a spotter in Arkansas are never
  // confused about what time a storm hit. Learn to read it.
  setInterval(function(){
    const now = new Date();
    document.getElementById("clkLocal").textContent = now.toLocaleTimeString();
    document.getElementById("clkUTC").textContent =
      String(now.getUTCHours()).padStart(2,"0") + String(now.getUTCMinutes()).padStart(2,"0") + "Z";
  }, 1000);
}

// Click any of the three pictures to blow it up full screen.
function wireLightbox(){
  const lb = document.getElementById("lightbox");
  document.querySelectorAll(".strip img").forEach(function(img){
    img.onclick = function(){
      document.getElementById("lbImg").src = img.src;
      lb.classList.add("on");
    };
  });
  lb.onclick = function(){ lb.classList.remove("on"); };
}

window.addEventListener("DOMContentLoaded", function(){
  wireLightbox();
  start();
});
