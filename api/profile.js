const axios = require('axios');
const cheerio = require('cheerio');

const cache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    
    const username = (req.query.username || '').replace('@', '').trim();

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Укажи username, например: /api/profile?username=waylessound'
        });
    }

    try {
        const now = Date.now();

    
        if (cache[username] && (now - cache[username].timestamp) < CACHE_DURATION) {
            return res.json({ ...cache[username].data, fromCache: true });
        }

        const url = `https://t.me/${username}`;

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        const $ = cheerio.load(response.data);

        const name = $('.tgme_page_title span').first().text().trim()
            || $('.tgme_page_title').text().trim()
            || 'Имя не найдено';

        const bio = $('.tgme_page_description').text().trim()
            || '';

        const avatar = $('img.tgme_page_photo_image').attr('src')
            || 'https://telegram.org/img/t_logo.png';

        const counters = [];
        $('.tgme_page_extra').each((i, el) => {
            const text = $(el).text().trim();
            if (text) counters.push(text);
        });

        let accountType = 'user';
        const extraText = $('.tgme_page_extra').text().toLowerCase();
        if (extraText.includes('subscriber') || extraText.includes('подписчик')) accountType = 'channel';
        else if (extraText.includes('member') || extraText.includes('участник')) accountType = 'group';
        else if (extraText.includes('bot') || extraText.includes('бот')) accountType = 'bot';

        const links = [];
        $('.tgme_page_description a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text) links.push({ href, text });
        });

        const verified = $('.verified-icon').length > 0
            || $('[class*="verified"]').length > 0;

        const profileData = {
            success: true,
            username,
            name,
            bio,
            avatar,
            counters,
            accountType,
            links,
            verified,
            profileUrl: `https://t.me/${username}`,
            updatedAt: new Date().toISOString()
        };

        cache[username] = { data: profileData, timestamp: now };

        return res.json(profileData);

    } catch (error) {
        console.error('Ошибка:', error.message);

        if (cache[username]) {
            return res.json({ ...cache[username].data, fromCache: true, error: error.message });
        }

        return res.status(500).json({
            success: false,
            error: error.message,
            username
        });
    }
};
