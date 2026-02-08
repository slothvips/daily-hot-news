const fs = require("node:fs");
const path = require("node:path");
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");

// Configuration: API Provider
// Options: 'gemini' (default) | 'openai' | 'deepseek' | 'siliconflow' | 'cloudflare' | 'pollinations'
const API_PROVIDER = process.env.API_PROVIDER || 'gemini';
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL; // Optional for OpenAI-compatible
const API_MODEL = process.env.API_MODEL; // Optional override

// Cloudflare Specific Config
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || API_KEY;

// Initialize Clients
let aiClient;
const currentProvider = API_PROVIDER;

if (API_PROVIDER === 'gemini') {
  if (API_KEY) aiClient = new GoogleGenAI({ apiKey: API_KEY });
} else if (['openai', 'deepseek', 'siliconflow', 'groq'].includes(API_PROVIDER)) {
  // Generic OpenAI-compatible client
  let baseURL = API_BASE_URL;
  if (!baseURL) {
    if (API_PROVIDER === 'deepseek') baseURL = 'https://api.deepseek.com';
    if (API_PROVIDER === 'siliconflow') baseURL = 'https://api.siliconflow.cn/v1';
    if (API_PROVIDER === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  }
  
  if (API_KEY) {
    aiClient = new OpenAI({
      apiKey: API_KEY,
      baseURL: baseURL,
    });
  }
}

const modelPool = {
  // Gemini Models
  gemini: [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ],
  // DeepSeek Models
  deepseek: [
    "deepseek-chat",
  ],
  // SiliconFlow / OpenAI Compatible Models
  openai: [
    "gpt-4o-mini",
    "gpt-3.5-turbo",
  ],
  siliconflow: [
    "deepseek-ai/DeepSeek-V3",
    "deepseek-ai/DeepSeek-R1",
  ],
  groq: [
    "llama3-70b-8192",
    "mixtral-8x7b-32768",
    "gemma-7b-it",
  ],
  cloudflare: [
    "@cf/meta/llama-3-8b-instruct",
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/google/gemma-7b-it-lora",
  ],
  pollinations: [
    "openai", // Pollinations maps this to a free model usually
    "mistral",
    "llama",
  ],
  
  currentIndex: 0,
  
  getModels() {
    if (API_MODEL) return [API_MODEL];
    return this[currentProvider] || this.gemini;
  },

  getCurrent() {
    const models = this.getModels();
    return models[this.currentIndex % models.length];
  },

  switchNext() {
    const models = this.getModels();
    this.currentIndex = (this.currentIndex + 1) % models.length;
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
    if (!jsonString || typeof jsonString !== 'string') {
      console.warn("Invalid JSON string provided:", typeof jsonString);
      return fallback;
    }
    
    // Clean up markdown code blocks if present
    let cleanJson = jsonString.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '');
    }

    // Try to find the first '[' and last ']' to handle chatty responses like "Here is the JSON: [...]"
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }
    
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("JSON parse error:", error.message);
    // console.error("Problematic JSON:", jsonString.slice(0, 100) + "...");
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

// Helper: Run Cloudflare Workers AI
async function runCloudflare(model, prompt) {
  const accountId = CLOUDFLARE_ACCOUNT_ID;
  const apiToken = CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a helpful assistant that outputs JSON." },
        { role: "user", content: prompt }
      ],
      // Some CF models don't support response_format, but Llama 3 often does.
      // We'll rely on the prompt to enforce JSON.
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudflare API Error: ${response.status} ${text}`);
  }

  const result = await response.json();
  return result.result.response;
}

// Helper: Run Pollinations.ai (Free, No Key)
async function runPollinations(model, prompt) {
  // Pollinations uses GET/POST. POST is better for long prompts.
  // URL: https://text.pollinations.ai/
  
  const response = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Output JSON.' },
        { role: 'user', content: prompt }
      ],
      model: model, // 'openai', 'mistral', 'llama'
      jsonMode: true // Pollinations specific flag for JSON
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pollinations API Error: ${response.status} ${text}`);
  }

  // Pollinations returns raw text usually
  return await response.text();
}

// Helper: Retry wrapper with Exponential Backoff
async function generateWithRetry(prompt, retries = 5) {
  let attempt = 0;
  const baseDelay = 10000;
  let modelSwitchCount = 0;
  const models = modelPool.getModels();
  const maxModelSwitches = models.length;

  while (attempt < retries) {
    const currentModel = modelPool.getCurrent();

    try {
      console.log(`🤖 Using provider: ${currentProvider}, model: ${currentModel}`);

      let resultText;

      if (currentProvider === 'gemini') {
        if (!aiClient) throw new Error("Gemini Client not initialized (check API Key)");
        const result = await aiClient.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });
        resultText = result?.text || result?.response?.text();
      } else if (currentProvider === 'cloudflare') {
        resultText = await runCloudflare(currentModel, prompt);
      } else if (currentProvider === 'pollinations') {
        resultText = await runPollinations(currentModel, prompt);
      } else {
        // OpenAI / DeepSeek / SiliconFlow / Groq
        if (!aiClient) throw new Error("OpenAI Client not initialized (check API Key)");
        const completion = await aiClient.chat.completions.create({
          model: currentModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }, // Force JSON mode if supported
        });
        resultText = completion.choices[0].message.content;
      }
      
      return resultText;

    } catch (error) {
      const isRateLimit = error.status === 429 || error.status === 503 || 
                          (error.message && (error.message.includes("429") || error.message.includes("503") || error.message.includes("quota")));
      
      if (isRateLimit || error.message.includes("overloaded")) {
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
        console.error(`❌ API Error (${currentProvider}):`, error.message);
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

            CRITICAL INSTRUCTION: Return ONLY a valid JSON Array. Do NOT include any conversational text, markdown formatting, or explanations. Start with '[' and end with ']'.

            Input:
            ${safeJSONStringify(inputData)}`;

      const responseText = await generateWithRetry(prompt);
      
      if (!responseText) {
        console.warn(`Empty response for ${categoryName} chunk, keeping original.`);
        processedItems = processedItems.concat(chunk);
        await delay(5000);
        continue;
      }
      
      let chunkResult = safeJSONParse(responseText, []);

      if (!Array.isArray(chunkResult)) {
        if (chunkResult.data) chunkResult = chunkResult.data;
        else if (chunkResult.items) chunkResult = chunkResult.items;
        else chunkResult = Object.values(chunkResult)[0];
      }

      if (Array.isArray(chunkResult) && chunkResult.length > 0) {
        const mergedChunk = chunk.map((original, index) => {
          const translated = chunkResult[index];
          if (translated && typeof translated === 'object') {
            return {
              ...original,
              title: translated.title || original.title,
              desc: translated.desc || original.desc || '',
              comment: translated.comment || '',
            };
          }
          return original;
        });
        processedItems = processedItems.concat(mergedChunk);
      } else {
        console.warn(`Invalid result format for ${categoryName}, keeping original.`);
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
