const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('node:fs');
const Parser = require('rss-parser');

const parser = new Parser();
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA };

async function fetchHN() {
    try {
        const { data: ids } = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
        const top20 = ids.slice(0, 20);
        return await Promise.all(top20.map(async id => {
            const { data } = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            return { title: data.title, link: data.url || `https://news.ycombinator.com/item?id=${id}` };
        }));
    } catch (e) { return []; }
}

async function fetchV2EX() {
    try {
        const { data } = await axios.get('https://www.v2ex.com/api/topics/hot.json', { headers });
        return data.slice(0, 20).map(t => ({ 
            title: t.title, 
            link: `https://www.v2ex.com/t/${t.id}` 
        }));
    } catch (e) { return []; }
}

async function fetchHuggingFace() {
    try {
        const { data } = await axios.get('https://huggingface.co/papers', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('article h3 a').each((i, el) => {
            if (items.length >= 20) return;
            let link = $(el).attr('href');
            if (link && !link.startsWith('http')) link = `https://huggingface.co${link}`;
            items.push({ title: $(el).text().trim(), link });
        });
        return items;
    } catch (e) { return []; }
}

async function fetchProductHunt() {
    try {
        const { data } = await axios.get('https://www.producthunt.com/', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('[data-test^="post-item"]').each((i, el) => {
            if (items.length >= 20) return;
            const title = $(el).find('a div.text-16').text().trim() || $(el).find('a').first().text().trim();
            const desc = $(el).find('span.text-16.text-secondary').text().trim();
            let link = $(el).find('a').first().attr('href');
            if (link && !link.startsWith('http')) link = `https://www.producthunt.com${link}`;
            if (title && link) items.push({ title, link, desc });
        });
        return items;
    } catch (e) { return []; }
}

async function fetchGitHub() {
    try {
        const { data } = await axios.get('https://github.com/trending', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('article.Box-row').each((i, el) => {
            if (items.length >= 20) return;
            const title = $(el).find('h2 a').text().replace(/\s+/g, ' ').trim();
            const link = `https://github.com${$(el).find('h2 a').attr('href')}`;
            const desc = $(el).find('p').text().trim();
            items.push({ title, link, desc });
        });
        return items;
    } catch (e) { return []; }
}

async function fetch36Kr() {
    // 36Kr is hard to scrape statically, return empty or try API if known.
    // For now, let's skip or try simple static. 
    // Actually, simple static often fails for 36Kr as seen. 
    // Users using this skill might accept empty or I can try a known API endpoint if available.
    // Let's try the mobile API endpoint often used: https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot
    // But that requires signing/encryption often.
    // For this skill, I will omit 36Kr static scrape to keep it simple/reliable, 
    // OR just use the placeholder to remind AI to check it via browser if really needed.
    // BUT, the goal is automation. 
    return []; 
}

async function fetchITHome() {
    try {
        const { data } = await axios.get('https://www.ithome.com/', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('#rank ul li a').each((i, el) => {
            if (items.length >= 20) return;
            const title = $(el).text().trim();
            let link = $(el).attr('href');
            if (link && !link.startsWith('http')) {
                link = `https://www.ithome.com${link}`;
            }
            if (title && link) items.push({ title, link });
        });
        return items;
    } catch (e) { return []; }
}

async function fetchSolidot() {
    try {
        const { data } = await axios.get('https://www.solidot.org/', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('.block_m').each((i, el) => {
            if (items.length >= 20) return;
            const $block = $(el);
            const title = $block.find('.bg_htit h2 a').text().trim();
            let link = $block.find('a[href^="/story"]').first().attr('href');
            if (link && !link.startsWith('http')) {
                link = `https://www.solidot.org${link}`;
            }
            if (title && link) items.push({ title, link });
        });
        return items;
    } catch (e) { return []; }
}

async function fetchJuejin() {
    try {
        const { data } = await axios.post('https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', 
            { client_type: 2608, cursor: "0", id_type: 2, limit: 20, sort_type: 200 },
            { headers: { ...headers, 'Content-Type': 'application/json' } }
        );
        
        if (data.data && Array.isArray(data.data)) {
            return data.data.slice(0, 20).map(item => ({
                title: item.item_info.article_info.title,
                link: `https://juejin.cn/post/${item.item_info.article_id}`
            }));
        }
        return [];
    } catch (e) { return []; }
}

async function fetchTheHackerNews() {
    try {
        const { data } = await axios.get('https://thehackernews.com/', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('.body-post').each((i, el) => {
            if (items.length >= 20) return;
            const title = $(el).find('.home-title').text().trim();
            const link = $(el).find('a.story-link').attr('href');
            if (title && link) items.push({ title, link });
        });
        return items;
    } catch (e) { return []; }
}

async function fetchFreeBuf() {
    try {
        const { data } = await axios.get('https://www.freebuf.com/articles', { headers });
        const $ = cheerio.load(data);
        const items = [];
        $('.news-info').each((i, el) => {
            if (items.length >= 20) return;
            const $item = $(el);
            const title = $item.find('a.title').text().trim();
            let link = $item.find('a.title').attr('href');
            if (link && !link.startsWith('http')) {
                link = `https://www.freebuf.com${link}`;
            }
            if (title && link) items.push({ title, link });
        });
        return items;
    } catch (e) {
        console.error('FreeBuf Error:', e.message);
        return [];
    }
}

async function fetchUNNews() {
    try {
        const feed = await parser.parseURL('https://news.un.org/feed/subscribe/en/news/all/rss.xml');
        return feed.items.slice(0, 20).map(item => ({
            title: item.title,
            link: item.link
        }));
    } catch (e) {
        console.error('UN News Error:', e.message);
        return [];
    }
}

async function fetchCoinTelegraph() {
    try {
        const feed = await parser.parseURL('https://cointelegraph.com/rss');
        return feed.items.slice(0, 20).map(item => ({
            title: item.title,
            link: item.link
        }));
    } catch (e) {
        console.error('CoinTelegraph Error:', e.message);
        return [];
    }
}

async function main() {
    console.log('Fetching data...');
    const [hn, v2, hf, ph, gh, it, solidot, juejin, thn, freebuf, un, crypto] = await Promise.all([
        fetchHN(),
        fetchV2EX(),
        fetchHuggingFace(),
        fetchProductHunt(),
        fetchGitHub(),
        fetchITHome(),
        fetchSolidot(),
        fetchJuejin(),
        fetchTheHackerNews(),
        fetchFreeBuf(),
        fetchUNNews(),
        fetchCoinTelegraph()
    ]);

    const result = {
        hackernews: hn,
        v2ex: v2,
        huggingface: hf,
        producthunt: ph,
        github: gh,
        ithome: it,
        solidot: solidot,
        juejin: juejin,
        thehackernews: thn,
        freebuf: freebuf,
        unnews: un,
        crypto: crypto,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('news_data.json', JSON.stringify(result, null, 2));
    console.log('Done. Data saved to news_data.json');
    return result;
}

if (require.main === module) {
    main();
}

module.exports = { main };
