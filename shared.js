// --- API CONFIGURATION ---
const API_KEY = '34270ec8c4acaec8ef092c23c68b135d'; 
const GEO_API_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const REVERSE_GEO_API_URL = 'https://api.openweathermap.org/geo/1.0/reverse';
const AIR_API_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';

// --- SHARED DATA FETCHING ---
async function fetchCoordinates(city) {
    const response = await fetch(`${GEO_API_URL}?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    if (data.length === 0) throw new Error('City not found');
    return { lat: data[0].lat, lon: data[0].lon, name: data[0].name };
}

async function fetchCityNameByCoords(lat, lon) {
    const response = await fetch(`${REVERSE_GEO_API_URL}?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    if (data.length === 0) throw new Error('City not found');
    return data[0].name;
}

async function fetchAirQuality(lat, lon) {
    const response = await fetch(`${AIR_API_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.list[0];
}

function generateSimulatedData() {
    const aqi = Math.floor(Math.random() * 5) + 1; // 1 to 5
    return {
        main: { aqi },
        components: {
            pm2_5: (Math.random() * 50).toFixed(2),
            pm10: (Math.random() * 100).toFixed(2),
            co: (Math.random() * 500).toFixed(2),
            no2: (Math.random() * 50).toFixed(2)
        },
        dt: Math.floor(Date.now() / 1000)
    };
}

// --- SHARED UI & STATE CONFIGURATION ---
const aqiScale = {
    1: { label: 'Good', color: '#10b981', advice: 'Air quality is satisfactory. No health risks.', maxAqi: 50 },
    2: { label: 'Moderate', color: '#facc15', advice: 'Acceptable air quality. Sensitive individuals should take care.', maxAqi: 100 },
    3: { label: 'Unhealthy for Sensitive', color: '#f97316', advice: 'Sensitive groups may experience health effects.', maxAqi: 150 },
    4: { label: 'Unhealthy', color: '#ef4444', advice: 'Everyone may begin to experience health effects.', maxAqi: 200 },
    5: { label: 'Very Unhealthy', color: '#8b5cf6', advice: 'Health warnings of emergency conditions for everyone.', maxAqi: 300 },
    6: { label: 'Hazardous', color: '#7f1d1d', advice: 'Health alert: everyone may experience more serious health effects.', maxAqi: 500 }
};

// Calculate US AQI standard piece-wise linear function based on PM2.5 readings
function calculateAQI(pm25) {
    let cLow, cHigh, iLow, iHigh;

    if (pm25 <= 12.0) {
        cLow = 0.0; cHigh = 12.0; iLow = 0; iHigh = 50;
    } else if (pm25 <= 35.4) {
        cLow = 12.1; cHigh = 35.4; iLow = 51; iHigh = 100;
    } else if (pm25 <= 55.4) {
        cLow = 35.5; cHigh = 55.4; iLow = 101; iHigh = 150;
    } else if (pm25 <= 150.4) {
        cLow = 55.5; cHigh = 150.4; iLow = 151; iHigh = 200;
    } else if (pm25 <= 250.4) {
        cLow = 150.5; cHigh = 250.4; iLow = 201; iHigh = 300;
    } else if (pm25 <= 350.4) {
        cLow = 250.5; cHigh = 350.4; iLow = 301; iHigh = 400;
    } else {
        cLow = 350.5; cHigh = 500.4; iLow = 401; iHigh = 500;
    }

    const aqi = ((iHigh - iLow) / (cHigh - cLow)) * (pm25 - cLow) + iLow;
    return Math.round(aqi);
}

// Map the calculated AQI back to the UI configurations dynamically
function getAqiConfig(aqiValue) {
    if (aqiValue <= 50) return aqiScale[1];
    if (aqiValue <= 100) return aqiScale[2];
    if (aqiValue <= 150) return aqiScale[3];
    if (aqiValue <= 200) return aqiScale[4];
    if (aqiValue <= 300) return aqiScale[5];
    return aqiScale[6];
}

// --- SHARED UI FUNCTIONS ---
function showNotification(message, type = 'success') {
    const notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) return;
    
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.innerHTML = `
        <i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'circle-exclamation'}"></i> 
        ${message}
    `;
    
    notificationContainer.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('hiding');
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}
