const fs = require("node:fs");
const path = require("node:path");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const modelPool = {
  models: [
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
  ],
  currentIndex: 0,
  getCurrent() {
    return this.models[this.currentIndex];
  },
  switchNext() {
    this.currentIndex = (this.currentIndex + 1) % this.models.length;
    return this.getCurrent();
  },
  reset() {
    this.currentIndex = 0;
  },
};

// Helper: Chunk array
function chunkArray(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeString(str) {
  if (str === null || str === undefined) return "";

  let sanitized = String(str);

  sanitized = sanitized
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
    })
    .join("")
    .normalize("NFC")
    .trim()
    .slice(0, 5000);

  return sanitized;
}

function sanitizeForJSON(obj) {
  if (obj === null || obj === undefined) return null;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForJSON(item));
  }

  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        typeof value === "function" ||
        typeof value === "symbol" ||
        value === undefined
      ) {
        continue;
      }

      if (typeof value === "number" && !Number.isFinite(value)) {
        sanitized[key] = null;
        continue;
      }

      if (typeof value === "string") {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === "object") {
        sanitized[key] = sanitizeForJSON(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (typeof obj === "number" && !Number.isFinite(obj)) {
    return null;
  }

  return obj;
}

function safeJSONParse(jsonString, fallback = null) {
  try {
    const trimmed = jsonString.trim();
    if (!trimmed) {
      console.warn("Empty JSON string provided");
      return fallback;
    }

    return JSON.parse(trimmed);
  } catch (error) {
    console.error("JSON parse error:", error.message);
    console.error(
      "Problematic JSON (first 200 chars):",
      jsonString.slice(0, 200),
    );
    return fallback;
  }
}

function safeJSONStringify(obj, fallback = "{}") {
  try {
    const sanitized = sanitizeForJSON(obj);
    return JSON.stringify(sanitized);
  } catch (error) {
    console.error("JSON stringify error:", error.message);
    return fallback;
  }
}

// Helper: Retry wrapper with Exponential Backoff
async function generateWithRetry(prompt, retries = 5) {
  let attempt = 0;
  const baseDelay = 10000;
  let modelSwitchCount = 0;
  const maxModelSwitches = modelPool.models.length;

  while (attempt < retries) {
    const currentModel = modelPool.getCurrent();

    try {
      console.log(`🤖 Using model: ${currentModel}`);

      return await ai.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });
    } catch (error) {
      if (error.message.includes("429") || error.message.includes("503")) {
        if (modelSwitchCount < maxModelSwitches - 1) {
          const nextModel = modelPool.switchNext();
          modelSwitchCount++;
          console.warn(
            `⚠️ Rate limited on ${currentModel}. Switching to ${nextModel}...`,
          );
          continue;
        }

        attempt++;
        if (attempt >= retries) throw error;

        const waitTime = baseDelay * 2 ** (attempt - 1);
        console.warn(
          `⚠️ All models rate limited. Retrying in ${waitTime / 1000}s (Attempt ${attempt}/${retries})...`,
        );
        await delay(waitTime);
        modelSwitchCount = 0;
        modelPool.reset();
      } else {
        throw error;
      }
    }
  }
}

async function processCategory(items, categoryName) {
  if (!items || items.length === 0) return [];

  console.log(`Processing ${categoryName} (${items.length} items)...`);
  const chunks = chunkArray(items, 10); // Batch size 10
  let processedItems = [];

  for (const chunk of chunks) {
    try {
      const inputData = chunk.map((item) => ({
        title: sanitizeString(item.title || ""),
        desc: sanitizeString(item.desc || ""),
      }));

      const prompt = `You are a witty and professional tech news commentator.
            Task:
            1. Translate "title" to Chinese (Simplified).
            2. Translate "desc" to Chinese (Simplified) if it exists.
            3. Generate a "comment": A very short, fun, witty, sarcastic, or insightful remark about this news (max 15 words) in Chinese. Add an appropriate emoji at the start.

            Context: This is for the "${categoryName}" section of a daily tech report.

            Return JSON Array of objects with keys: "title", "desc", "comment".

            Input:
            ${safeJSONStringify(inputData)}`;

      const result = await generateWithRetry(prompt);
      const responseText = result.text;
      let chunkResult = safeJSONParse(responseText, []);

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
              comment: chunkResult[index].comment || "",
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
    const rawData = fs.readFileSync("news_data.json", "utf8");
    const data = safeJSONParse(rawData, {});

    const categories = [
      "hackernews",
      "github",
      "huggingface",
      "v2ex",
      "producthunt",
      "ithome",
      "solidot",
      "juejin",
      "thehackernews",
      "freebuf",
      "unnews",
      "crypto",
    ];

    for (const cat of categories) {
      if (data[cat]) {
        data[cat] = await processCategory(data[cat], cat);
      }
    }

    const md = generateMarkdown(data);
    const date = new Date().toISOString().split("T")[0];
    const readmeFile = path.join(__dirname, "../README.md");
    const docsArchiveDir = path.join(__dirname, "../docs/archives");
    const docsArchiveFile = path.join(docsArchiveDir, `daily_hot_${date}.md`);

    if (!fs.existsSync(docsArchiveDir)) {
      fs.mkdirSync(docsArchiveDir, { recursive: true });
    }

    fs.writeFileSync(docsArchiveFile, md);
    console.log(`Generated: ${docsArchiveFile}`);

    updateReadme(readmeFile, date);
  } catch (error) {
    console.error("Error during generation:", error);
    process.exit(1);
  }
}

function generateMarkdown(data) {
  const date = new Date().toISOString().split("T")[0];
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
  if (!items || items.length === 0) return "(暂无数据)";
  return items
    .map((item, index) => {
      let line = `${index + 1}. [${item.title}](${item.link})`;
      if (showDesc && item.desc) {
        line += ` - ${item.desc}`;
      }
      if (item.comment) {
        line += `  \n   > ${item.comment}`;
      }
      return line;
    })
    .join("\n");
}

function updateReadme(readmeFile, date) {
  try {
    let readmeContent = fs.readFileSync(readmeFile, "utf8");
    const linkEntry = `- [${date}](./docs/archives/daily_hot_${date}.md)`;

    if (readmeContent.includes("## 📜 Latest Archive")) {
      readmeContent = readmeContent.replace(
        /Latest news file: `.*`/,
        `Latest news file: \`docs/archives/daily_hot_${date}.md\``,
      );
      fs.writeFileSync(readmeFile, readmeContent);
      console.log("Updated README.md");
    }
  } catch (e) {
    console.error("Failed to update README:", e);
  }
}

main();
