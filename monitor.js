// ====== DOM ELEMENTS ======
const citiesListEl = document.getElementById('citiesList');
const addCityForm = document.getElementById('addCityForm');
const newCityInput = document.getElementById('newCityInput');

const emptyStateEl = document.getElementById('emptyState');
const aqiChartCanvas = document.getElementById('aqiChart');
const chartTitleEl = document.getElementById('chartTitle');
const chartSubtitleEl = document.getElementById('chartSubtitle');

// ====== STATE ======
let monitoredCities = {}; 
let activeCity = null;
let aqiChartInstance = null;
let autoRefreshTimer = null;

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    renderCitiesList();
    startAutoRefresh();

    addCityForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const city = newCityInput.value.trim();
        if (city) addNewCity(city);
    });
});

// ====== LOCAL STORAGE & DATA LOGIC ======
function loadLocalData() {
    try {
        const data = localStorage.getItem('monitoredCities');
        if (data) monitoredCities = JSON.parse(data);
    } catch (e) {
        monitoredCities = {};
    }
}

function saveLocalData() {
    localStorage.setItem('monitoredCities', JSON.stringify(monitoredCities));
}

async function addNewCity(city) {
    const formattedCity = city.charAt(0).toUpperCase() + city.toLowerCase().slice(1);
    
    if (Object.keys(monitoredCities).some(k => k.toLowerCase() === formattedCity.toLowerCase())) {
        showNotification(`${formattedCity} is already in the list!`, 'error');
        newCityInput.value = '';
        return;
    }
    
    await fetchAndUpdateCity(formattedCity, true);
    newCityInput.value = '';
}

async function fetchAndUpdateCity(city, isNew = false) {
    try {
        const coordinates = await fetchCoordinates(city);
        const aqiData = await fetchAirQuality(coordinates.lat, coordinates.lon);
        
        appendCityData(city, aqiData);
        if (isNew) {
            showNotification(`${city} added successfully!`, 'success');
            activeCity = city; 
        }
    } catch (error) {
        if (isNew && error.message === 'City not found') {
            showNotification('City not found. Please try another.', 'error');
            return;
        }
        
        if (isNew) showNotification(`Using simulated data for ${city}.`, 'error');
        appendCityData(city, generateSimulatedData());
        if (isNew) activeCity = city;
    }
    
    saveLocalData();
    renderCitiesList();
    if (activeCity === city || isNew) renderChart(activeCity);
}

function appendCityData(city, data) {
    if (!monitoredCities[city]) monitoredCities[city] = [];
    
    const p = data.components;
    let simulatedAqi = calculateAQI(p.pm2_5);
    const aqiConfig = getAqiConfig(simulatedAqi);
    
    const entry = {
        timestamp: new Date().toISOString(),
        aqi: simulatedAqi,
        pm25: Math.round(p.pm2_5),
        pm10: Math.round(p.pm10),
        co: Math.round(p.co),
        no2: Math.round(p.no2),
        status: aqiConfig.label,
        color: aqiConfig.color 
    };
    
    monitoredCities[city].push(entry);
    
    if (monitoredCities[city].length > 30) monitoredCities[city].shift();
}

// ====== UI RENDERING ======
function renderCitiesList() {
    citiesListEl.innerHTML = '';
    const cityNames = Object.keys(monitoredCities);
    
    if (cityNames.length === 0) {
        citiesListEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">No cities added yet.</div>';
        emptyStateEl.style.display = 'flex';
        aqiChartCanvas.style.display = 'none';
        chartTitleEl.textContent = 'Historical AQI Trends';
        chartSubtitleEl.textContent = 'Add a city to view its trends';
        return;
    }
    
    cityNames.sort();
    
    if (!activeCity && cityNames.length > 0) {
        activeCity = cityNames[0];
        renderChart(activeCity);
    }
    
    cityNames.forEach(city => {
        const history = monitoredCities[city];
        const latest = history[history.length - 1];
        
        const cityItem = document.createElement('div');
        cityItem.className = `city-item ${activeCity === city ? 'active' : ''}`;
        
        cityItem.innerHTML = `
            <div class="city-item-info">
                <span class="city-item-name">${city}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted)">AQI: ${latest.aqi}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.8rem;">
                <span class="city-item-aqi" style="background-color: ${latest.color}20; color: ${latest.color}; border: 1px solid ${latest.color}50;">
                    ${latest.status}
                </span>
                <button class="remove-city-btn" data-city="${city}" title="Remove City">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        cityItem.addEventListener('click', (e) => {
            if (e.target.closest('.remove-city-btn')) return;
            activeCity = city;
            renderCitiesList(); 
            renderChart(city);
        });
        
        const removeBtn = cityItem.querySelector('.remove-city-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCity(city);
        });
        
        citiesListEl.appendChild(cityItem);
    });
}

function removeCity(city) {
    delete monitoredCities[city];
    saveLocalData();
    showNotification(`${city} removed.`, 'success');
    
    if (activeCity === city) {
        activeCity = null;
        const keys = Object.keys(monitoredCities);
        if (keys.length > 0) {
            activeCity = keys[0];
            renderChart(activeCity);
        } else if (aqiChartInstance) {
            aqiChartInstance.destroy();
            aqiChartInstance = null;
        }
    }
    
    renderCitiesList();
}

function renderChart(city) {
    if (!city || !monitoredCities[city] || monitoredCities[city].length === 0) {
        emptyStateEl.style.display = 'flex';
        aqiChartCanvas.style.display = 'none';
        return;
    }
    
    emptyStateEl.style.display = 'none';
    aqiChartCanvas.style.display = 'block';
    
    chartTitleEl.textContent = `${city} AQI Trends`;
    
    const history = monitoredCities[city];
    const labels = history.map(entry => {
        const d = new Date(entry.timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    
    const aqiData = history.map(entry => entry.aqi);
    const lineColors = history.map(entry => entry.color);
    const mainColor = history[history.length - 1].color;
    
    if (aqiChartInstance) aqiChartInstance.destroy();
    
    const ctx = aqiChartCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, `${mainColor}80`); 
    gradient.addColorStop(1, `${mainColor}00`); 
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    
    aqiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'AQI',
                data: aqiData,
                borderColor: mainColor,
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: lineColors,
                pointBorderColor: '#1e293b',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 16, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: { label: context => `AQI: ${context.parsed.y}` }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, ticks: { maxTicksLimit: 10 } },
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, suggestedMax: 300 }
            },
            animation: { duration: 1000, easing: 'easeOutQuart' }
        }
    });

    const latest = history[history.length - 1];
    chartSubtitleEl.innerHTML = `Latest AQI: <strong>${latest.aqi} (${latest.status})</strong> • Fetched on ${labels[labels.length - 1]}`;
}

// ====== AUTO REFRESH ======
function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    
    autoRefreshTimer = setInterval(() => {
        const cities = Object.keys(monitoredCities);
        if (cities.length === 0) return;
        Promise.all(cities.map(city => fetchAndUpdateCity(city))).catch(e => console.error(e));
    }, 30000); 
}
