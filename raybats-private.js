/* raybats-private.js */
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
fu
