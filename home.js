// ====== DOM ELEMENTS ======
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const cityNameEl = document.getElementById('cityName');
const lastUpdatedEl = document.getElementById('lastUpdated');
const refreshBtn = document.getElementById('refreshBtn');
const addToMonitorBtn = document.getElementById('addToMonitorBtn');

const aqiCircle = document.getElementById('aqiCircle');
const aqiValue = document.getElementById('aqiValue');
const aqiStatus = document.getElementById('aqiStatus');
const healthAdvice = document.getElementById('healthAdvice');

const pm25Value = document.getElementById('pm25Value');
const pm25Bar = document.getElementById('pm25Bar');
const pm10Value = document.getElementById('pm10Value');
const pm10Bar = document.getElementById('pm10Bar');
const coValue = document.getElementById('coValue');
const coBar = document.getElementById('coBar');
const no2Value = document.getElementById('no2Value');
const no2Bar = document.getElementById('no2Bar');

// ====== STATE ======
let currentCity = 'Krishnagiri';
let autoRefreshTimer = null;
let currentCityColor = '#10b981'; 

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', () => {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    const cityName = await fetchCityNameByCoords(lat, lon);
                    currentCity = cityName;
                    
                    const aqiData = await fetchAirQuality(lat, lon);
                    updateUI(cityName, aqiData);
                    localStorage.setItem('lastSearchedCity', cityName);
                    startAutoRefresh();
                } catch (error) {
                    console.warn('Geolocation reverse geocoding failed', error);
                    fallbackToDefault();
                }
            },
            (error) => {
                console.warn('Geolocation denied or failed', error);
                fallbackToDefault();
            },
            { timeout: 10000 }
        );
    } else {
        fallbackToDefault();
    }

    // Event Listeners
    searchBtn.addEventListener('click', handleSearch);
    cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('fa-spin');
        loadDashboardData(currentCity).then(() => {
            setTimeout(() => refreshBtn.classList.remove('fa-spin'), 500);
        });
    });
    
    addToMonitorBtn.addEventListener('click', addToMonitorList);
});

// ====== MAIN FLOW ======
async function loadDashboardData(city) {
    try {
        const coordinates = await fetchCoordinates(city);
        const aqiData = await fetchAirQuality(coordinates.lat, coordinates.lon);
        
        updateUI(city, aqiData);
        
        currentCity = city;
        localStorage.setItem('lastSearchedCity', city);
        startAutoRefresh();
        
    } catch (error) {
        console.warn('API fetch failed, using fallback data.', error);
        
        if (error.message === 'City not found') {
            showNotification('City not found. Please try another.', 'error');
            return;
        }
        
        showNotification('Using simulated data.', 'error');
        updateUI(city, generateSimulatedData());
        currentCity = city;
        localStorage.setItem('lastSearchedCity', city);
    }
}

// ====== UI UPDATERS ======
function updateUI(city, data) {
    cityNameEl.textContent = city.charAt(0).toUpperCase() + city.slice(1);
    
    const date = new Date();
    lastUpdatedEl.textContent = `Last updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    const p = data.components;
    
    // Calculate realistic AQI based on PM2.5 metric
    let mappedAqiValue = calculateAQI(p.pm2_5);
    const aqiConfig = getAqiConfig(mappedAqiValue);
    
    // Update AQI Box
    animateValue(aqiValue, parseInt(aqiValue.textContent) || 0, mappedAqiValue, 1000);
    aqiCircle.style.borderColor = aqiConfig.color;
    aqiCircle.style.boxShadow = `0 0 20px ${aqiConfig.color}40`; 
    currentCityColor = aqiConfig.color; 
    
    aqiStatus.textContent = aqiConfig.label;
    healthAdvice.textContent = aqiConfig.advice;
    
    // Update Pollutants
    animateValue(pm25Value, parseFloat(pm25Value.textContent) || 0, Math.round(p.pm2_5), 1000);
    animateValue(pm10Value, parseFloat(pm10Value.textContent) || 0, Math.round(p.pm10), 1000);
    animateValue(coValue, parseFloat(coValue.textContent) || 0, Math.round(p.co), 1000);
    animateValue(no2Value, parseFloat(no2Value.textContent) || 0, Math.round(p.no2), 1000); 
    
    updateProgressBar(pm25Bar, p.pm2_5, 100, aqiConfig.color);
    updateProgressBar(pm10Bar, p.pm10, 200, aqiConfig.color);
    updateProgressBar(coBar, p.co, 2000, aqiConfig.color);
    updateProgressBar(no2Bar, p.no2, 200, aqiConfig.color);
}

// ====== UTILS ======
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = progress * (2 - progress);
        const current = Math.floor(easeOut * (end - start) + start);
        obj.innerHTML = current;
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerHTML = end;
    };
    window.requestAnimationFrame(step);
}

function updateProgressBar(element, value, max, color) {
    const percentage = Math.min((value / max) * 100, 100);
    element.style.width = `${percentage}%`;
    element.style.backgroundColor = color;
}

function handleSearch() {
    const city = cityInput.value.trim();
    if (!city) return showNotification('Please enter a city name', 'error');
    loadDashboardData(city);
    cityInput.value = '';
    cityInput.blur();
}

function addToMonitorList() {
    let monitoredCities = JSON.parse(localStorage.getItem('monitoredCities')) || {};
    
    const newEntry = {
        timestamp: new Date().toISOString(),
        aqi: aqiValue.textContent,
        pm25: pm25Value.textContent,
        pm10: pm10Value.textContent,
        co: coValue.textContent,
        no2: no2Value.textContent,
        status: aqiStatus.textContent,
        color: currentCityColor
    };
    
    const formattedCity = currentCity.charAt(0).toUpperCase() + currentCity.slice(1);
    
    if (!monitoredCities[formattedCity]) monitoredCities[formattedCity] = [];
    monitoredCities[formattedCity].push(newEntry);
    
    if (monitoredCities[formattedCity].length > 30) monitoredCities[formattedCity].shift();
    
    localStorage.setItem('monitoredCities', JSON.stringify(monitoredCities));
    showNotification(`${formattedCity} added to Monitoring!`);
}

function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => loadDashboardData(currentCity), 30000);
}

function fallbackToDefault() {
    currentCity = 'Krishnagiri';
    loadDashboardData(currentCity);
    startAutoRefresh();
}
