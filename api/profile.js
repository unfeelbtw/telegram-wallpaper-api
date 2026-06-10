const axios = require('axios');
const cheerio = require('cheerio');

// Кеш в памяти (работает, пока функция «теплая»)
const cache = {};
const CACHE_DURATION = 5 * 60 * 1000; 

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { username, lat, lon } = req.query;

    if (!username && (!lat || !lon)) {
        return res.status(400).json({ success: false, error: 'Укажите username или координаты (lat, lon)' });
    }

    try {
        const now = Date.now();
        const cacheKey = username || `${lat}_${lon}`;

        if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
            return res.json({ ...cache[cacheKey].data, fromCache: true });
        }

        let result = {};

        // 1. Парсинг Telegram (если передан username)
        if (username) {
            const url = `https://t.me/${username.replace('@', '').trim()}`;
            const response = await axios.get(url, { timeout: 8000 });
            const $ = cheerio.load(response.data);
            
            result.profile = {
                name: $('.tgme_page_title span').first().text().trim(),
                bio: $('.tgme_page_description').text().trim(),
                avatar: $('img.tgme_page_photo_image').attr('src')
            };
        }

        // 2. Парсинг Погоды (если переданы lat/lon)
        if (lat && lon) {
            // Open-Meteo API
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m`;
            const weatherRes = await axios.get(weatherUrl);
            
            result.weather = {
                temp: weatherRes.data.current.temperature_2m,
                code: weatherRes.data.current.weather_code,
                hourly: weatherRes.data.hourly.temperature_2m.slice(0, 24) // Данные на 24 часа
            };
        }

        const finalData = { success: true, ...result, updatedAt: new Date().toISOString() };
        cache[cacheKey] = { data: finalData, timestamp: now };

        return res.json(finalData);

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
