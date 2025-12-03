
const { Parser } = require("json2csv");
const fs = require("fs");

// Mock data simulating the stream chunks
const mockChunks = [
    'data:{"answer":"Hello"}\n\n',
    'data:{"eventType":"metrics","payload":{"metricName":"response_time","value":123}}\n\n',
    'data:{"answer":" world"}\n\n',
    'data:{"eventType":"metrics","payload":{"metricName":"token_usage","value":50}}\n\n'
];

async function runTest() {
    let allMetrics = [];
    let fullResponse = "";

    console.log("Starting mock stream processing...");

    for (const chunk of mockChunks) {
        const text = chunk.toString();
        fullResponse += text;

        // The logic from test-run.js
        if (text.includes('"eventType":"metrics"')) {
            // Try greedy match, no 's' flag
            const metricMatches = [...text.matchAll(/data:(\{.*"eventType":"metrics".*\})/g)];

            for (const m of metricMatches) {
                fs.appendFileSync("debug_log.txt", "Matched string: " + m[1] + "\n");
                try {
                    const parsed = JSON.parse(m[1]);
                    allMetrics.push(parsed);
                    fs.appendFileSync("debug_log.txt", "📈 Metric received: " + parsed?.payload?.metricName + "\n");
                } catch (err) {
                    fs.appendFileSync("debug_log.txt", "⚠️ Metric parse error: " + err.message + "\n");
                }
            }
        }
    }

    console.log("Processing complete.");
    fs.appendFileSync("debug_log.txt", "Total metrics found: " + allMetrics.length + "\n");

    if (allMetrics.length > 0) {
        fs.appendFileSync("debug_log.txt", "Metrics captured: " + JSON.stringify(allMetrics, null, 2) + "\n");
    } else {
        fs.appendFileSync("debug_log.txt", "❌ No metrics captured!\n");
    }
}

runTest();
