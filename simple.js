/* simple.js */
/* global SunCalc */

const THRESHOLDS = {
  sunAltMax: 19.5,
  moonAltMax: 4.0,
  planeDistMax: 30.0,
  sunTolerance: 10.0,
  moonTolerance: 6.0,
  planeTolerance: 20.0,
  cloudBonusMax: 10.0,
  cloudGoodAt: 70
};

const LONDON = { lat: 51.5074, lon: -0.1278 };

// Moon in centre between Milky Way pillars rule
const MOON_PILLAR_CENTRE_TOL_DEG = 15;   // your rule; plus or minus 15 degrees
const MOON_PILLAR_BONUS = 8;             // tune later
const MOON_PILLAR_PENALTY = 8;           // tune later

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function radToDeg(r){ return r * 180 / Math.PI; }
function degToRad(d){ return d * Math.PI / 180; }

function el(id){ return document.getElementById(id); }
function setText(id, txt){ const n = el(id); if (n) n.textContent = txt; }
function setMarker(percent){
  const n = el("marker");
  if (!n) return;
  n.style.left = `${Math.max(0, Math.min(100, percent))}%`;
}
function setStatus(text, ok){
  const s = el("status");
  if (!s) return;
  s.textContent = text;
  if (ok === true) s.style.background = "rgba(52,199,89,0.14)";
  if (ok === false) s.style.background = "rgba(255,59,48,0.14)";
}

function julianDate(date){ return date.getTime() / 86400000 + 2440587.5; }
function daysSinceJ2000(date){ return julianDate(date) - 2451545.0; }

function gmstDegrees(date){
  const D = daysSinceJ2000(date);
  let gmst = 280.46061837 + 360.98564736629 * D;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}
function lstDegrees(date, lonDeg){
  let lst = gmstDegrees(date) + lonDeg;
  lst = ((lst % 360) + 360) % 360;
  return lst;
}

function radecToVector(raDeg, decDeg){
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec)
  ];
}
function equatorialToGalactic(vec){
  const [x, y, z] = vec;
  const m = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [ 0.4941094279, -0.4448296299,  0.7469822445],
    [-0.8676661490, -0.1980763734,  0.4559837762]
  ];
  return [
    m[0][0]*x + m[0][1]*y + m[0][2]*z,
    m[1][0]*x + m[1][1]*y + m[1][2]*z,
    m[2][0]*x + m[2][1]*y + m[2][2]*z
  ];
}

// Inverse of the above (rotation matrix transpose)
function galacticToEquatorial(vec){
  const [gx, gy, gz] = vec;
  const mt = [
    [-0.0548755604,  0.4941094279, -0.8676661490],
    [-0.8734370902, -0.4448296299, -0.1980763734],
    [-0.4838350155,  0.7469822445,  0.4559837762]
  ];
  return [
    mt[0][0]*gx + mt[0][1]*gy + mt[0][2]*gz,
    mt[1][0]*gx + mt[1][1]*gy + mt[1][2]*gz,
    mt[2][0]*gx + mt[2][1]*gy + mt[2][2]*gz
  ];
}

function galacticPlaneDistanceFromZenithDeg(date, latDeg, lonDeg){
  const raZenith = lstDegrees(date, lonDeg);
  const decZenith = latDeg;
  const eqVec = radecToVector(raZenith, decZenith);
  const galVec = equatorialToGalactic(eqVec);
  const gz = Math.max(-1, Math.min(1, galVec[2]));
  const bDeg = radToDeg(Math.asin(gz));
  return Math.abs(bDeg);
}

// Convert equatorial RA/Dec to local horizon alt/az using robust ENU vector method
function raDecToAltAzDeg(raDeg, decDeg, date, latDeg, lonDeg){
  const lat = degToRad(latDeg);
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const lst = degToRad(lstDegrees(date, lonDeg));
  const H = (lst - ra + 2*Math.PI) % (2*Math.PI);

  const xEast  = Math.cos(dec) * Math.sin(H);
  const yNorth = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(H) * Math.sin(lat);
  const zUp    = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(H) * Math.cos(lat);

  const alt = Math.asin(Math.max(-1, Math.min(1, zUp)));
  let az = Math.atan2(xEast, yNorth); // from north, eastward
  az = (az + 2*Math.PI) % (2*Math.PI);

  return { altDeg: radToDeg(alt), azDeg: radToDeg(az) };
}

// Convert galactic (l,b) to equatorial RA/Dec (degrees)
function galacticLBToRaDecDeg(lDeg, bDeg){
  const l = degToRad(lDeg);
  const b = degToRad(bDeg);

  const gx = Math.cos(b) * Math.cos(l);
  const gy = Math.cos(b) * Math.sin(l);
  const gz = Math.sin(b);

  const [ex, ey, ez] = galacticToEquatorial([gx, gy, gz]);

  let ra = Math.atan2(ey, ex);
  ra = (ra + 2*Math.PI) % (2*Math.PI);
  const dec = Math.asin(Math.max(-1, Math.min(1, ez)));

  return { raDeg: radToDeg(ra), decDeg: radToDeg(dec) };
}

function angularDistanceDeg(a, b){
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}
function angleLerpDeg(a, b, t){
  // interpolate along shortest arc
  let d = ((b - a) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return (a + d * t + 360) % 360;
}
function midAzimuthDeg(a1, a2){
  let d = ((a2 - a1) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return (a1 + d / 2 + 360) % 360;
}

// Find the two horizon crossings ("pillars") of the galactic plane by sampling the plane (b=0)
function findGalacticPlaneHorizonCrossingsAz(date, latDeg, lonDeg){
  const points = [];
  const step = 5; // degrees of galactic longitude sampling

  for (let l = 0; l <= 360; l += step){
    const { raDeg, decDeg } = galacticLBToRaDecDeg(l % 360, 0);
    const { altDeg, azDeg } = raDecToAltAzDeg(raDeg, decDeg, date, latDeg, lonDeg);
    points.push({ l: l % 360, altDeg, azDeg });
  }

  const crossings = [];
  for (let i = 0; i < points.length - 1; i++){
    const a1 = points[i].altDeg;
    const a2 = points[i+1].altDeg;

    if ((a1 === 0) || (a1 > 0 && a2 < 0) || (a1 < 0 && a2 > 0)){
      const denom = (a1 - a2);
      if (Math.abs(denom) < 1e-9) continue;

      const t = a1 / (a1 - a2); // fraction along segment where alt hits 0
      const azCross = angleLerpDeg(points[i].azDeg, points[i+1].azDeg, t);
      crossings.push(azCross);
    }
  }

  // De-duplicate crossings (sampling can create close repeats)
  crossings.sort((x, y) => x - y);
  const uniq = [];
  for (const az of crossings){
    if (uniq.length === 0) { uniq.push(az); continue; }
    if (angularDistanceDeg(az, uniq[uniq.length - 1]) > 6) uniq.push(az);
  }

  // We only need two; pick the pair with the largest separation
  if (uniq.length < 2) return [];
  let best = [uniq[0], uniq[1]];
  let bestSep = angularDistanceDeg(uniq[0], uniq[1]);

  for (let i = 0; i < uniq.length; i++){
    for (let j = i + 1; j < uniq.length; j++){
      const sep = angularDistanceDeg(uniq[i], uniq[j]);
      if (sep > bestSep){
        bestSep = sep;
        best = [uniq[i], uniq[j]];
      }
    }
  }

  return best;
}

async function fetchCloudCoverNow(lat, lon){
  const base = "https://api.open-meteo.com/v1/forecast";
  const url = `${base}?latitude=${lat}&longitude=${lon}&current=cloud_cover&timezone=auto`;
  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.current && typeof data.current.cloud_cover === "number"){
      return data.current.cloud_cover;
    }
  }catch(e){
    return null;
  }
  return null;
}

function scoreRaybats({ sunAlt, moonAlt, planeDist, cloudPct }){
  const sunRating  = clamp01((THRESHOLDS.sunAltMax  + THRESHOLDS.sunTolerance  - sunAlt)   / THRESHOLDS.sunTolerance);
  const moonRating = clamp01((THRESHOLDS.moonAltMax + THRESHOLDS.moonTolerance - moonAlt)  / THRESHOLDS.moonTolerance);
  const planeRating= clamp01((THRESHOLDS.planeDistMax + THRESHOLDS.planeTolerance - planeDist) / THRESHOLDS.planeTolerance);

  let score = 100 * (0.4*sunRating + 0.4*moonRating + 0.2*planeRating);

  if (typeof cloudPct === "number"){
    const cloudRating = clamp01(cloudPct / THRESHOLDS.cloudGoodAt);
    score += THRESHOLDS.cloudBonusMax * cloudRating;
  }

  score = Math.max(0, Math.min(100, score));

  const go = (sunAlt <= THRESHOLDS.sunAltMax)
    && (moonAlt <= THRESHOLDS.moonAltMax)
    && (planeDist <= THRESHOLDS.planeDistMax);

  return { score, go };
}

function formatLocalTime(date){
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function findNextGoWindow({ lat, lon }){
  const now = new Date();
  const end = new Date(now.getTime() + 24*60*60*1000);
  const stepMs = 5 * 60 * 1000;

  let inGo = false;
  let start = null;
  let finish = null;

  for (let t = now.getTime(); t <= end.getTime(); t += stepMs){
    const d = new Date(t);

    const sunAlt = radToDeg(SunCalc.getPosition(d, lat, lon).altitude);
    const moonAlt = radToDeg(SunCalc.getMoonPosition(d, lat, lon).altitude);
    const planeDist = galacticPlaneDistanceFromZenithDeg(d, lat, lon);

    const go = (sunAlt <= THRESHOLDS.sunAltMax)
      && (moonAlt <= THRESHOLDS.moonAltMax)
      && (planeDist <= THRESHOLDS.planeDistMax);

    if (go && !inGo){ inGo = true; start = new Date(t); }
    if (!go && inGo){ inGo = false; finish = new Date(t); break; }
  }

  if (inGo && start && !finish) finish = end;
  return { start, finish };
}

async function update(lat, lon){
  try{
    if (typeof SunCalc === "undefined"){
      setStatus("Error", false);
      setText("summary", "Astronomy library blocked; refresh or try another browser.");
      return;
    }

    const now = new Date();

    const sunAlt = radToDeg(SunCalc.getPosition(now, lat, lon).altitude);
    const moonPos = SunCalc.getMoonPosition(now, lat, lon);
    const moonAlt = radToDeg(moonPos.altitude);

    // SunCalc azimuth is from south, positive west; convert to degrees from north, eastward
    let moonAzDeg = (radToDeg(moonPos.azimuth) + 180) % 360;
    moonAzDeg = (moonAzDeg + 360) % 360;

    const planeDist = galacticPlaneDistanceFromZenithDeg(now, lat, lon);
    const cloudPct = await fetchCloudCoverNow(lat, lon);

    let { score, go } = scoreRaybats({ sunAlt, moonAlt, planeDist, cloudPct });

    // New rule; Moon within ±15 degrees of the centre between the two Milky Way horizon crossings
    const pillars = findGalacticPlaneHorizonCrossingsAz(now, lat, lon);
    if (pillars.length === 2){
      const centreAz = midAzimuthDeg(pillars[0], pillars[1]);
      const distToCentre = angularDistanceDeg(moonAzDeg, centreAz);

      if (distToCentre <= MOON_PILLAR_CENTRE_TOL_DEG){
        score = Math.min(100, score + MOON_PILLAR_BONUS);
      } else if (distToCentre >= MOON_PILLAR_CENTRE_TOL_DEG * 2){
        score = Math.max(0, score - MOON_PILLAR_PENALTY);
      }
    }

    setMarker(score);
    setStatus(go ? "GO" : "NO GO", go);

    const { start, finish } = findNextGoWindow({ lat, lon });
    const nextTxt = (start && finish)
      ? `Next good window; ${formatLocalTime(start)} to ${formatLocalTime(finish)}.`
      : "No good window found in the next 24 hours.";

    setText("summary", nextTxt);
  }catch(e){
    setStatus("Error", false);
    setText("summary", "Script error; refresh.");
  }
}

function startWithGeolocation(){
  setStatus("Checking", null);
  setText("summary", "Requesting location permission.");

  if (!navigator.geolocation){
    setText("summary", "Geolocation not available; using London.");
    update(LONDON.lat, LONDON.lon);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => update(pos.coords.latitude, pos.coords.longitude),
    () => {
      setText("summary", "Location blocked; using London. Open full screen for exact location.");
      update(LONDON.lat, LONDON.lon);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

window.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = el("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => startWithGeolocation());

  const manualBtn = el("manualBtn");
  if (manualBtn) manualBtn.addEventListener("click", () => update(LONDON.lat, LONDON.lon));

  const openLink = el("openLink");
  if (openLink) openLink.href = window.location.href;

  startWithGeolocation();
  setInterval(() => startWithGeolocation(), 60000);
});
