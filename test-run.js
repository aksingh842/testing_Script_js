const axios = require("axios");
const fs = require("fs");
const { Parser } = require("json2csv");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
dotenv.config();

// ------------------------
// CONFIG
// ------------------------
const REFRESH_URL = "https://gateway-dev.on-demand.io/v1/auth/user/refresh_token";
const SESSION_CREATE_URL = "https://gateway-dev.on-demand.io/chat/v1/client/sessions";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";

// Generate unique run ID (timestamp + random suffix)
const RUN_ID = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

let ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
let REFRESH_TOKEN = process.env.REFRESH_TOKEN || "";
let COMPANY_ID = process.env.COMPANY_ID || "";

// Model Monitoring Configuration
const MODEL_TYPE = process.env.MODEL_TYPE || "api"; // "onprem" or "api"

// Platform detection for monitor script
const IS_WINDOWS = process.platform === "win32";

// ------------------------
// TEST CASES
// ------------------------
const TEST_CASES = [
  // {
  //   name: "Tesla Tweets + IG Followers + Sentiment",
  //   query:
  //     "Retrieve 10 tweets about Tesla's new model, summarize sentiment, then pull Instagram follower count of @teslamotors. What does this say about brand traction?",
  //   plugins: [
  //     "plugin-1716326559", // Twitter Extractor
  //     "plugin-1734559981", // Instagram User Info (NEW)
  //   ],
  // },
  // {
  //   name: "AMZN Technical + News + Perplexity",
  //   query:
  //     "Give today's RSI & MACD for Amazon (AMZN), summarize the top 3 AMZN news items, and give a 2-line macro context using Perplexity. Send email to akhielsh21221@gmail.com with a bullish/neutral/bearish verdict.",
  //   plugins: [
  //     "plugin-1716434059", // US Stock TA
  //     "plugin-1716411313", // Latest News Headlines
  //     "plugin-1727033303", // Perplexity
  //     "plugin-1722504304", // Email
  //   ],
  // },
  // {
  //   name: "Ergonomic Keyboard Review + Sketch",
  //   query:
  //     "Find best ergonomic keyboard under $120 on Amazon. Then fetch 10 tweets about it, and generate a sketch of ideal layout. Send email to akhielsh21221@gmail.com with all results.",
  //   plugins: [
  //     "plugin-1716334779", // Amazon Shopping
  //     "plugin-1716326559", // Twitter Extractor
  //     // "plugin-1745475776", // Image Generation
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // // {
  // //   name: "Remote DE Job + LinkedIn + Tweets + Email",
  // //   query:
  // //     "Find a remote data engineer job >$120k. Pull hiring manager LinkedIn headline, extract 10 tweets about their tech stack, and draft a follow-up email. Send email to akhielsh21221@gmail.com.",
  // //   plugins: [
  // //     "plugin-1718116202", // LinkedIn Search
  // //     "plugin-1716326559", // Twitter Extractor
  // //     "plugin-1727033303", // Perplexity
  // //     "plugin-1722504304", // Email
  // //   ],
  // // },
  // {
  //   name: "Fortune 500 Sustainability + TikTok + Image + Email",
  //   query:
  //     "Search LinkedIn for a Head of Sustainability at any Fortune 500 company. Then pull top 3 TikToks tagged #GreenTech and generate a 'Net-Zero Office' image. Send email to akhielsh21221@gmail.com with insights.",
  //   plugins: [
  //     "plugin-1718116202", // LinkedIn Search
  //     // "plugin-1739928801", // TikTok Agent (NEW)
  //     "plugin-1745475776", // Image Generation
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "Evaluate Best Source for NVDA Today",
  //   query:
  //     "Decide whether Stock News, Twitter Extractor, or Perplexity is best for evaluating Nvidia today. Justify the choice and continue with analysis.",
  //   plugins: [
  //     "plugin-1716411313", // Latest News Headlines
  //     "plugin-1716326559", // Twitter Extractor
  //     "plugin-1722260873", // Perplexity
  //   ],
  // },
  // {
  //   name: "Netflix Tweets + IG + TA + Email",
  //   query:
  //     "Pull latest 15 tweets about Netflix pricing, Instagram bio of @netflix, and run a TA check on NFLX. Send email with summary.",
  //   plugins: [
  //     "plugin-1716326559", // Twitter Extractor
  //     // "plugin-1762980461", // Instagram User Info
  //     "plugin-1716434059", // US Stock TA
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "UAE AI Headlines + Image + Perplexity",
  //   query:
  //     "Get 5 latest UAE AI research headlines, generate an AI-human handshake image, and provide a 2-line opinion per story using Perplexity.",
  //   plugins: [
  //     "plugin-1716107632", // UAE Latest News
  //     // "plugin-1745475776", // Image Generation
  //     "plugin-1722260873", // Perplexity
  //   ],
  // },
  // {
  //   name: "#DubaiExpo Tweets + TikTok + Perplexity + Email",
  //   query:
  //     "Pull 20 tweets about #DubaiExpo, top TikTok with same tag, and use Perplexity to summarize its economic impact. Send email with full digest.",
  //   plugins: [
  //     "plugin-1716326559", // Twitter Extractor
  //     // "plugin-1739928801", // TikTok Agent
  //     "plugin-1722260873", // Perplexity
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "Bitcoin + MSTR + TA + Email",
  //   query:
  //     "Get Bitcoin’s current price & 24-h change, latest MicroStrategy headline, and RSI/MACD for MSTR. Send email with report.",
  //   plugins: [
  //     "plugin-1715808194", // Coinmarketcap
  //     "plugin-1716411313", // News Headlines
  //     "plugin-1716434059", // Stock TA
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "UAE Crypto Regulations + Summary + Image + Email",
  //   query:
  //     "Pull latest 3 UAE crypto regulations, summarize each via Perplexity, and generate an image representing 'Dubai FinTech boom'. Send email with report.",
  //   plugins: [
  //     "plugin-1716107632", // UAE News
  //     "plugin-1722260873", // Perplexity
  //     // "plugin-1745475776", // Image Generation
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "Standing Desk Amazon + TikTok + Email",
  //   query:
  //     "Find a top-rated $300 standing desk on Amazon, then check TikTok views for unboxings and fetch latest pricing. Email results.",
  //   plugins: [
  //     "plugin-1716334779", // Amazon Shopping
  //     // "plugin-1716372717", // TikTok Agent
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // // {
  // //   name: "PM SaaS Job + LinkedIn + Post + Image + Email",
  // //   query:
  // //     "Find a remote Product Manager SaaS job, extract firm’s latest LinkedIn post headline, and generate a motivational desk-setup image. Email results.",
  // //   plugins: [
  // //     "plugin-1718116202", // LinkedIn Search
  // //     "plugin-1730662083", // LinkedIn Post
  // //     "plugin-1745475776", // Image Generation
  // //     "plugin-1722504304", // Email
  // //   ],
  // // },
  // {
  //   name: "Cybersecurity Job SG + LinkedIn + Perplexity + Email",
  //   query:
  //     "Search for a cybersecurity job in Singapore, pull recruiter’s LinkedIn headline, and ask Perplexity for top 3 interview questions. Email notes.",
  //   plugins: [
  //     "plugin-1718116202", // LinkedIn Search
  //     "plugin-1722260873", // Perplexity
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // // {
  // //   name: "Mechanical Keyboard Selection (JSON Output)",
  // //   query:
  // //     "Search for top-rated mechanical keyboards under $100. Think in steps: 1) Filter, 2) Compare, 3) Choose. Output reasoning trace JSON.",
  // //   plugins: ["plugin-1716334779"], // Amazon Shopping
  // // },
  // // {
  // //   name: "Forex + Gold + Email",
  // //   query:
  // //     "Pull today’s USD/EUR exchange rate and compare it with Gold price trend. Email a one-line hedging strategy summary.",
  // //   plugins: [
  // //     "plugin-1747245039", // Forex
  // //     "plugin-1716640959", // Commodities
  // //     "plugin-1722504304", // Email
  // //   ],
  // // },
  // {
  //   name: "ETH + COIN TA + Email",
  //   query:
  //     "Get Ethereum’s price from Coinmarketcap and run RSI/MACD for Coinbase (COIN). Email final stance.",
  //   plugins: [
  //     "plugin-1715808194", // Coinmarketcap
  //     "plugin-1716434059", // Stock TA
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // // {
  // //   name: "Tesla LinkedIn Post + News + Email",
  // //   query:
  // //     "Find the latest LinkedIn post from Tesla, then pull 3 news headlines. Email brand sentiment check.",
  // //   plugins: [
  // //     "plugin-1730662083", // LinkedIn Post
  // //     "plugin-1716411313", // News
  // //     "plugin-1722504304", // Email
  // //   ],
  // // },
  // {
  //   name: "Headphones Comparison + Infographic",
  //   query:
  //     "Search Amazon for best-rated noise-cancelling headphones under $200, then generate a product comparison infographic image.",
  //   plugins: [
  //     "plugin-1716334779", // Amazon Shopping
  //     "plugin-1756825179", // Image Generation
  //   ],
  // },
  // {
  //   name: "HubSpot CRM + Email",
  //   query:
  //     "Fetch 5 recent HubSpot CRM contacts and draft a custom outreach email for each, with company background summary. Email result.",
  //   plugins: [
  //     "plugin-1719556333", // HubSpot CRM
  //     "plugin-1722285968", // Email
  //   ],
  // }
  // {
  //   name: "UAE AI PDF Report",
  //   query:
  //     "Get the 5 latest UAE AI headlines and generate a PDF summary.",
  //   plugins: [
  //     "plugin-1716107632", // UAE News
  //     "plugin-1739264368", // PDF generator
  //   ],
  // }
  // {
  //   name: "AAPL TA + USD/JPY + Email",
  //   query:
  //     "Check RSI/MACD for Apple (AAPL) and today’s USD/JPY rate. Email macro-trade insight.",
  //   plugins: [
  //     "plugin-1716434059", // TA
  //     "plugin-1747245039", // Forex
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "Office Chairs + Tweets + Email",
  //   query:
  //     "Find top-rated office chairs under $250, then fetch 10 tweets mentioning those products. Email summary.",
  //   plugins: [
  //     "plugin-1716334779", // Amazon
  //     "plugin-1716326559", // Twitter Extractor
  //     "plugin-1722285968", // Email
  //   ],
  // },
  // {
  //   name: "Bitcoin vs Wall Street Image",
  //   query:
  //     "Fetch Bitcoin price, 3 latest BTC headlines, and generate 'Bitcoin vs Wall Street' image.",
  //   plugins: [
  //     "plugin-1715808194", // Coinmarketcap
  //     "plugin-1716411313", // News
  //     "plugin-1745475776", // Image
  //   ],
  // },
  // {
  //   name: "YouTube + News + PDF",
  //   query:
  //     "Upload a YouTube video, extract key info, and combine it with 3 relevant news headlines into a PDF report.",
  //   plugins: [
  //     "plugin-1713961903", // YouTube
  //     "plugin-1716411313", // News
  //     "plugin-1739264368", // PDF
  //   ],
  // },
  // {
  //   name: "Tesla Price Update + Email",
  //   query:
  //     "Fetch the latest Tesla (TSLA) US stock price and send an email with the details to akhilesh21221@gmail.com.",
  //   plugins: [
  //     "plugin-1716434059", // US Stock Analysis
  //     "plugin-1722285968", // Email Agent
  //   ],
  // },

  //IOT TEST CASES
  // {
  //   name: "City Environmental Health Check (Easy)",
  //   query:
  //     "Get the city's current temperature, humidity, and CO2 concentration to assess the air quality index.",
  //   plugins: [
  //     "plugin-1765541231", // Smart City IoT Environmental Sensor Tool
  //   ],
  // },
  // {
  //   name: "Night Mode Activation (Easy)",
  //   query:
  //     "Turn on all street lights and ensure the railway barriers are active for night safety.",
  //   plugins: [
  //     "plugin-1765540909", // Smart City Infrastructure Tool
  //   ],
  // },
  // {
  //   name: "Smart Grid & Resource Report (Medium)",
  //   query:
  //     "Get a summary of all sensor data including resource usage, and check the current status of the wind turbines.",
  //   plugins: [
  //     "plugin-1765541231", // Smart City IoT Environmental Sensor Tool
  //     "plugin-1765540909", // Smart City Infrastructure Tool
  //   ],
  // },
  // {
  //   name: "Emergency Hazard Viz (Medium)",
  //   query:
  //     "Get the current CO2 concentration levels. Based on the data, generate a 'City Hazard Warning' infographic image.",
  //   plugins: [
  //     "plugin-1765541231", // Smart City IoT Environmental Sensor Tool
  //     "plugin-1756825179", // Image Generation Tool
  //   ],
  // },
  {
    name: "Eco-Infrastructure Status (Medium)",
    query:
      "Turn on the wind turbines to maximize energy capture, then fetch the city's humidity and temperature to log operating conditions.",
    plugins: [
      "plugin-1765540909", // Smart City Infrastructure Tool
      "plugin-1765541231", // Smart City IoT Environmental Sensor Tool
    ],
  },
];

// ---------------- TOKEN REFRESH ----------------
async function refreshToken() {
  console.log("🔄 Refreshing token...");
  try {
    const res = await axios.post(
      REFRESH_URL,
      {
        data: {
          token: ACCESS_TOKEN,
          refreshToken: REFRESH_TOKEN
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "x-company-id": COMPANY_ID
        }
      }
    );

    const newToken = res.data?.data?.token;
    const newRefresh = res.data?.data?.refreshToken;
    console.log("response from refresh ", res.data);
    console.log("newToken ", newToken);
    console.log("newRefresh ", newRefresh);
    if (!newToken) throw new Error("Refresh API missing token");

    ACCESS_TOKEN = newToken;
    if (newRefresh) REFRESH_TOKEN = newRefresh;

    console.log("✅ Token refreshed");
    return true;
  } catch (e) {
    console.error("❌ Token refresh failed:", e.response?.data || e.message);
    return false;
  }
}

// ---------------- FETCH PLUGIN STATS ----------------
async function fetchPluginStats(sessionId, messageId) {
  const PLUGIN_STATS_URL = "https://gateway-dev.on-demand.io/analytic/v1/admin/pluginexecutestats";

  try {
    console.log(`\n📊 Fetching plugin latency stats...`);
    const response = await axios.get(PLUGIN_STATS_URL, {
      params: {
        sessionId,
        messageId,
        companyId: COMPANY_ID
      },
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "x-company-id": COMPANY_ID
      }
    });

    if (response.data?.data && response.data.data.length > 0) {
      console.log(`✅ Found ${response.data.data.length} plugin execution(s)`);
      return response.data.data;
    }

    console.log("ℹ️ No plugin stats available yet");
    return [];
  } catch (err) {
    console.error("⚠️ Failed to fetch plugin stats:", err.response?.data || err.message);
    return [];
  }
}

// ---------------- FETCH CHAT STATS (RAG & FULFILLMENT) ----------------
async function fetchChatStats(sessionId, messageId, chatType) {
  const CHAT_STATS_URL = "https://gateway-dev.on-demand.io/analytic/v1/admin/chatStats/filter";

  try {
    console.log(`\n📈 Fetching ${chatType} chat stats...`);
    const response = await axios.get(CHAT_STATS_URL, {
      params: {
        sessionId,
        messageId,
        companyId: COMPANY_ID,
        chatType
      },
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "x-company-id": COMPANY_ID
      }
    });

    if (response.data?.data && response.data.data.length > 0) {
      const stats = response.data.data[0];
      console.log(`✅ ${chatType} stats:`, {
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        totalTimeSec: stats.totalTimeSec
      });
      return stats;
    }

    console.log(`ℹ️ No ${chatType} stats available`);
    return null;
  } catch (err) {
    console.error(`⚠️ Failed to fetch ${chatType} stats:`, err.response?.data || err.message);
    return null;
  }
}

// ---------------- CREATE SESSION ----------------
async function createSession() {
  try {
    // console.log("env from .env", COMPANY_ID, ACCESS_TOKEN);
    const response = await axios.post(
      SESSION_CREATE_URL,
      {
        pluginIds: [],
        externalUserId: "1"
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "x-company-id": COMPANY_ID,
          "Content-Type": "application/json"
        }
      }
    );
    // console.log("response ", response );
    // console.log("✅ Session creation response:", response.data);
    const sessionId = response.data?.data?.id;
    console.log("🆕 Session Created:", sessionId);
    return sessionId;
  } catch (err) {
    if (err.response?.status === 401) {
      console.log("❗ 401 Token expired during session creation");
      const ok = await refreshToken();
      if (ok) return await createSession();
    }
    console.error("❌ Failed to create session:", err.response?.data || err.message);
    return null;
  }
}

// ---------------- STREAM CALL ----------------
async function sendStream(sessionId, payload, retry = 0) {
  const API_URL = `https://gateway-dev.on-demand.io/chat/v1/client/sessions/${sessionId}/query`;

  try {
    return await axios({
      method: "POST",
      url: API_URL,
      data: payload,
      responseType: "stream",
      timeout: 900000, // 5 minutes - streaming can take longer
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "x-company-id": COMPANY_ID,
        "x-enable-plugin": "true"
      }
    });
  } catch (err) {
    if (err.response?.status === 401 && retry === 0) {
      console.log("❗ 401 Token expired");
      const ok = await refreshToken();
      if (!ok) throw err;
      return await sendStream(sessionId, payload, 1);
    }
    throw err;
  }
}

// ---------------- ERROR PATTERNS TO DETECT ----------------
const ERROR_PATTERNS = [
  { pattern: /rag[_\s-]?error/i, name: "RAG Error" },
  { pattern: /fulfillment[_\s-]?error/i, name: "Fulfillment Error" },
  { pattern: /internal[_\s-]?server[_\s-]?error/i, name: "Internal Server Error" },
  { pattern: /"error"\s*:\s*true/i, name: "Error Flag Detected" },
  { pattern: /"errorCode"\s*:/i, name: "Error Code Detected" },
  { pattern: /failed to execute/i, name: "Execution Failure" },
  { pattern: /plugin[_\s-]?execution[_\s-]?failed/i, name: "Plugin Execution Failed" },
];

// Function to detect errors in response
function detectResponseErrors(response, answer) {
  const errors = [];

  for (const { pattern, name } of ERROR_PATTERNS) {
    if (pattern.test(response) || pattern.test(answer)) {
      errors.push(name);
    }
  }

  return errors;
}

// ---------------- PROCESS TEST CASE ----------------
async function runTestCase(test, index) {
  console.log(`\n=================================`);
  console.log(`🚀 Running Test #${index + 1}: ${test.name}`);
  console.log(`=================================`);

  const sessionId = await createSession();
  if (!sessionId) {
    console.error("❌ Could not create session. Stopping test suite.");
    return { success: false, error: "Session creation failed", fatal: true };
  }

  const payload = {
    endpointId: "byoi-0fccd8a5-dd0d-4345-b1a5-7b3369437250",
    query: test.query,
    pluginIds: test.plugins,
    reasoningMode: "byor-019b4a29-70a8-7d47-867f-9472f5ca66c9",
    responseMode: "stream",
    debugMode: "on",
    modelConfigs: { temperature: 0.7 },
    fulfillmentOnly: false
  };

  let fullResponse = "";
  let finalAnswer = "";
  let allMetrics = [];

  let response;

  try {
    response = await sendStream(sessionId, payload);
  } catch (err) {
    console.error("❌ Request failed:", err.message);
    let errorDetails = err.message;

    // Try to read the error response body if it exists
    if (err.response?.data) {
      try {
        let errorBody = '';

        // Check if data is a stream or already a string/object
        if (typeof err.response.data === 'object' && err.response.data.read) {
          // It's a stream, read it
          err.response.data.on('data', chunk => {
            errorBody += chunk.toString();
          });

          await new Promise((resolve) => {
            err.response.data.on('end', () => {
              console.error("📄 Error response body:", errorBody);
              try {
                const parsed = JSON.parse(errorBody);
                console.error("🔍 Parsed error:", JSON.stringify(parsed, null, 2));
                errorDetails = parsed.message || parsed.error || errorBody;
              } catch (e) {
                // Not JSON, already printed raw
                errorDetails = errorBody;
              }
              resolve();
            });
          });
        } else {
          // Already parsed
          console.error("📄 Error response:", JSON.stringify(err.response.data, null, 2));
          errorDetails = err.response.data.message || err.response.data.error || JSON.stringify(err.response.data);
        }
      } catch (readErr) {
        console.error("⚠️ Could not read error body:", readErr.message);
      }
    }

    if (err.response?.status) {
      console.error("📊 Status code:", err.response.status);
    }

    return { success: false, error: `Request failed: ${errorDetails}`, fatal: true };
  }

return new Promise((resolve) => {
  let streamTimeout;
  let dataBuffer = ""; // Buffer for incomplete data
  
  // Set a timeout to prevent hanging (e.g., 5 minutes)
  const setStreamTimeout = () => {
    if (streamTimeout) clearTimeout(streamTimeout);
    streamTimeout = setTimeout(() => {
      console.log("\n⏰ Stream timeout - forcing completion");
      response.data.destroy();
      resolve({ success: false, error: "Stream timeout after 5 minutes", fatal: true });
    }, 300000); // 5 minutes
  };
  
  setStreamTimeout();

  response.data.on("data", (chunk) => {
    setStreamTimeout(); // Reset timeout on each chunk
    
    const text = chunk.toString();
    fullResponse += text;
    
    // Add to buffer
    dataBuffer += text;

    // Extract metrics and answers - process complete lines only
    const lines = dataBuffer.split('\n');

    // Keep the last incomplete line in buffer
    dataBuffer = lines.pop() || "";

    // Process each complete line
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;

      const jsonStr = line.replace(/^data:/, '').trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);

        // Extract answer from various possible fields
        let answerContent = null;

        if (parsed.answer) {
          answerContent = parsed.answer;
        } else if (parsed.content) {
          answerContent = parsed.content;
        } else if (parsed.text) {
          answerContent = parsed.text;
        } else if (parsed.delta?.content) {
          answerContent = parsed.delta.content;
        } else if (parsed.choices?.[0]?.delta?.content) {
          answerContent = parsed.choices[0].delta.content;
        } else if (parsed.choices?.[0]?.message?.content) {
          answerContent = parsed.choices[0].message.content;
        }

        if (answerContent) {
          process.stdout.write(answerContent);
          finalAnswer += answerContent;
        }

        // Extract metrics
        if (parsed.eventType === 'metricsLog' && parsed.publicMetrics) {
          const metricData = {
            eventType: parsed.eventType,
            sessionId: parsed.sessionId,
            messageId: parsed.messageId,
            ...parsed.publicMetrics
          };

          allMetrics.push(metricData);
          console.log("\n📈 Metrics captured:", {
            inputTokens: metricData.inputTokens,
            outputTokens: metricData.outputTokens,
            totalTokens: metricData.totalTokens,
            totalTimeSec: metricData.totalTimeSec
          });
        }
      } catch (err) {
        // Silently continue for unparseable lines
      }

      // Check for completion
      if (line.includes('[DONE]')) {
        console.log("\n✅ Stream completed with [DONE] signal");
        clearTimeout(streamTimeout);
      }
    }
  });

  response.data.on("error", (err) => {
    clearTimeout(streamTimeout);
    console.error("\n❌ Stream error:", err.message);
    resolve({ success: false, error: `Stream error: ${err.message}`, fatal: true });
  });

  response.data.on("end", async () => {
    clearTimeout(streamTimeout);

    // Process any remaining data in buffer
    if (dataBuffer.trim()) {
      const lines = dataBuffer.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;

        const jsonStr = line.replace(/^data:/, '').trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);

          // Extract any remaining answer content
          let answerContent = null;
          if (parsed.answer) {
            answerContent = parsed.answer;
          } else if (parsed.content) {
            answerContent = parsed.content;
          } else if (parsed.text) {
            answerContent = parsed.text;
          } else if (parsed.delta?.content) {
            answerContent = parsed.delta.content;
          } else if (parsed.choices?.[0]?.delta?.content) {
            answerContent = parsed.choices[0].delta.content;
          } else if (parsed.choices?.[0]?.message?.content) {
            answerContent = parsed.choices[0].message.content;
          }

          if (answerContent) {
            process.stdout.write(answerContent);
            finalAnswer += answerContent;
          }

          // Extract metrics
          if (parsed.eventType === 'metricsLog' && parsed.publicMetrics && allMetrics.length === 0) {
            const metricData = {
              eventType: parsed.eventType,
              sessionId: parsed.sessionId,
              messageId: parsed.messageId,
              ...parsed.publicMetrics
            };
            allMetrics.push(metricData);
            console.log("\n📈 Final metrics captured from buffer");
          }
        } catch (err) {
          // Ignore final buffer errors
        }
      }
    }

    // ========== ERROR DETECTION SECTION ==========

    // Check for blank/empty response
    if (!finalAnswer || finalAnswer.trim().length === 0) {
      console.error("\n❌ FAILURE: Response is blank or empty");
      console.error("📄 Full response data:", fullResponse.substring(0, 500) + "...");
      resolve({
        success: false,
        error: "Response is blank or empty",
        fatal: true,
        sessionId
      });
      return;
    }

    // Check for errors in the response content
    const detectedErrors = detectResponseErrors(fullResponse, finalAnswer);
    if (detectedErrors.length > 0) {
      console.error("\n❌ FAILURE: Errors detected in response");
      console.error("🔍 Detected errors:", detectedErrors.join(", "));
      console.error("📄 Response excerpt:", finalAnswer.substring(0, 300) + "...");
      resolve({
        success: false,
        error: `Response contains errors: ${detectedErrors.join(", ")}`,
        fatal: true,
        sessionId,
        detectedErrors
      });
      return;
    }

    console.log(`\n\n✅ Completed: ${test.name}`);

    // Fetch plugin latency stats
    let pluginStats = [];
    let ragStats = null;
    let fulfillmentStats = null;

    if (allMetrics.length > 0 && allMetrics[0].messageId) {
      const messageId = allMetrics[0].messageId;

      // Fetch plugin stats
      pluginStats = await fetchPluginStats(sessionId, messageId);

      // Log plugin latencies
      if (pluginStats.length > 0) {
        console.log("\n⏱️  Plugin Latencies:");
        pluginStats.forEach(stat => {
          console.log(`  - ${stat.pluginId}: ${stat.latencyMs}ms (${stat.success ? '✅' : '❌'})`);
        });
      }

      // Fetch RAG and Fulfillment token stats
      ragStats = await fetchChatStats(sessionId, messageId, "rag_completed");
      fulfillmentStats = await fetchChatStats(sessionId, messageId, "fulfillment_completed");
    }

    // webhook
    if (WEBHOOK_URL) {
      try {
        await axios.post(WEBHOOK_URL, {
          runId: RUN_ID,
          testName: test.name,
          sessionId,
          response: fullResponse,
          answer: finalAnswer,
          metrics: allMetrics,
          pluginStats: pluginStats,
          ragStats: ragStats,
          fulfillmentStats: fulfillmentStats
        });
        console.log("📤 Webhook sent");
      } catch (err) {
        console.error("❌ Webhook failed:", err.message);
        if (err.response?.status) {
          console.error("   Status code:", err.response.status);
        }
        resolve({
          success: false,
          error: `Webhook failed: ${err.message}`,
          fatal: true,
          sessionId
        });
        return;
      }
    } else {
      console.log("ℹ️ Webhook skipped (WEBHOOK_URL not configured)");
    }

    // Save metrics to CSV
    if (allMetrics.length > 0) {
      const csvFile = 'result.csv';
      const fileExists = fs.existsSync(csvFile);

      // Combine metrics with plugin stats, RAG stats, and fulfillment stats
      const csvData = allMetrics.map((m) => {
        // Calculate plugin latency first
        let totalPluginLatencySec = 0;
        if (pluginStats.length > 0) {
          const totalPluginLatencyMs = pluginStats.reduce((sum, stat) => sum + (stat.latencyMs || 0), 0);
          totalPluginLatencySec = totalPluginLatencyMs / 1000;
        }

        const ragTimeSec = ragStats?.totalTimeSec || 0;
        const fulfillmentTimeSec = fulfillmentStats?.totalTimeSec || 0;
        const totalTime = ragTimeSec + fulfillmentTimeSec;

        const row = {
          runId: RUN_ID,
          testName: test.name,
          timestamp: new Date().toISOString(),
          sessionId,
          messageId: m.messageId,
          answer: finalAnswer,

          // RAG-specific metrics
          rag_inputTokens: ragStats?.inputTokens || 0,
          rag_outputTokens: ragStats?.outputTokens || 0,
          rag_totalTokens: (ragStats?.inputTokens || 0) + (ragStats?.outputTokens || 0),
          rag_totalTimeSec: ragTimeSec,
          rag_endpointId: ragStats?.endpointId || '',
          rag_reasoningMode: ragStats?.reasoningMode || '',

          // Fulfillment-specific metrics
          fulfillment_inputTokens: fulfillmentStats?.inputTokens || 0,
          fulfillment_outputTokens: fulfillmentStats?.outputTokens || 0,
          fulfillment_totalTokens: (fulfillmentStats?.inputTokens || 0) + (fulfillmentStats?.outputTokens || 0),
          fulfillment_totalTimeSec: fulfillmentTimeSec,
          fulfillment_endpointId: fulfillmentStats?.endpointId || '',

          // Combined totals
          total_inputTokens: (ragStats?.inputTokens || 0) + (fulfillmentStats?.inputTokens || 0),
          total_outputTokens: (ragStats?.outputTokens || 0) + (fulfillmentStats?.outputTokens || 0),
          total_tokens: (ragStats?.inputTokens || 0) + (ragStats?.outputTokens || 0) +
                        (fulfillmentStats?.inputTokens || 0) + (fulfillmentStats?.outputTokens || 0),

          // Total time (RAG + Fulfillment, includes plugin latency since plugins run during RAG)
          total_time_sec: totalTime,

          // Plugin latency total
          total_plugin_latency_s: totalPluginLatencySec,

          // Corrected RAG time (RAG time minus plugin latency, since plugins only run during RAG)
          corrected_rag_time_s: ragTimeSec - totalPluginLatencySec,
        };

        // Add individual plugin latencies as separate columns
        if (pluginStats.length > 0) {
          pluginStats.forEach((stat, idx) => {
            const latencySec = (stat.latencyMs || 0) / 1000;
            row[`plugin_${idx + 1}_id`] = stat.pluginId;
            row[`plugin_${idx + 1}_latency_s`] = latencySec;
            row[`plugin_${idx + 1}_success`] = stat.success;
            row[`plugin_${idx + 1}_stage`] = stat.stage;
            row[`plugin_${idx + 1}_executed_at`] = stat.executedAt;
          });
        }

        return row;
      });

      const csv = new Parser().parse(csvData);

      // Append to result.csv (or create if doesn't exist)
      if (fileExists) {
        // File exists, append without header
        const csvWithoutHeader = csv.split('\n').slice(1).join('\n');
        fs.appendFileSync(csvFile, '\n' + csvWithoutHeader);
      } else {
        // File doesn't exist, write with header
        fs.writeFileSync(csvFile, csv);
      }

      console.log(`📁 Saved metrics to: ${csvFile}`);
      console.log(`📝 Answer length: ${finalAnswer.length} characters`);
    } else {
      console.log("ℹ️ No metrics found for:", test.name);
    }

    resolve({ success: true, sessionId, answerLength: finalAnswer.length });
  });
});
  
}

// ---------------- TEST SUITE ----------------
async function runAllTests() {
  console.log("\n🎯 Starting Test Suite");
  console.log(`🆔 Run ID: ${RUN_ID}`);
  console.log(`Company: ${COMPANY_ID}`);
  console.log(`Model Type: ${MODEL_TYPE}`);
  console.log(`Total Tests: ${TEST_CASES.length}`);

  let monitorProcess = null;

  // Start system monitoring if MODEL_TYPE is "onprem"
  if (MODEL_TYPE.toLowerCase() === "onprem") {
    if (IS_WINDOWS) {
      // Windows: Use HWiNFO shared memory monitor
      console.log("\n📊 Starting System Resource Monitor (HWiNFO Shared Memory)...");
      console.log(`   Metrics File: ${process.env.HWINFO_LOG_FILE || 'hwinfo_log.csv'}`);
      console.log(`   Run ID: ${RUN_ID}`);
      console.log(`   ⚠️  Ensure HWiNFO is running with Shared Memory Support enabled`);

      monitorProcess = spawn("python", ["-u", "monitor.py", "--run-id", RUN_ID], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });
    } else {
      // Linux: Use qmassa-based monitor for system-wide metrics
      console.log("\n📊 Starting System Resource Monitor (CPU/Memory/GPU via qmassa)...");
      console.log(`   Run ID: ${RUN_ID}`);
      console.log(`   Metrics File: system_metrics.csv`);

      monitorProcess = spawn("python3", [
        "monitor_linux_backup.py",
        "--out",
        "system_metrics.csv",
        "--interval",
        "0.5",
        "--run-id",
        RUN_ID
      ]);
    }

    monitorProcess.stdout.on('data', (data) => {
      console.log(`[Monitor]: ${data.toString().trim()}`);
    });

    monitorProcess.stderr.on('data', (data) => {
      console.error(`[Monitor Error]: ${data.toString().trim()}`);
    });

    monitorProcess.on('error', (err) => {
      console.error(`[Monitor Process Error]: ${err.message}`);
    });

    // Allow monitor to initialize
    console.log("⏳ Waiting for monitor to initialize...");
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    console.log(`\n⏭️  Skipping system monitoring (MODEL_TYPE=${MODEL_TYPE})`);
  }

  let testsFailed = 0;
  let testsPassed = 0;
  let fatalError = null;

  try {
    for (let i = 0; i < TEST_CASES.length; i++) {
      const result = await runTestCase(TEST_CASES[i], i);

      // Check result for failures
      if (result && !result.success) {
        testsFailed++;
        console.error(`\n${"=".repeat(50)}`);
        console.error(`❌ TEST FAILED: ${TEST_CASES[i].name}`);
        console.error(`   Error: ${result.error}`);
        console.error(`${"=".repeat(50)}`);

        // Stop on fatal errors
        if (result.fatal) {
          fatalError = result.error;
          console.error(`\n🛑 FATAL ERROR - Stopping test suite`);
          console.error(`   Reason: ${result.error}`);
          break;
        }
      } else if (result && result.success) {
        testsPassed++;
      } else {
        // No result returned (shouldn't happen now, but handle gracefully)
        testsFailed++;
        console.error(`\n❌ TEST FAILED: ${TEST_CASES[i].name} (no result returned)`);
      }

      if (i < TEST_CASES.length - 1 && !fatalError) {
        console.log("\n⏳ Waiting 2 sec...");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } finally {
    // Stop monitoring if it was started
    if (monitorProcess) {
      // Wait 10 seconds after test completion to capture final metrics
      // Skip only if there was a fatal error that stopped tests early
      if (!fatalError) {
        console.log("\n⏳ Waiting 10 seconds for final hardware metrics...");
        await new Promise((r) => setTimeout(r, 10000));
      }

      console.log("\n🛑 Stopping System Resource Monitor...");
      monitorProcess.kill("SIGINT");

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        monitorProcess.on('exit', () => {
          console.log("✅ Monitor stopped successfully");
          resolve();
        });

        // Force kill after 3 seconds if not stopped
        setTimeout(() => {
          if (!monitorProcess.killed) {
            monitorProcess.kill("SIGKILL");
            console.log("⚠️ Monitor force-stopped");
          }
          resolve();
        }, 3000);
      });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUITE SUMMARY");
  console.log("=".repeat(50));
  console.log(`   🆔 Run ID: ${RUN_ID}`);
  console.log(`   Total Tests: ${TEST_CASES.length}`);
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   ⏭️  Skipped: ${TEST_CASES.length - testsPassed - testsFailed}`);
  console.log("=".repeat(50));

  if (fatalError) {
    console.error(`\n❌ TEST SUITE FAILED`);
    console.error(`   Fatal Error: ${fatalError}`);
    process.exit(1);
  } else if (testsFailed > 0) {
    console.error(`\n❌ TEST SUITE COMPLETED WITH FAILURES`);
    process.exit(1);
  } else {
    console.log("\n🎉 ALL TESTS PASSED\n");
  }
}

module.exports = { runAllTests };
