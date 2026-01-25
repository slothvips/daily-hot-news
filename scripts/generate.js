const fs = require('node:fs');
const path = require('node:path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
// Use gemini-2.0-flash-exp or pro if available, otherwise fallback to 1.5-flash for speed/cost in batching
// User requested 2.5pro, but for batching and "fun", 2.0-flash is often faster and sufficient.
// However, let's stick to the requested high-quality model or a reliable one.
// "gemini-2.0-flash" is great for high throughput. Let's try to use the one user set or default to a good one.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash", // Switching to Flash for Batching Speed & Quota Safety
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

// Process a single category in batches
async function processCategory(items, categoryName) {
    if (!items || items.length === 0) return [];
    
    console.log(`Processing ${categoryName} (${items.length} items)...`);
    const chunks = chunkArray(items, 10); // Batch size 10 to fit in context and quota
    let processedItems = [];

    for (const chunk of chunks) {
        try {
            // Simplify input for token saving
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

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            let chunkResult = JSON.parse(responseText);
            
            // Handle potential non-array return (Gemini quirk)
            if (!Array.isArray(chunkResult)) {
                if (chunkResult.data) chunkResult = chunkResult.data;
                else if (chunkResult.items) chunkResult = chunkResult.items;
                else chunkResult = Object.values(chunkResult)[0];
            }

            if (Array.isArray(chunkResult)) {
                // Merge back with original links
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
            
            // Small delay to be nice to rate limits
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            console.error(`Error processing chunk for ${categoryName}:`, e.message);
            processedItems = processedItems.concat(chunk); // Fallback to original
        }
    }
    return processedItems;
}

async function main() {
    try {
        const rawData = fs.readFileSync('news_data.json', 'utf8');
        const data = JSON.parse(rawData);
        
        // Define categories to process
        // We process ALL categories to ensure consistent "AI Comment" style
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
        
        // Add Desc
        if (showDesc && item.desc) {
            line += ` - ${item.desc}`;
        }
        
        // Add AI Comment (The "Fun" Part)
        if (item.comment) {
            // Check if line is too long, maybe break line?
            // For now, append with a separator
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
