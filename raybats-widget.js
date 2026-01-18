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

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function radToDeg(r){ return r * 180 / Math.PI; }
function degToRad(d){ return d * Math.PI / 180; }

function el(id){ return document.getElementById(id); }
function setText(id, txt){ const n = el(id); if (n) n.textContent = txt; }
function setMarker(id, percent){
  const n = el(id);
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

function fmtDeg(x){ return `${x.toFixed(1)}°`; }

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
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return [x, y, z];
}
function equatorialToGalactic(vec){
  const [x, y, z] = vec;
  const m = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [ 0.4941094279, -0.4448296299,  0.7469822445],
    [-0.8676661490, -0.1980763734,  0.4559837762]
  ];
  const gx = m[0][0]*x + m[0][1]*y + m[0][2]*z;
  const gy = m[1][0]*x + m[1][1]*y + m[1][2]*z;
  const gz = m[2][0]*x + m[2][1]*y + m[2][2]*z;
  return [gx, gy, gz];
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

function barPosInverted(value, max, tol){
  return 100 * clamp01((max + tol - value) / tol);
}
function barPosPlane(dist, distMax, tol){
  return 100 * clamp01((distMax + tol - dist) / tol);
}
function barPosCloud(cloudPct){
  return 100 * clamp01(cloudPct / THRESHOLDS.cloudGoodAt);
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
      setText("summary", "SunCalc did not load; check ad blocker or tracking protection; then refresh.");
      return;
    }

    const now = new Date();

    const sunAlt = radToDeg(SunCalc.getPosition(now, lat, lon).altitude);
    const moonAlt = radToDeg(SunCalc.getMoonPosition(now, lat, lon).altitude);
    const planeDist = galacticPlaneDistanceFromZenithDeg(now, lat, lon);
    const cloudPct = await fetchCloudCoverNow(lat, lon);

    const { score, go } = scoreRaybats({ sunAlt, moonAlt, planeDist, cloudPct });

    setMarker("marker", score);
    setStatus(go ? "GO" : "NO GO", go);

    setMarker("sunMarker", barPosInverted(sunAlt, THRESHOLDS.sunAltMax, THRESHOLDS.sunTolerance));
    setMarker("moonMarker", barPosInverted(moonAlt, THRESHOLDS.moonAltMax, THRESHOLDS.moonTolerance));
    setMarker("planeMarker", barPosPlane(planeDist, THRESHOLDS.planeDistMax, THRESHOLDS.planeTolerance));
    setMarker("cloudMarker", (typeof cloudPct === "number") ? barPosCloud(cloudPct) : 0);

    setText("sunVal", fmtDeg(sunAlt));
    setText("moonVal", fmtDeg(moonAlt));
    setText("planeVal", `|b| ${fmtDeg(planeDist)}`);
    setText("cloudVal", (typeof cloudPct === "number") ? `${cloudPct.toFixed(0)}%` : "n/a");

    const { start, finish } = findNextGoWindow({ lat, lon });

    const nextTxt = (start && finish)
      ? `Next good window; ${formatLocalTime(start)} to ${formatLocalTime(finish)}.`
      : "No GO window found in the next 24 hours using these thresholds.";

    const summary = [
      `Location; ${lat.toFixed(4)}, ${lon.toFixed(4)}.`,
      `Sun; ${fmtDeg(sunAlt)} (≤ ${THRESHOLDS.sunAltMax}°).`,
      `Moon; ${fmtDeg(moonAlt)} (≤ ${THRESHOLDS.moonAltMax}°).`,
      `Plane overhead; |b| ${fmtDeg(planeDist)} (≤ ${THRESHOLDS.planeDistMax}°).`,
      (typeof cloudPct === "number") ? `Cloud; ${cloudPct.toFixed(0)}%.` : "Cloud; n/a.",
      nextTxt
    ].join(" ");

    setText("summary", summary);
  }catch(e){
    setStatus("Error", false);
    setText("summary", `Script error; ${e && e.message ? e.message : "unknown"}.`);
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
      setText("summary", "Location blocked; using London. Allow location in browser settings for exact location.");
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
