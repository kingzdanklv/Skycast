// Skycast – Open-Meteo (weather + air quality), RainViewer (radar), Leaflet (map). No API keys.
const $ = (id) => document.getElementById(id);
let fahrenheit = false;
let last = null; // { name, data }

// WMO weather code -> [emoji, label, scene]
const WMO = {
  0:["☀️","Clear sky","clear"],1:["🌤️","Mostly clear","clear"],2:["⛅","Partly cloudy","partly"],3:["☁️","Overcast","cloudy"],
  45:["🌫️","Fog","cloudy"],48:["🌫️","Rime fog","cloudy"],
  51:["🌦️","Light drizzle","rain"],53:["🌦️","Drizzle","rain"],55:["🌧️","Heavy drizzle","rain"],
  56:["🌧️","Freezing drizzle","rain"],57:["🌧️","Freezing drizzle","rain"],
  61:["🌧️","Light rain","rain"],63:["🌧️","Rain","rain"],65:["🌧️","Heavy rain","rain"],
  66:["🌧️","Freezing rain","rain"],67:["🌧️","Freezing rain","rain"],
  71:["🌨️","Light snow","snow"],73:["🌨️","Snow","snow"],75:["❄️","Heavy snow","snow"],77:["🌨️","Snow grains","snow"],
  80:["🌦️","Rain showers","rain"],81:["🌧️","Rain showers","rain"],82:["🌧️","Violent showers","rain"],
  85:["🌨️","Snow showers","snow"],86:["🌨️","Heavy snow showers","snow"],
  95:["⛈️","Thunderstorm","storm"],96:["⛈️","Thunderstorm with hail","hail"],99:["⛈️","Severe thunderstorm, hail","hail"]
};
const NIGHT = { 0:"🌙", 1:"🌙", 2:"☁️", 51:"🌧️", 53:"🌧️", 80:"🌧️", 81:"🌧️" };
const THEME = { clear:"", partly:"", cloudy:"cloudy", rain:"rain", snow:"snow", storm:"storm", hail:"storm" };

const info = (c) => WMO[c] || ["❔", "Unknown", "clear"];
const icon = (c, day) => (day ? info(c)[0] : NIGHT[c] || info(c)[0]);
const temp = (c) => Math.round(fahrenheit ? c * 9 / 5 + 32 : c) + "°";
const speed = (kmh) => (fahrenheit ? Math.round(kmh * 0.621) + " mph" : Math.round(kmh) + " km/h");
const setStatus = (t) => { $("status").textContent = t; $("status").hidden = !t; };

async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
  const j = await r.json();
  if (!j.results?.length) throw new Error("City not found. Check the spelling.");
  const p = j.results[0];
  return { lat: p.latitude, lon: p.longitude, name: [p.name, p.admin1, p.country].filter(Boolean).join(", ") };
}

async function getWeather(lat, lon) {
  const r = await fetch("https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  }));
  if (!r.ok) throw new Error("Weather service unavailable. Try again.");
  return r.json();
}

function render() {
  if (!last) return;
  const { name, data } = last, c = data.current, day = !!c.is_day;
  const scene = info(c.weather_code)[2];

  document.body.className = (!day && (scene === "clear" || scene === "partly")) ? "clear-night" : THEME[scene];
  Fx.set(scene, day, scene === "storm" || scene === "hail");

  $("place").textContent = name;
  $("icon").textContent = icon(c.weather_code, day);
  $("temp").textContent = temp(c.temperature_2m);
  $("desc").textContent = info(c.weather_code)[1];
  $("feels").textContent = temp(c.apparent_temperature);
  $("hum").textContent = c.relative_humidity_2m + "%";
  $("wind").textContent = speed(c.wind_speed_10m);

  const h = data.hourly;
  let i = h.time.findIndex((t) => t.startsWith(c.time.slice(0, 13)));
  if (i < 0) i = 0;
  $("pop").textContent = (h.precipitation_probability[i] ?? 0) + "%";
  $("hourly").innerHTML = h.time.slice(i, i + 24).map((t, k) => {
    const x = i + k;
    return `<div class="hour"><span>${k === 0 ? "Now" : new Date(t).toLocaleTimeString([], { hour: "numeric" })}</span>
      <span class="e">${icon(h.weather_code[x], h.is_day[x])}</span><span>${temp(h.temperature_2m[x])}</span></div>`;
  }).join("");

  const d = data.daily;
  $("daily").innerHTML = d.time.map((t, k) => `
    <li><span>${k === 0 ? "Today" : new Date(t + "T12:00").toLocaleDateString([], { weekday: "short" })}</span>
      <span class="e">${icon(d.weather_code[k], true)}</span>
      <span class="pop">💧 ${d.precipitation_probability_max[k] ?? 0}%</span>
      <span>${temp(d.temperature_2m_max[k])} / ${temp(d.temperature_2m_min[k])}</span></li>`).join("");

  ["current", "hourly-wrap", "daily-wrap", "radar-wrap"].forEach((id) => ($(id).hidden = false));
  $("units").textContent = fahrenheit ? "Switch to °C" : "Switch to °F";
  setStatus("");
}

/* ---------- Rain radar (RainViewer + Leaflet) ---------- */
const Radar = (() => {
  let map, dot, layers = [], frames = [], pastCount = 0, idx = 0, timer = null, loaded = false;

  function show(i) {
    idx = i;
    layers.forEach((l, k) => l.setOpacity(k === i ? 0.8 : 0));
    const f = frames[i];
    $("radar-time").textContent = new Date(f.time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (i >= pastCount ? " (forecast)" : "");
  }
  function play() { stop(); timer = setInterval(() => show((idx + 1) % frames.length), 700); $("radar-play").textContent = "⏸"; }
  function stop() { clearInterval(timer); timer = null; $("radar-play").textContent = "▶"; }

  async function loadFrames() {
    try {
      const j = await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
      pastCount = j.radar.past.length;
      frames = [...j.radar.past, ...(j.radar.nowcast || [])];
      layers = frames.map((f) => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        { pane: "radar", opacity: 0, maxNativeZoom: 7, maxZoom: 10 }).addTo(map));
      loaded = true; show(pastCount - 1); play();
    } catch { $("radar-time").textContent = "Radar unavailable right now."; }
  }

  async function init(lat, lon) {
    if (!window.L) { $("radar-time").textContent = "Map failed to load."; return; }
    if (!map) {
      map = L.map("map").setView([lat, lon], 6);
      map.createPane("base").style.zIndex = 200;   // base map (gets dark filter in dark mode)
      map.createPane("radar").style.zIndex = 250;  // rain layer stays above it
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { pane: "base", maxZoom: 10, attribution: "© OpenStreetMap contributors" }).addTo(map);
      dot = L.circleMarker([lat, lon], { radius: 6, color: "#fff", fillColor: "#2b6cb0", fillOpacity: 1 }).addTo(map);
      $("radar-play").addEventListener("click", () => (timer ? stop() : play()));
      await loadFrames();
    } else { map.setView([lat, lon], 6); dot.setLatLng([lat, lon]); }
    setTimeout(() => map.invalidateSize(), 100);
  }
  return { init };
})();

/* ---------- Air quality (US AQI) ---------- */
const AQI = [
  [50, "Good", "Air is clean. Enjoy time outdoors."],
  [100, "Moderate", "Acceptable. Very sensitive people may want to limit long outdoor effort."],
  [150, "Unhealthy for sensitive groups", "Children, older adults and people with asthma should limit outdoor effort."],
  [200, "Unhealthy", "Everyone should reduce long or heavy outdoor activity."],
  [300, "Very unhealthy", "Avoid outdoor activity. Keep windows closed."],
  [Infinity, "Hazardous", "Stay indoors and use an air purifier if you have one."]
];
const AQI_COLORS = ["#4caf50", "#e6c229", "#f28c28", "#e0463d", "#9b4dca", "#7e1d3c"];

async function loadAir(lat, lon) {
  try {
    const r = await fetch("https://air-quality-api.open-meteo.com/v1/air-quality?" + new URLSearchParams({
      latitude: lat, longitude: lon,
      current: "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide"
    }));
    const c = (await r.json()).current;
    if (c?.us_aqi == null) throw new Error();
    const n = Math.round(c.us_aqi), k = AQI.findIndex(([max]) => n <= max);
    $("aqi-num").textContent = n;
    $("aqi-num").style.background = AQI_COLORS[k];
    $("aqi-cat").textContent = AQI[k][1];
    $("aqi-tip").textContent = AQI[k][2];
    $("aqi-pin").style.left = Math.min(n, 300) / 300 * 100 + "%";
    const p = [["PM2.5", c.pm2_5], ["PM10", c.pm10], ["Ozone", c.ozone], ["NO₂", c.nitrogen_dioxide], ["SO₂", c.sulphur_dioxide], ["CO", c.carbon_monoxide]];
    $("pollutants").innerHTML = p.map(([l, v]) => `<div><dt>${l}</dt><dd>${v == null ? "–" : Math.round(v * 10) / 10}<small> µg/m³</small></dd></div>`).join("");
    $("air-wrap").hidden = false;
  } catch { $("air-wrap").hidden = true; }
}

async function load(lat, lon, name) {
  try {
    setStatus("Loading forecast…");
    last = { name, data: await getWeather(lat, lon) };
    localStorage.setItem("skycast:last", JSON.stringify({ lat, lon, name }));
    render();
    Radar.init(lat, lon);
    loadAir(lat, lon);
  } catch (e) { setStatus(e.message); }
}

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { setStatus("Searching…"); const p = await geocode($("q").value.trim()); load(p.lat, p.lon, p.name); }
  catch (err) { setStatus(err.message); }
});

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Location is not supported on this device.");
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (p) => load(p.coords.latitude, p.coords.longitude, "Your location"),
    () => setStatus("Location blocked. Allow access or search a city.")
  );
});

$("units").addEventListener("click", () => { fahrenheit = !fahrenheit; render(); });

try { const s = JSON.parse(localStorage.getItem("skycast:last")); if (s) load(s.lat, s.lon, s.name); } catch {}

/* ---------- Light / dark mode (auto -> light -> dark) ---------- */
const MODES = ["auto", "light", "dark"], MODE_ICON = { auto: "🌓", light: "☀️", dark: "🌙" };
const sysDark = matchMedia("(prefers-color-scheme: dark)");
let mode = "auto";
try { mode = localStorage.getItem("skycast:mode") || "auto"; } catch {}
function applyMode() {
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "auto" && sysDark.matches));
  $("theme").textContent = MODE_ICON[mode];
  $("theme").title = $("theme").ariaLabel = "Theme: " + mode;
}
$("theme").addEventListener("click", () => {
  mode = MODES[(MODES.indexOf(mode) + 1) % 3];
  try { localStorage.setItem("skycast:mode", mode); } catch {}
  applyMode();
});
sysDark.addEventListener("change", applyMode);
applyMode();
