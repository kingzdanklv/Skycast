// Skycast – uses Open-Meteo (free, no API key): https://open-meteo.com
const $ = (id) => document.getElementById(id);
let fahrenheit = false;
let last = null; // { name, data }

// WMO weather codes -> [emoji, label, theme class]
const WMO = {
  0:["☀️","Clear sky","clear"],1:["🌤️","Mostly clear","clear"],2:["⛅","Partly cloudy","cloudy"],3:["☁️","Overcast","cloudy"],
  45:["🌫️","Fog","cloudy"],48:["🌫️","Rime fog","cloudy"],
  51:["🌦️","Light drizzle","rain"],53:["🌦️","Drizzle","rain"],55:["🌧️","Heavy drizzle","rain"],
  61:["🌧️","Light rain","rain"],63:["🌧️","Rain","rain"],65:["🌧️","Heavy rain","rain"],
  71:["🌨️","Light snow","snow"],73:["🌨️","Snow","snow"],75:["❄️","Heavy snow","snow"],77:["🌨️","Snow grains","snow"],
  80:["🌦️","Rain showers","rain"],81:["🌧️","Rain showers","rain"],82:["⛈️","Violent showers","storm"],
  85:["🌨️","Snow showers","snow"],86:["🌨️","Heavy snow showers","snow"],
  95:["⛈️","Thunderstorm","storm"],96:["⛈️","Thunderstorm, hail","storm"],99:["⛈️","Severe thunderstorm","storm"]
};
const info = (c) => WMO[c] || ["❔","Unknown","clear"];

const temp = (c) => Math.round(fahrenheit ? c * 9/5 + 32 : c) + "°";
const speed = (kmh) => fahrenheit ? Math.round(kmh * 0.621) + " mph" : Math.round(kmh) + " km/h";
const setStatus = (t) => { $("status").textContent = t; $("status").hidden = !t; };

async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
  const j = await r.json();
  if (!j.results?.length) throw new Error("City not found. Check the spelling.");
  const p = j.results[0];
  return { lat: p.latitude, lon: p.longitude, name: [p.name, p.admin1, p.country].filter(Boolean).join(", ") };
}

async function getWeather(lat, lon) {
  const url = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  });
  const r = await fetch(url);
  if (!r.ok) throw new Error("Weather service unavailable. Try again.");
  return r.json();
}

function render() {
  if (!last) return;
  const { name, data } = last, c = data.current;
  const [emoji, label, theme] = info(c.weather_code);

  document.body.className = (theme === "clear" && !c.is_day) ? "clear-night" : theme === "clear" ? "" : theme;
  $("place").textContent = name;
  $("icon").textContent = emoji;
  $("temp").textContent = temp(c.temperature_2m);
  $("desc").textContent = label;
  $("feels").textContent = temp(c.apparent_temperature);
  $("hum").textContent = c.relative_humidity_2m + "%";
  $("wind").textContent = speed(c.wind_speed_10m);

  // Hourly: start from the current hour
  const h = data.hourly;
  const now = data.current.time.slice(0, 13);
  let i = h.time.findIndex((t) => t.startsWith(now));
  if (i < 0) i = 0;
  $("pop").textContent = (h.precipitation_probability[i] ?? 0) + "%";
  $("hourly").innerHTML = h.time.slice(i, i + 24).map((t, k) => {
    const idx = i + k;
    return `<div class="hour"><span>${k === 0 ? "Now" : new Date(t).toLocaleTimeString([], {hour:"numeric"})}</span>
      <span class="e">${info(h.weather_code[idx])[0]}</span><span>${temp(h.temperature_2m[idx])}</span></div>`;
  }).join("");

  const d = data.daily;
  $("daily").innerHTML = d.time.map((t, k) => `
    <li><span>${k === 0 ? "Today" : new Date(t + "T12:00").toLocaleDateString([], {weekday:"short"})}</span>
      <span class="e">${info(d.weather_code[k])[0]}</span>
      <span class="pop">💧 ${d.precipitation_probability_max[k] ?? 0}%</span>
      <span>${temp(d.temperature_2m_max[k])} / ${temp(d.temperature_2m_min[k])}</span></li>`).join("");

  ["current", "hourly-wrap", "daily-wrap"].forEach((id) => ($(id).hidden = false));
  $("units").textContent = fahrenheit ? "Switch to °C" : "Switch to °F";
  setStatus("");
}

async function load(lat, lon, name) {
  try {
    setStatus("Loading forecast…");
    last = { name, data: await getWeather(lat, lon) };
    localStorage.setItem("skycast:last", JSON.stringify({ lat, lon, name }));
    render();
  } catch (e) { setStatus(e.message); }
}

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Searching…");
    const p = await geocode($("q").value.trim());
    load(p.lat, p.lon, p.name);
  } catch (err) { setStatus(err.message); }
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

// Restore last city
try {
  const s = JSON.parse(localStorage.getItem("skycast:last"));
  if (s) load(s.lat, s.lon, s.name);
} catch {}
