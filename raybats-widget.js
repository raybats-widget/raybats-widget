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

function fmtDeg(x){ return `${x.toFixed(1)}°`; }

function setMarker(id, percent){
  const el = document.getElementById(id);
  el.style.left = `${Math.max(0, Math.min(100, percent))}%`;
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
    if (!go && inGo){ in
