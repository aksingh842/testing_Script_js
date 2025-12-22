# AI Model Load Testing Suite with GPU Monitoring

Production-ready load testing for AI models with comprehensive system resource monitoring. Tracks API performance, token usage (RAG + fulfillment), plugin latencies, and real-time CPU/memory/GPU metrics.

## Features

- 🚀 **Stream-based API testing** - Real-time response capture with automatic token refresh
- 📊 **Detailed Token Tracking** - Separate RAG and fulfillment token metrics via API
- ⚡ **Plugin Latency Analysis** - Individual plugin execution timing
- 🖥️ **System Monitoring** - CPU, memory, and comprehensive GPU stats
- 📈 **High-Resolution Metrics** - 5s sampling intervals for granular performance data
- 📤 **Webhook Integration** - Automated results delivery
- 📁 **CSV Export** - Easy analysis with Excel/Pandas/R
- 🎯 **Cross-Platform** - Windows (HWiNFO) and Linux (qmassa) support

## Requirements

### System Requirements

**Windows:**
- **OS**: Windows 10/11
- **GPU Monitoring**: HWiNFO64 (free version works)
- **Privileges**: Administrator (for shared memory access)

**Linux:**
- **OS**: Bare metal Linux (Ubuntu 22.04+, Fedora, Arch, etc.)
- **Kernel**: 6.8+ recommended for full GPU stats
- **GPU**: Intel (xe/i915 driver) or AMD (amdgpu driver)
- **Not compatible**: WSL2, macOS, VMs without GPU passthrough

### Software Requirements
- **Node.js**: 16+
- **Python**: 3.8+
- **Rust**: Latest stable (for qmassa - Linux only)
- **HWiNFO64**: Latest version (Windows only)

## Installation

### 1. Clone Repository
```bash
git clone <your-repo-url>
cd testing_Script_js
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Install Python Dependencies
```bash
# Create virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install psutil
pip install -r requirements.txt
```

### 4. Install GPU Monitoring

Choose the appropriate method based on your operating system:

---

## Windows: HWiNFO Setup

### Step 4.1: Download and Install HWiNFO

1. Download HWiNFO64 from: https://www.hwinfo.com/download/
2. Install or run the portable version
3. Choose **"Sensors-only"** mode when prompted (this is important!)

### Step 4.2: Enable Shared Memory Support

1. Open **HWiNFO64**
2. When prompted, select **"Sensors-only"** mode
3. Click the **Settings** button (gear icon) in the sensors window
4. Go to the **"General / User Interface"** tab
5. Check the box **"Shared Memory Support"**
6. Click **OK**

> **Note:** In the free version, Shared Memory Support will disable itself after 12 hours. You'll need to re-enable it manually or restart HWiNFO when that happens.

### Step 4.3: Verify Sensors Window is Open

- The **Sensors window must be open** for data to be available
- You should see real-time hardware metrics (CPU temp, GPU usage, etc.)
- Keep this window open while running tests

### Step 4.4: Configure Environment for Windows

Add to your `.env` file:
```env
MODEL_TYPE=onprem
HWINFO_LOG_FILE=c:\Users\YourName\Downloads\ondemand\hwinfo_log.csv
```

### Step 4.5: Run as Administrator

**Important:** You must run from an Administrator PowerShell:

```powershell
# Right-click PowerShell → "Run as administrator"
cd c:\Users\YourName\Downloads\ondemand
node index.js
```

---

## Linux: qmassa Setup

**Step 4.1: Install Rust**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
cargo --version  # Verify installation
```

**Step 4.2: Install System Dependencies**

*For Debian/Ubuntu:*
```bash
sudo apt-get update
sudo apt-get install -y pkg-config libudev-dev
```

*For Fedora/RHEL:*
```bash
sudo dnf install -y pkg-config systemd-devel
```

*For Arch:*
```bash
sudo pacman -S pkg-config systemd
```

**Step 4.3: Install qmassa**
```bash
# Takes ~5 minutes to compile
cargo install --locked qmassa

# Verify
$HOME/.cargo/bin/qmassa --version
```

**Step 4.4: Configure System Access**
```bash
# Add user to GPU groups (some may not exist - that's OK)
sudo usermod -aG video,render,power $USER

# Create system symlink
sudo ln -s $HOME/.cargo/bin/qmassa /usr/local/bin/qmassa

# Enable passwordless sudo
echo "$USER ALL=(ALL) NOPASSWD: /usr/local/bin/qmassa" | sudo tee /etc/sudoers.d/qmassa
sudo chmod 0440 /etc/sudoers.d/qmassa
```

**Step 4.5: Apply Changes**
```bash
# IMPORTANT: Log out and log back in
# Or run: newgrp video
```

**Step 4.6: Verify Installation**
```bash
# Check GPU driver
lspci -k | grep -A 3 -E "VGA|3D"
# Should show: "Kernel driver in use: xe" or "i915" or "amdgpu"

# Test qmassa
sudo qmassa -n 1
# Should display GPU stats
```

### 5. Configure Environment
```bash
cp .env.example .env
nano .env
```

**Required settings:**
```env
ACCESS_TOKEN=your_access_token_here
REFRESH_TOKEN=your_refresh_token_here
COMPANY_ID=your_company_id_here
WEBHOOK_URL=your_webhook_url_here

# Enable monitoring
MODEL_TYPE=onprem
MODEL_PROCESS_NAME=python
```

### 6. Configure Test Cases
Edit `test-run.js` to define your test scenarios:
```javascript
const TEST_CASES = [
  {
    name: "Test Name",
    query: "Your AI query here",
    plugins: ["plugin-id-1", "plugin-id-2"]
  }
];
```

## Usage

### Run Tests
```bash
# Option 1: Via Express server (recommended)
node index.js
# Server starts at http://localhost:3000
# Tests run automatically

# Option 2: Direct execution
node -e "require('./test-run').runAllTests()"
```

### What Happens
1. ✅ System monitoring starts (CPU/Memory/GPU)
2. ✅ Tests execute sequentially with 2s delays
3. ✅ Metrics collected in real-time
4. ✅ Results saved to CSVs
5. ✅ Monitoring stops automatically

## Output Files

### `result.csv` - Test Results
Contains per-test execution metrics:

| Column | Description |
|--------|-------------|
| `testName` | Test identifier |
| `timestamp` | ISO 8601 timestamp |
| `sessionId` | Unique session ID |
| `messageId` | Message identifier |
| `answer` | Model response text |
| **RAG Metrics** | |
| `rag_inputTokens` | RAG input tokens |
| `rag_outputTokens` | RAG output tokens |
| `rag_totalTokens` | RAG total tokens |
| `rag_totalTimeSec` | RAG execution time (includes plugins) |
| `rag_endpointId` | RAG model endpoint |
| `rag_reasoningMode` | RAG reasoning mode |
| **Fulfillment Metrics** | |
| `fulfillment_inputTokens` | Fulfillment input tokens |
| `fulfillment_outputTokens` | Fulfillment output tokens |
| `fulfillment_totalTokens` | Fulfillment total tokens |
| `fulfillment_totalTimeSec` | Fulfillment execution time |
| `fulfillment_endpointId` | Fulfillment model endpoint |
| **Combined Metrics** | |
| `total_inputTokens` | RAG + Fulfillment input |
| `total_outputTokens` | RAG + Fulfillment output |
| `total_tokens` | All tokens combined |
| `total_time_sec` | Total time (RAG + Fulfillment + Plugins) |
| **Plugin Metrics** | |
| `total_plugin_latency_s` | Sum of all plugin execution times |
| `corrected_rag_time_s` | RAG time minus plugin latency |
| `plugin_N_id` | Plugin ID |
| `plugin_N_latency_s` | Plugin execution time |
| `plugin_N_success` | Plugin success status |
| `plugin_N_stage` | Plugin execution stage |

### `system_metrics.csv` - System Resources
Contains high-resolution system metrics (0.5s intervals):

| Column | Description |
|--------|-------------|
| `timestamp` | ISO 8601 timestamp |
| `cpu_percent` | Process CPU utilization |
| `memory_mb` | Process memory usage (MB) |
| **GPU Metrics (via qmassa)** | |
| `gpu_system_mem_used_mb` | GPU system memory used |
| `gpu_system_mem_total_mb` | GPU system memory total |
| `gpu_vram_used_mb` | VRAM used (discrete GPUs) |
| `gpu_vram_total_mb` | VRAM total (discrete GPUs) |
| `gpu_total_utilization_percent` | Overall GPU utilization |
| `gpu_engine_render_3d_percent` | Render engine utilization |
| `gpu_engine_video_percent` | Video engine utilization |
| `gpu_engine_compute_percent` | Compute engine utilization |
| `gpu_freq_actual_mhz` | Actual GPU frequency |
| `gpu_freq_requested_mhz` | Requested GPU frequency |
| `gpu_freq_max_mhz` | Maximum GPU frequency |
| `gpu_power_watts` | GPU power consumption |
| `gpu_package_power_watts` | Package power consumption |
| `gpu_temp_*_c` | Various temperature sensors |

## Configuration Options

### Monitoring Modes

**On-Premises Mode (Full Monitoring):**
```env
MODEL_TYPE=onprem
MODEL_PROCESS_NAME=python  # Your model process
```

**API Mode (No Monitoring):**
```env
MODEL_TYPE=api
```

### Find Your Process Name
```bash
ps aux | grep python
ps aux | grep uvicorn
# Use the process name or PID in MODEL_PROCESS_NAME
```

### Adjust Monitoring Interval
Edit `test-run.js` line ~800:
```javascript
"--interval",
"0.5"  // Change to 1.0 for less frequent sampling
```

## Data Analysis Examples

### Merge CSVs by Timestamp
```python
import pandas as pd

results = pd.read_csv('result.csv')
system = pd.read_csv('system_metrics.csv')

results['timestamp'] = pd.to_datetime(results['timestamp'])
system['timestamp'] = pd.to_datetime(system['timestamp'])

merged = pd.merge_asof(
    results.sort_values('timestamp'),
    system.sort_values('timestamp'),
    on='timestamp',
    direction='nearest'
)

print(merged[['testName', 'total_time_sec', 'cpu_percent', 'gpu_total_utilization_percent']])
```

### Calculate Token Costs
```python
# Assuming pricing per 1K tokens
RAG_INPUT_COST = 0.003
RAG_OUTPUT_COST = 0.015
FULFILL_INPUT_COST = 0.001
FULFILL_OUTPUT_COST = 0.002

results['rag_cost'] = (
    (results['rag_inputTokens'] / 1000 * RAG_INPUT_COST) +
    (results['rag_outputTokens'] / 1000 * RAG_OUTPUT_COST)
)

results['fulfillment_cost'] = (
    (results['fulfillment_inputTokens'] / 1000 * FULFILL_INPUT_COST) +
    (results['fulfillment_outputTokens'] / 1000 * FULFILL_OUTPUT_COST)
)

results['total_cost'] = results['rag_cost'] + results['fulfillment_cost']

print(results[['testName', 'rag_cost', 'fulfillment_cost', 'total_cost']])
```

## Troubleshooting

### HWiNFO Issues (Windows)

**"Error reading HWiNFO. Is it running?"**
- Ensure HWiNFO64 is running in **Sensors-only** mode
- Check that **Shared Memory Support** is enabled in Settings
- The Sensors window must be **open** (not minimized to tray only)

**"Access denied" or no data captured**
- Run PowerShell as **Administrator** (right-click → Run as administrator)
- HWiNFO shared memory requires elevated privileges

**Shared Memory Support keeps disabling**
- This is normal in the free version (12-hour limit)
- Re-enable it in Settings → General / User Interface → Shared Memory Support
- Or restart HWiNFO to reset the timer

**Missing metrics in CSV**
- Check `TARGET_KEYWORDS` in `monitor.py` matches your sensor names
- Open HWiNFO sensors window to see available sensor names
- Add missing keywords to the filter list

---

### qmassa Issues (Linux)

**"No DRM devices found"**
- Running on WSL2/VM: qmassa requires bare metal Linux
- Check: `ls -la /dev/dri/` (should show card0, renderD128, etc.)
- Verify driver: `lsmod | grep -E "xe|i915|amdgpu"`

**"command not found" with sudo**
- Create symlink: `sudo ln -s $HOME/.cargo/bin/qmassa /usr/local/bin/qmassa`
- Or use full path: `sudo $HOME/.cargo/bin/qmassa -n 1`

**"Permission denied"**
- Add to groups: `sudo usermod -aG video,render $USER`
- Log out and back in
- Verify: `groups` (should include video, render)

**"group 'power' does not exist"**
- This is normal and OK - power group is optional

### Python Issues

**"ModuleNotFoundError: No module named 'psutil'"**
- Activate venv: `source .venv/bin/activate`
- Install: `pip install -r requirements.txt`

**"Process not found"**
- Find process: `ps aux | grep your_model_name`
- Update `MODEL_PROCESS_NAME` in `.env`

### API Issues

**Token refresh fails**
- Verify `ACCESS_TOKEN` and `REFRESH_TOKEN` in `.env`
- Check token hasn't expired permanently

## Platform Support

| Platform | Support | Monitor | Notes |
|----------|---------|---------|-------|
| **Windows 10/11** | ✅ Full | HWiNFO | Run as Administrator |
| Ubuntu 22.04+ | ✅ Full | qmassa | Recommended for Linux |
| Fedora 38+ | ✅ Full | qmassa | Fully tested |
| Arch Linux | ✅ Full | qmassa | Latest kernel recommended |
| **Intel Panther Lake** | ✅ Full | Both | xe driver (Linux), HWiNFO (Windows) |
| **Intel Arc** | ✅ Full | Both | xe driver (Linux), HWiNFO (Windows) |
| **Intel 11th Gen+** | ✅ Full | Both | i915 driver (Linux), HWiNFO (Windows) |
| **AMD GPUs** | ✅ Full | Both | amdgpu driver (Linux), HWiNFO (Windows) |
| **NVIDIA GPUs** | ✅ Full | HWiNFO | Windows only via HWiNFO |
| WSL2 | ⚠️ Partial | None | No GPU monitoring, API mode only |
| macOS | ❌ No | None | Not supported |

## Project Structure
```
testing_Script_js/
├── index.js                    # Express server
├── test-run.js                 # Test suite with RAG/fulfillment tracking
├── monitor.py                  # Windows monitor (HWiNFO shared memory)
├── monitor_linux_backup.py     # Linux monitor (psutil + qmassa)
├── requirements.txt            # Python deps (psutil, python-dotenv)
├── package.json                # Node.js deps
├── .env                        # Configuration (create from .env.example)
├── .env.example                # Configuration template
├── result.csv                  # Test results (output)
├── system_metrics.csv          # Linux system metrics (output)
├── hwinfo_log.csv              # Windows HWiNFO metrics (output)
└── Readme.md                   # This file
```

## API Endpoints

### `GET /`
Health check
- **Response**: `{ message: "test script is running" }`

### `POST /run-test`
Execute full test suite
- **Response**: `{ message: "Test script executed successfully", data: results }`

## Performance Tips

- **Monitoring Overhead**: qmassa adds <1% CPU overhead
- **Sampling Rate**: 0.5s provides good balance (change to 1.0s if needed)
- **Test Delays**: 2s between tests allows system stabilization
- **CSV Size**: ~1 row per 0.5s per test, plan storage accordingly

## Development vs Production

**Development (WSL2/No GPU monitoring):**
```env
MODEL_TYPE=api  # Skip monitoring
```

**Production (Windows with HWiNFO):**
```env
MODEL_TYPE=onprem
HWINFO_LOG_FILE=c:\path\to\hwinfo_log.csv
```
Run PowerShell as Administrator with HWiNFO sensors open.

**Production (Bare Metal Linux with qmassa):**
```env
MODEL_TYPE=onprem
MODEL_PROCESS_NAME=python
```
Ensure qmassa is installed and configured.

## Contributing
1. Fork the repository
2. Create feature branch: `git checkout -b feat/description`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feat/description`
5. Open Pull Request

## License
[Specify your license]

## Support
- Check GPU compatibility: https://github.com/ulissesf/qmassa
- Report issues: [Your issue tracker]
- Documentation: This README

---

**Ready to run?** Just execute `node index.js` after installation! 🚀
