const fs = require('node:fs');
const path = require('node:path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Flash is faster and cheaper, good for batching.
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash", 
    generationConfig: { responseMimeType: "application/json" }
});

// Helper: Chunk array
function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

// Helper: Delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry wrapper with Exponential Backoff
async function generateWithRetry(prompt, retries = 5) {
    let attempt = 0;
    let baseDelay = 10000; // Start with 10 seconds delay for 429

    while (attempt < retries) {
        try {
            return await model.generateContent(prompt);
        } catch (error) {
            // Check for Rate Limit (429) or Overloaded (503)
            if (error.message.includes('429') || error.message.includes('503')) {
                attempt++;
                if (attempt >= retries) throw error;
                
                const waitTime = baseDelay * Math.pow(2, attempt - 1); // 10s, 20s, 40s...
                console.warn(`⚠️ Rate limited (429/503). Retrying in ${waitTime/1000}s (Attempt ${attempt}/${retries})...`);
                await delay(waitTime);
            } else {
                throw error; // Non-retriable error
            }
        }
    }
}

// Process a single category in batches
async function processCategory(items, categoryName) {
    if (!items || items.length === 0) return [];
    
    console.log(`Processing ${categoryName} (${items.length} items)...`);
    const chunks = chunkArray(items, 10); // Batch size 10
    let processedItems = [];

    for (const chunk of chunks) {
        try {
            const inputData = chunk.map(item => ({
                title: item.title,
                desc: item.desc || ""
            }));

            const prompt = `You are a witty and professional tech news commentator.
            Task:
            1. Translate "title" to Chinese (Simplified).
            2. Translate "desc" to Chinese (Simplified) if it exists.
            3. Generate a "comment": A very short, fun, witty, sarcastic, or insightful remark about this news (max 15 words) in Chinese. Add an appropriate emoji at the start.
            
            Context: This is for the "${categoryName}" section of a daily tech report.
            
            Return JSON Array of objects with keys: "title", "desc", "comment".
            
            Input:
            ${JSON.stringify(inputData)}`;

            // Use the retry wrapper
            const result = await generateWithRetry(prompt);
            const responseText = result.response.text();
            let chunkResult = JSON.parse(responseText);
            
            if (!Array.isArray(chunkResult)) {
                if (chunkResult.data) chunkResult = chunkResult.data;
                else if (chunkResult.items) chunkResult = chunkResult.items;
                else chunkResult = Object.values(chunkResult)[0];
            }

            if (Array.isArray(chunkResult)) {
                const mergedChunk = chunk.map((original, index) => {
                    if (chunkResult[index]) {
                        return {
                            ...original,
                            title: chunkResult[index].title || original.title,
                            desc: chunkResult[index].desc || original.desc,
                            comment: chunkResult[index].comment || ""
                        };
                    }
                    return original;
                });
                processedItems = processedItems.concat(mergedChunk);
            } else {
                console.warn(`Batch failed for ${categoryName}, keeping original.`);
                processedItems = processedItems.concat(chunk);
            }
            
            // Standard delay between successful chunks to be nice
            await delay(5000); // 5s delay between chunks

        } catch (e) {
            console.error(`Error processing chunk for ${categoryName}:`, e.message);
            processedItems = processedItems.concat(chunk);
        }
    }
    return processedItems;
}

async function main() {
    try {
        const rawData = fs.readFileSync('news_data.json', 'utf8');
        const data = JSON.parse(rawData);
        
        const categories = [
            'hackernews', 'github', 'huggingface', 'v2ex', 'producthunt', 
            'ithome', 'solidot', 'juejin', 'thehackernews', 'freebuf', 
            'unnews', 'crypto'
        ];

        for (const cat of categories) {
            if (data[cat]) {
                data[cat] = await processCategory(data[cat], cat);
            }
        }

        const md = generateMarkdown(data);
        const date = new Date().toISOString().split('T')[0];
        const archiveDir = path.join(__dirname, '../archives');
        const archiveFile = path.join(archiveDir, `daily_hot_${date}.md`);
        const readmeFile = path.join(__dirname, '../README.md');

        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        fs.writeFileSync(archiveFile, md);
        console.log(`Generated: ${archiveFile}`);

        updateReadme(readmeFile, date);

    } catch (error) {
        console.error('Error during generation:', error);
        process.exit(1);
    }
}

function generateMarkdown(data) {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    
    return `# 每日热门资讯 (Daily Hot News)

日期: ${date}

> 由 AI 自动抓取并翻译整理

## 🚀 科技 & 极客 (Hacker News)
${formatList(data.hackernews)}

## 💻 编程 (GitHub Trending)
${formatList(data.github, true)}

## 🧠 AI 前沿 (Hugging Face Papers)
${formatList(data.huggingface)}

## 🛠️ 开发者社区 (V2EX)
${formatList(data.v2ex)}

## 💡 新产品 (Product Hunt)
${formatList(data.producthunt, true)}

## 📱 数码 (IT之家)
${formatList(data.ithome)}

## 🤓 硬核/科学 (Solidot)
${formatList(data.solidot)}

## 📚 掘金热门 (Juejin)
${formatList(data.juejin)}

## 🛡️ 网络安全 (The Hacker News & FreeBuf)
### The Hacker News
${formatList(data.thehackernews)}

### FreeBuf
${formatList(data.freebuf)}

## 🌍 国际政治 (UN News)
${formatList(data.unnews)}

## 🪙 加密货币 (CoinTelegraph)
${formatList(data.crypto)}

---
*生成时间: ${timestamp}*
`;
}

function formatList(items, showDesc = false) {
    if (!items || items.length === 0) return '(暂无数据)';
    return items.map((item, index) => {
        let line = `${index + 1}. [${item.title}](${item.link})`;
        if (showDesc && item.desc) {
            line += ` - ${item.desc}`;
        }
        if (item.comment) {
            line += `  \n   > ${item.comment}`; 
        }
        return line;
    }).join('\n');
}

function updateReadme(readmeFile, date) {
    try {
        let readmeContent = fs.readFileSync(readmeFile, 'utf8');
        const linkEntry = `- [${date}](./archives/daily_hot_${date}.md)`;
        
        if (readmeContent.includes('## 📅 Archives')) {
            if (!readmeContent.includes(linkEntry)) {
                readmeContent = readmeContent.replace(
                    '## 📅 Archives (历史归档)\n\n', 
                    `## 📅 Archives (历史归档)\n\n${linkEntry}\n`
                );
                fs.writeFileSync(readmeFile, readmeContent);
                console.log('Updated README.md');
            }
        }
    } catch (e) {
        console.error('Failed to update README:', e);
    }
}

main();
