// =========================================================================
// AQI ALERT SYSTEM LOGIC
// =========================================================================

// Initialize EmailJS with your public key
(function() {
    // ⚠️ Replace "YOUR_PUBLIC_KEY" with your actual EmailJS public key
    emailjs.init("g5Getnv0QYl4Bq_zN"); 
})();

// --- CONFIGURATION & STATE ---
// Fallback API key if shared.js is missing
const ALERT_API_KEY = typeof API_KEY !== 'undefined' ? API_KEY : '34270ec8c4acaec8ef092c23c68b135d';

// Tracking last sent email timestamps per city to prevent spam
const emailSentHistory = {}; 

// Timer reference for auto-refresh
let refreshInterval = null;

// --- DOM ELEMENTS ---
const btnCurrentLocation = document.getElementById('btnCurrentLocation');
const btnSearch = document.getElementById('btnSearch');
const cityInput = document.getElementById('cityInput');

const idleState = document.getElementById('idleState');
const resultCard = document.getElementById('resultCard');
const resultCity = document.getElementById('resultCity');
const resultAqi = document.getElementById('resultAqi');
const resultStatus = document.getElementById('resultStatus');
const uiWarning = document.getElementById('uiWarning');
const lastUpdated = document.getElementById('lastUpdated');

// --- EVENT LISTENERS ---

// A. CURRENT LOCATION BUTTON
btnCurrentLocation.addEventListener('click', () => {
    btnCurrentLocation.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Detecting...`;
    btnCurrentLocation.disabled = true;
    getCurrentLocation();
});

// B. SEARCH CITY BUTTON
btnSearch.addEventListener('click', async () => {
    const city = cityInput.value.trim();
    if (!city) {
        alert("Please enter a valid city name.");
        return;
    }
    
    btnSearch.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    btnSearch.disabled = true;
    
    try {
        // Clear previous intervals so we don't mix city auto-refreshes
        if (refreshInterval) clearInterval(refreshInterval);
        
        const coords = await getCoordinates(city);
        const aqi = await fetchAQI(coords.lat, coords.lon);
        
        displayResult(coords.name, aqi);
        checkAlert(coords.name, aqi);
    } catch (err) {
        alert(err.message || "Failed to fetch AQI for the specified city.");
    } finally {
        btnSearch.innerHTML = `Check AQI`;
        btnSearch.disabled = false;
    }
});


// =========================================================================
// REQUIRED FUNCTIONS IMPLEMENTATION
// =========================================================================

/**
 * getCurrentLocation()
 * Automatically detects user location, converts to city, fetches AQI, 
 * checks bounds, and sets up a 60-second auto-refresh.
 */
async function getCurrentLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                try {
                    const city = await getCityFromCoords(lat, lon);
                    const aqi = await fetchAQI(lat, lon);
                    
                    displayResult(city, aqi);
                    checkAlert(city, aqi);
                    
                    // Auto-refresh for current location every 60 seconds
                    if (refreshInterval) clearInterval(refreshInterval);
                    refreshInterval = setInterval(async () => {
                        console.log(`Auto-refreshing AQI for ${city}...`);
                        const newAqi = await fetchAQI(lat, lon);
                        displayResult(city, newAqi);
                        checkAlert(city, newAqi);
                    }, 60000);
                    
                } catch (error) {
                    alert("Error retrieving air quality data.");
                    console.error(error);
                } finally {
                    resetLocationBtn();
                }
            },
            (error) => {
                alert("Geolocation failed: " + error.message);
                resetLocationBtn();
            }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
        resetLocationBtn();
    }
}

function resetLocationBtn() {
    btnCurrentLocation.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Use Current Location`;
    btnCurrentLocation.disabled = false;
}

/**
 * getCityFromCoords(lat, lon)
 * Converts coordinates to city name using Reverse Geocoding API
 */
async function getCityFromCoords(lat, lon) {
    const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${ALERT_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    return data.length > 0 ? data[0].name : "Unknown Location";
}

/**
 * getCoordinates(city)
 * Converts city name to coordinates using Geocoding API
 */
async function getCoordinates(city) {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${ALERT_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("City lookup failed");
    const data = await response.json();
    if (data.length === 0) throw new Error("City not found");
    return { lat: data[0].lat, lon: data[0].lon, name: data[0].name };
}

/**
 * fetchAQI(lat, lon)
 * Fetches AQI using Air Pollution API. Calculates US AQI based on PM2.5.
 */
async function fetchAQI(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${ALERT_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch AQI data");
    const data = await response.json();
    
    // Extract PM2.5 to calculate rigorous US AQI instead of generic OpenWeather index
    const pm25 = data.list[0].components.pm2_5;
    
    // Fallback calculation locally if shared.js calculateAQI is not found
    if (typeof calculateAQI === 'function') {
        return calculateAQI(pm25);
    } else {
        return calculateFallbackAQI(pm25);
    }
}

/**
 * Fallback US AQI Calculator
 */
function calculateFallbackAQI(pm25) {
    let cLow, cHigh, iLow, iHigh;

    if (pm25 <= 12.0) { cLow = 0.0; cHigh = 12.0; iLow = 0; iHigh = 50; }
    else if (pm25 <= 35.4) { cLow = 12.1; cHigh = 35.4; iLow = 51; iHigh = 100; }
    else if (pm25 <= 55.4) { cLow = 35.5; cHigh = 55.4; iLow = 101; iHigh = 150; }
    else if (pm25 <= 150.4) { cLow = 55.5; cHigh = 150.4; iLow = 151; iHigh = 200; }
    else if (pm25 <= 250.4) { cLow = 150.5; cHigh = 250.4; iLow = 201; iHigh = 300; }
    else if (pm25 <= 350.4) { cLow = 250.5; cHigh = 350.4; iLow = 301; iHigh = 400; }
    else { cLow = 350.5; cHigh = 500.4; iLow = 401; iHigh = 500; }

    const aqi = ((iHigh - iLow) / (cHigh - cLow)) * (pm25 - cLow) + iLow;
    return Math.round(aqi);
}

/**
 * classifyAQI(aqi)
 * Returns the classification logic requested:
 * 0–50 → Good | 51–100 → Moderate | 101–150 → Unhealthy | 151+ → Poor
 */
function classifyAQI(aqi) {
    if (aqi <= 50) return { status: "Good", cardClass: "card-green" };
    if (aqi <= 100) return { status: "Moderate", cardClass: "card-yellow" };
    if (aqi <= 150) return { status: "Unhealthy", cardClass: "card-orange" };
    return { status: "Poor", cardClass: "card-red" };
}

/**
 * displayResult()
 * Show logic for updating DOM with city name, AQI value, and AQI status.
 */
function displayResult(city, aqi) {
    const classification = classifyAQI(aqi);
    
    resultCity.textContent = city;
    resultAqi.textContent = aqi;
    resultStatus.textContent = classification.status;
    
    // Update timestamp
    const now = new Date();
    lastUpdated.textContent = `Updated: ${now.toLocaleTimeString()}`;
    
    // Apply relevant color theme recursively
    resultCard.className = `result-card visible ${classification.cardClass}`;
    
    // Hide idle default state
    idleState.classList.add('hidden');
}

/**
 * checkAlert(city, aqi)
 * Checks condition (AQI > 100) and triggers warning UI, browser popup, and email.
 */
function checkAlert(city, aqi) {
    if (aqi > 100) {
        // 1. Show warning message on UI
        uiWarning.classList.add('visible');
        
        // 2. Show browser popup alert
        // A slight timeout allows the DOM to render the visually updated card first
        setTimeout(() => alert(`⚠️ ALERT: Unsafe AQI (${aqi}) detected in ${city}. Please take precautions.`), 200);
        
        // 3. Send email notification
        if (canSend(city)) {
            sendEmail(city, aqi);
            emailSentHistory[city] = Date.now(); // Record current timestamp to prevent spam
        }
    } else {
        // Hide warning boundary if AQI levels drop back down to safe levels auto-refreshing
        uiWarning.classList.remove('visible');
    }
}

/**
 * canSend(city)
 * Check if we are allowed to send email for this city (only once per hour)
 */
function canSend(city) {
    const lastSentTime = emailSentHistory[city];
    
    // Never sent before for this city
    if (!lastSentTime) return true; 
    
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in distinct milliseconds
    const timeElapsed = Date.now() - lastSentTime;
    
    return timeElapsed >= ONE_HOUR;
}

/**
 * sendEmail(city, aqi)
 * Triggers EmailJS library utilizing provided schema to send notification limitlessly.
 */
function sendEmail(city, aqi) {
    // ⚠️ Replace YOUR_SERVICE_ID and YOUR_TEMPLATE_ID with actual values
    const serviceID = "service_60z3j15";   
    const templateID = "template_abcd123"; 
    
    const templateParams = {
        city: city,
        aqi: aqi,
        message: `Air Quality Alert!\nLocation: ${city}\nAQI Level: ${aqi}\nPlease take precautions.`
    };

    emailjs.send(serviceID, templateID, templateParams)
        .then(response => {
            console.log("✅ Email alert sent successfully!", response.status, response.text);
        })
        .catch(error => {
            console.error("❌ Failed to send email alert:", error);
        });
}
