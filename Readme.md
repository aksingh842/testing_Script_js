# AI Model Load Testing Suite

## Purpose
Comprehensive load testing suite for AI chat models with integrated system resource monitoring. Tests API endpoints with multiple plugin combinations while optionally tracking CPU, memory, and Intel iGPU utilization for on-premises deployments.

## Features
- Stream-based API testing with real-time response capture
- Automatic token refresh handling
- Plugin execution latency tracking
- Webhook integration for test results
- CSV export for metrics analysis
- **Conditional system monitoring** (CPU, memory, iGPU) for on-premises models
- Support for both API-based and locally-hosted models

## Quick Start

### 1. Clone the Repository
```bash
git clone <repo-url>
cd testing_Script_js
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Install Python Dependencies (for monitoring)
If you plan to monitor on-premises models:
```bash
# Activate your virtual environment if using one
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env` and update the values:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
ACCESS_TOKEN=your_access_token
REFRESH_TOKEN=your_refresh_token
COMPANY_ID=your_company_id
WEBHOOK_URL=your_webhook_url

# Model Monitoring Configuration
MODEL_TYPE=onprem          # Set to "onprem" or "api"
MODEL_PROCESS_NAME=python  # Process name to monitor (if onprem)
```

### 5. Configure Test Cases
Edit `test-run.js` to define your test cases with queries and plugin combinations.

### 6. Run Tests
```bash
# Start the Express server
node index.js

# In another terminal, trigger the tests
curl -X POST http://localhost:3000/run-test
```

Or run directly:
```bash
node -e "require('./test-run').runAllTests()"
```

## Configuration Options

### Model Type Configuration

#### API Mode (No Monitoring)
Set `MODEL_TYPE=api` in `.env` to skip system monitoring:
```env
MODEL_TYPE=api
```

#### On-Premises Mode (With Monitoring)
Set `MODEL_TYPE=onprem` to enable CPU, memory, and iGPU tracking:
```env
MODEL_TYPE=onprem
MODEL_PROCESS_NAME=python  # Or your model's process name
```

### Identifying Your Model Process
To find the correct process name to monitor:
```bash
ps aux | grep python
# Or for other processes
ps aux | grep uvicorn
ps aux | grep your_model_name
```

Use the process name or PID in `MODEL_PROCESS_NAME`.

## System Monitoring Setup

### Basic Monitoring (CPU + Memory)
Works out of the box once `psutil` is installed via `requirements.txt`.

### Intel iGPU Monitoring (Optional)
To enable integrated GPU tracking on Intel hardware:

1. Install `intel-gpu-tools`:
```bash
sudo apt-get update
sudo apt-get install intel-gpu-tools
```

2. Configure passwordless sudo for monitoring:
```bash
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/intel_gpu_top" | sudo tee -a /etc/sudoers
```

3. Verify installation:
```bash
sudo intel_gpu_top -J -s 500
```

## Output Files

### 1. `result.csv`
Contains test execution metrics:
- Test name and timestamp
- Session ID
- Input/output tokens
- Total execution time
- Plugin latencies (individual and total)
- Model response text

### 2. `system_metrics.csv`
(Generated only when `MODEL_TYPE=onprem`)

Contains system resource metrics sampled at 0.5-second intervals:
- Timestamp (ISO 8601 format)
- CPU utilization (percentage)
- Memory usage (MB)
- iGPU render utilization (percentage, if available)

### Example Data Analysis
Merge both CSV files using timestamps to correlate system load with specific test executions:
```python
import pandas as pd

# Load metrics
results = pd.read_csv('result.csv')
system = pd.read_csv('system_metrics.csv')

# Convert timestamps
results['timestamp'] = pd.to_datetime(results['timestamp'])
system['timestamp'] = pd.to_datetime(system['timestamp'])

# Merge on nearest timestamp
merged = pd.merge_asof(
    results.sort_values('timestamp'),
    system.sort_values('timestamp'),
    on='timestamp',
    direction='nearest'
)

print(merged[['testName', 'totalTimeSec', 'cpu_percent', 'memory_mb']])
```

## Project Structure
```
testing_Script_js/
├── index.js              # Express server entry point
├── test-run.js           # Core test suite logic
├── monitor.py            # Python system monitoring script
├── requirements.txt      # Python dependencies
├── package.json          # Node.js dependencies
├── .env                  # Environment configuration
├── .env.example          # Example environment file
├── result.csv            # Test execution metrics (output)
└── system_metrics.csv    # System resource metrics (output)
```

## API Endpoints

### `GET /`
Health check endpoint
- **Response**: `{ message: "test script is running" }`

### `POST /run-test`
Triggers the full test suite
- **Response**: `{ message: "Test script executed successfully", data: results }`

## Test Case Configuration

Each test case in `test-run.js` requires:
```javascript
{
  name: "Descriptive Test Name",
  query: "Natural language query for the AI model",
  plugins: [
    "plugin-id-1",  // Plugin IDs to enable
    "plugin-id-2"
  ]
}
```

## Troubleshooting

### Monitor Not Starting
**Error**: `ModuleNotFoundError: No module named 'psutil'`
- **Solution**: Install Python dependencies: `pip install -r requirements.txt`

### Process Not Found
**Error**: `Process 'python' not found`
- **Solution**:
  1. Find your model's actual process: `ps aux | grep your_model`
  2. Update `MODEL_PROCESS_NAME` in `.env` with the correct name or PID

### iGPU Monitoring Fails
**Error**: `intel_gpu_top` requires sudo password
- **Solution**: Configure passwordless sudo (see iGPU Monitoring Setup section)

### Token Expired Errors
The script automatically refreshes tokens when they expire. If refresh fails:
- Verify `ACCESS_TOKEN` and `REFRESH_TOKEN` in `.env` are valid
- Check token expiration times

## Performance Considerations

- **Monitoring Interval**: Default is 0.5 seconds. Adjust in `test-run.js` line 717:
  ```javascript
  "--interval",
  "0.5"  // Change to "1.0" for less frequent sampling
  ```

- **Test Delays**: 2-second delay between tests (line 741). Adjust as needed for your model's warm-up requirements.

## Contributing
1. Create a feature branch: `git checkout -b feat/short-description`
2. Make your changes and test thoroughly
3. Commit with clear messages
4. Open a pull request with detailed description

## License
[Add your license information here]
