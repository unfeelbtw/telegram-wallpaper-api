const axios = require('axios');
const cheerio = require('cheerio');

const cache = {};
const CACHE_DURATION = 5 * 60 * 1000;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { username, lat, lon } = req.query;
    
    // Генерируем ключ кеша на основе того, что пришло (имя или координаты)
    const cacheKey = username || `${lat}_${lon}`;

    if (!username && (!lat || !lon)) {
        return res.status(400).json({ success: false, error: 'Нужен username или lat+lon' });
    }

    // Проверка кеша
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp) < CACHE_DURATION) {
        return res.json({ ...cache[cacheKey].data, fromCache: true });
    }

    try {
        const profileData = {};

        // 1. Парсинг профиля (если есть username)
        if (username) {
            const cleanUser = username.replace('@', '').trim();
            const response = await axios.get(`https://t.me/${cleanUser}`, { timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            profileData.username = cleanUser;
            profileData.name = $('.tgme_page_title span').first().text().trim();
            profileData.bio = $('.tgme_page_description').text().trim();
            profileData.avatar = $('img.tgme_page_photo_image').attr('src');
            profileData.verified = $('.verified-icon').length > 0;
        }

        // 2. Погода + восход/закат (один запрос, если есть lat и lon)
        if (lat && lon) {
            const weatherRes = await axios.get(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,weather_code` +
                `&daily=sunrise,sunset` +
                `&timezone=auto&forecast_days=1`
            );
            const current = weatherRes.data.current;
            const daily   = weatherRes.data.daily;

            profileData.weather = {
                temp: current.temperature_2m,
                code: current.weather_code
            };

            if (daily && daily.sunrise && daily.sunset) {
                profileData.sun = {
                    rise: daily.sunrise[0], // "2025-06-11T05:12"
                    set:  daily.sunset[0]   // "2025-06-11T21:47"
                };
            }
        }

        const finalResponse = { success: true, ...profileData, updatedAt: new Date().toISOString() };
        cache[cacheKey] = { data: finalResponse, timestamp: Date.now() };

        return res.json(finalResponse);

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
