const axios = require("axios");
const fs = require("fs");
const { Parser } = require("json2csv");
const dotenv = require("dotenv");
dotenv.config();

// ------------------------
// CONFIG
// ------------------------
const REFRESH_URL = "https://gateway-dev.on-demand.io/v1/auth/user/refresh_token";
const SESSION_CREATE_URL = "https://gateway-dev.on-demand.io/chat/v1/client/sessions";
const WEBHOOK_URL = "https://webhook.site/86018ebd-22b8-4b81-9f4a-66159c4dbf3f";

let ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
let REFRESH_TOKEN = process.env.REFRESH_TOKEN || "";
let COMPANY_ID = process.env.COMPANY_ID || "";

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
  {
    name: "Ergonomic Keyboard Review + Sketch",
    query:
      "Find best ergonomic keyboard under $120 on Amazon. Then fetch 10 tweets about it, and generate a sketch of ideal layout. Send email to akhielsh21221@gmail.com with all results.",
    plugins: [
      "plugin-1716334779", // Amazon Shopping
      "plugin-1716326559", // Twitter Extractor
      // "plugin-1745475776", // Image Generation
      "plugin-1722285968", // Email
    ],
  },
  // {
  //   name: "Remote DE Job + LinkedIn + Tweets + Email",
  //   query:
  //     "Find a remote data engineer job >$120k. Pull hiring manager LinkedIn headline, extract 10 tweets about their tech stack, and draft a follow-up email. Send email to akhielsh21221@gmail.com.",
  //   plugins: [
  //     "plugin-1718116202", // LinkedIn Search
  //     "plugin-1716326559", // Twitter Extractor
  //     "plugin-1727033303", // Perplexity
  //     "plugin-1722504304", // Email
  //   ],
  // },
  {
    name: "Fortune 500 Sustainability + TikTok + Image + Email",
    query:
      "Search LinkedIn for a Head of Sustainability at any Fortune 500 company. Then pull top 3 TikToks tagged #GreenTech and generate a 'Net-Zero Office' image. Send email to akhielsh21221@gmail.com with insights.",
    plugins: [
      "plugin-1718116202", // LinkedIn Search
      // "plugin-1739928801", // TikTok Agent (NEW)
      "plugin-1745475776", // Image Generation
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "Evaluate Best Source for NVDA Today",
    query:
      "Decide whether Stock News, Twitter Extractor, or Perplexity is best for evaluating Nvidia today. Justify the choice and continue with analysis.",
    plugins: [
      "plugin-1716411313", // Latest News Headlines
      "plugin-1716326559", // Twitter Extractor
      "plugin-1722260873", // Perplexity
    ],
  },
  {
    name: "Netflix Tweets + IG + TA + Email",
    query:
      "Pull latest 15 tweets about Netflix pricing, Instagram bio of @netflix, and run a TA check on NFLX. Send email with summary.",
    plugins: [
      "plugin-1716326559", // Twitter Extractor
      // "plugin-1762980461", // Instagram User Info
      "plugin-1716434059", // US Stock TA
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "UAE AI Headlines + Image + Perplexity",
    query:
      "Get 5 latest UAE AI research headlines, generate an AI-human handshake image, and provide a 2-line opinion per story using Perplexity.",
    plugins: [
      "plugin-1716107632", // UAE Latest News
      // "plugin-1745475776", // Image Generation
      "plugin-1722260873", // Perplexity
    ],
  },
  {
    name: "#DubaiExpo Tweets + TikTok + Perplexity + Email",
    query:
      "Pull 20 tweets about #DubaiExpo, top TikTok with same tag, and use Perplexity to summarize its economic impact. Send email with full digest.",
    plugins: [
      "plugin-1716326559", // Twitter Extractor
      // "plugin-1739928801", // TikTok Agent
      "plugin-1722260873", // Perplexity
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "Bitcoin + MSTR + TA + Email",
    query:
      "Get Bitcoin’s current price & 24-h change, latest MicroStrategy headline, and RSI/MACD for MSTR. Send email with report.",
    plugins: [
      "plugin-1715808194", // Coinmarketcap
      "plugin-1716411313", // News Headlines
      "plugin-1716434059", // Stock TA
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "UAE Crypto Regulations + Summary + Image + Email",
    query:
      "Pull latest 3 UAE crypto regulations, summarize each via Perplexity, and generate an image representing 'Dubai FinTech boom'. Send email with report.",
    plugins: [
      "plugin-1716107632", // UAE News
      "plugin-1722260873", // Perplexity
      // "plugin-1745475776", // Image Generation
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "Standing Desk Amazon + TikTok + Email",
    query:
      "Find a top-rated $300 standing desk on Amazon, then check TikTok views for unboxings and fetch latest pricing. Email results.",
    plugins: [
      "plugin-1716334779", // Amazon Shopping
      // "plugin-1716372717", // TikTok Agent
      "plugin-1722285968", // Email
    ],
  },
  // {
  //   name: "PM SaaS Job + LinkedIn + Post + Image + Email",
  //   query:
  //     "Find a remote Product Manager SaaS job, extract firm’s latest LinkedIn post headline, and generate a motivational desk-setup image. Email results.",
  //   plugins: [
  //     "plugin-1718116202", // LinkedIn Search
  //     "plugin-1730662083", // LinkedIn Post
  //     "plugin-1745475776", // Image Generation
  //     "plugin-1722504304", // Email
  //   ],
  // },
  {
    name: "Cybersecurity Job SG + LinkedIn + Perplexity + Email",
    query:
      "Search for a cybersecurity job in Singapore, pull recruiter’s LinkedIn headline, and ask Perplexity for top 3 interview questions. Email notes.",
    plugins: [
      "plugin-1718116202", // LinkedIn Search
      "plugin-1722260873", // Perplexity
      "plugin-1722285968", // Email
    ],
  },
  // {
  //   name: "Mechanical Keyboard Selection (JSON Output)",
  //   query:
  //     "Search for top-rated mechanical keyboards under $100. Think in steps: 1) Filter, 2) Compare, 3) Choose. Output reasoning trace JSON.",
  //   plugins: ["plugin-1716334779"], // Amazon Shopping
  // },
  // {
  //   name: "Forex + Gold + Email",
  //   query:
  //     "Pull today’s USD/EUR exchange rate and compare it with Gold price trend. Email a one-line hedging strategy summary.",
  //   plugins: [
  //     "plugin-1747245039", // Forex
  //     "plugin-1716640959", // Commodities
  //     "plugin-1722504304", // Email
  //   ],
  // },
  {
    name: "ETH + COIN TA + Email",
    query:
      "Get Ethereum’s price from Coinmarketcap and run RSI/MACD for Coinbase (COIN). Email final stance.",
    plugins: [
      "plugin-1715808194", // Coinmarketcap
      "plugin-1716434059", // Stock TA
      "plugin-1722285968", // Email
    ],
  },
  // {
  //   name: "Tesla LinkedIn Post + News + Email",
  //   query:
  //     "Find the latest LinkedIn post from Tesla, then pull 3 news headlines. Email brand sentiment check.",
  //   plugins: [
  //     "plugin-1730662083", // LinkedIn Post
  //     "plugin-1716411313", // News
  //     "plugin-1722504304", // Email
  //   ],
  // },
  // {
  //   name: "Headphones Comparison + Infographic",
  //   query:
  //     "Search Amazon for best-rated noise-cancelling headphones under $200, then generate a product comparison infographic image.",
  //   plugins: [
  //     "plugin-1716334779", // Amazon Shopping
  //     "plugin-1745475776", // Image Generation
  //   ],
  // },
  {
    name: "HubSpot CRM + Email",
    query:
      "Fetch 5 recent HubSpot CRM contacts and draft a custom outreach email for each, with company background summary. Email result.",
    plugins: [
      "plugin-1750083538", // HubSpot CRM
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "UAE AI PDF Report",
    query:
      "Get the 5 latest UAE AI headlines and generate a PDF summary.",
    plugins: [
      "plugin-1716107632", // UAE News
      "plugin-1739264368", // PDF generator
    ],
  },
  {
    name: "AAPL TA + USD/JPY + Email",
    query:
      "Check RSI/MACD for Apple (AAPL) and today’s USD/JPY rate. Email macro-trade insight.",
    plugins: [
      "plugin-1716434059", // TA
      "plugin-1747245039", // Forex
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "Office Chairs + Tweets + Email",
    query:
      "Find top-rated office chairs under $250, then fetch 10 tweets mentioning those products. Email summary.",
    plugins: [
      "plugin-1716334779", // Amazon
      "plugin-1716326559", // Twitter Extractor
      "plugin-1722285968", // Email
    ],
  },
  {
    name: "Bitcoin vs Wall Street Image",
    query:
      "Fetch Bitcoin price, 3 latest BTC headlines, and generate 'Bitcoin vs Wall Street' image.",
    plugins: [
      "plugin-1715808194", // Coinmarketcap
      "plugin-1716411313", // News
      "plugin-1745475776", // Image
    ],
  },
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
      timeout: 60000,
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

// ---------------- PROCESS TEST CASE ----------------
async function runTestCase(test, index) {
  console.log(`\n=================================`);
  console.log(`🚀 Running Test #${index + 1}: ${test.name}`);
  console.log(`=================================`);

  const sessionId = await createSession();
  if (!sessionId) {
    console.error("❌ Could not create session. Skipping test.");
    return;
  }

  const payload = {
    endpointId: "predefined-openai-gpt4.1",
    query: test.query,
    pluginIds: test.plugins,
    reasoningMode: "gpt-5.1",
    responseMode: "stream",
    debugMode: "on",
    modelConfigs: { temperature: 0.7 },
    fulfillmentOnly: false
  };

  let fullResponse = "";
  let finalAnswer = "";
  let metrics = null;
  let allMetrics = [];

  let response;

  try {
    response = await sendStream(sessionId, payload);
  } catch (err) {
    console.error("❌ Request failed:", err.response?.data || err.message);
    return;
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
      resolve();
    }, 300000); // 5 minutes
  };
  
  setStreamTimeout();

  response.data.on("data", (chunk) => {
    setStreamTimeout(); // Reset timeout on each chunk
    
    const text = chunk.toString();
    fullResponse += text;
    
    // Add to buffer
    dataBuffer += text;

    // Extract answer
    const answerMatches = [...dataBuffer.matchAll(/data:(\{[^}]*"answer"[^}]*\})/g)];
    for (const match of answerMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.answer) {
          process.stdout.write(parsed.answer);
          finalAnswer += parsed.answer;
        }
      } catch (e) {
        // Silently continue
      }
    }

    // Extract metrics - process complete lines only
    const lines = dataBuffer.split('\n');
    
    // Keep the last incomplete line in buffer
    dataBuffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith('data:') && line.includes('"eventType":"metricsLog"')) {
        try {
          const jsonStr = line.replace(/^data:/, '').trim();
          const parsed = JSON.parse(jsonStr);
          
          if (parsed.publicMetrics) {
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
          console.log("⚠️ Metric parse error:", err.message);
          console.log("🔍 Problematic line:", line.substring(0, 100) + "...");
        }
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
    resolve();
  });

  response.data.on("end", async () => {
    clearTimeout(streamTimeout);
    
    // Process any remaining data in buffer
    if (dataBuffer.trim()) {
      const lines = dataBuffer.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:') && line.includes('"eventType":"metricsLog"')) {
          try {
            const jsonStr = line.replace(/^data:/, '').trim();
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.publicMetrics && allMetrics.length === 0) {
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
    }
    
    console.log(`\n\n✅ Completed: ${test.name}`);

    // webhook
    try {
      await axios.post(WEBHOOK_URL, {
        testName: test.name,
        sessionId,
        response: fullResponse,
        answer: finalAnswer,
        metrics: allMetrics
      });
      console.log("📤 Webhook sent");
    } catch (err) {
      console.error("⚠️ Webhook error:", err.message);
    }

    // Save metrics to CSV
    if (allMetrics.length > 0) {
      const safeName = test.name.replace(/[^\w\-]+/g, "_");

      const csv = new Parser().parse(
        allMetrics.map((m) => ({
          testName: test.name,
          timestamp: new Date().toISOString(),
          sessionId,
          answer: finalAnswer,
          ...m
        }))
      );

      const file = `metrics_${index + 1}_${safeName}.csv`;
      fs.writeFileSync(file, csv);
      console.log("📁 Saved metrics to:", file);
      console.log(`📝 Answer length: ${finalAnswer.length} characters`);
    } else {
      console.log("ℹ️ No metrics found for:", test.name);
    }

    resolve();
  });
});
  
}

// ---------------- TEST SUITE ----------------
async function runAllTests() {
  console.log("\n🎯 Starting Test Suite");
  console.log(`Company: ${COMPANY_ID}`);
  console.log(`Total Tests: ${TEST_CASES.length}`);

  for (let i = 0; i < TEST_CASES.length; i++) {
    await runTestCase(TEST_CASES[i], i);

    if (i < TEST_CASES.length - 1) {
      console.log("\n⏳ Waiting 2 sec...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n🎉 ALL TESTS COMPLETED\n");
}

module.exports = { runAllTests };
