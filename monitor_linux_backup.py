#!/usr/bin/env python3
"""
Enhanced System Resource Monitor with qmassa GPU Support
Monitors CPU, Memory, Battery, and GPU (via qmassa) for comprehensive system stats.

GPU metrics from qmassa include:
- Memory (System/VRAM)
- Engine utilization
- Frequencies (actual/requested/max)
- Power (GPU/Package)
- Temperature
- Fan speeds
"""

import psutil
import time
import argparse
import csv
from datetime import datetime
import os
import subprocess
import json
import shutil
import sys
import tempfile


def get_gpu_stats_qmassa(temp_file):
    """
    Capture a single snapshot of GPU stats using qmassa.

    Uses: sudo qmassa -x -n 1 -t <file>
    - -x: No TUI (headless mode)
    - -n 1: Single iteration
    - -t <file>: Save to JSON file

    Returns:
        tuple: (dict with GPU metrics, error_message or None)
    """
    try:
        # Build command - use sudo only if not already root
        # Use -n 2 (2 iterations) so qmassa can calculate engine utilization delta
        if os.geteuid() == 0:
            cmd = ["qmassa", "-x", "-n", "2", "-m", "500", "-t", temp_file]
        else:
            cmd = ["sudo", "-n", "qmassa", "-x", "-n", "2", "-m", "500", "-t", temp_file]

        # Run qmassa for a single iteration and save to JSON
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else f"Exit code {result.returncode}"
            return None, error_msg

        # Read and parse the JSON output
        if not os.path.exists(temp_file):
            return None, "qmassa did not create output file"

        # qmassa outputs NDJSON (one JSON object per line)
        # Line 1: version string, Line 2: config, Line 3: actual data with devs_state
        with open(temp_file, 'r') as f:
            lines = f.readlines()

        data = None
        for line in reversed(lines):
            line = line.strip()
            if line and line.startswith('{'):
                try:
                    parsed = json.loads(line)
                    # Look for the line with devs_state (actual GPU data)
                    if 'devs_state' in parsed:
                        data = parsed
                        break
                except json.JSONDecodeError:
                    continue

        if not data:
            return None, "No valid GPU data in qmassa output"

        # Extract GPU stats from qmassa JSON
        gpu_stats = {}

        # Get device stats from devs_state array
        devs_state = data.get('devs_state', [])
        if not devs_state or len(devs_state) == 0:
            return None, "No devices in qmassa output"

        device = devs_state[0]

        # Device info
        if 'drv_name' in device:
            gpu_stats['gpu_driver'] = device['drv_name']
        if 'dev_type' in device:
            gpu_stats['gpu_type'] = device['dev_type']
        if 'vdr_dev' in device:
            gpu_stats['gpu_name'] = device['vdr_dev']

        # Get dev_stats which contains the actual metrics
        dev_stats = device.get('dev_stats', {})

        # Memory usage (values in bytes, convert to MB)
        mem_info = dev_stats.get('mem_info', [])
        if mem_info and len(mem_info) > 0:
            mem = mem_info[0]  # Get latest/first entry
            smem_total = mem.get('smem_total', 0)
            smem_used = mem.get('smem_used', 0)
            vram_total = mem.get('vram_total', 0)
            vram_used = mem.get('vram_used', 0)

            if smem_total or smem_used:
                gpu_stats['gpu_smem_used_mb'] = round(smem_used / (1024 * 1024), 2)
                gpu_stats['gpu_smem_total_mb'] = round(smem_total / (1024 * 1024), 2)
            if vram_total or vram_used:
                gpu_stats['gpu_vram_used_mb'] = round(vram_used / (1024 * 1024), 2)
                gpu_stats['gpu_vram_total_mb'] = round(vram_total / (1024 * 1024), 2)

        # Engine utilization (eng_usage is dict with engine names as keys, values are arrays)
        eng_usage = dev_stats.get('eng_usage', {})
        if eng_usage:
            total_util = 0
            engine_count = 0
            for engine_name, usage_array in eng_usage.items():
                if isinstance(usage_array, list) and len(usage_array) > 0:
                    usage = usage_array[0]  # Get latest value
                    if isinstance(usage, (int, float)):
                        total_util += usage
                        engine_count += 1
                        clean_name = engine_name.replace('/', '_').replace('-', '_').replace(' ', '_').lower()
                        gpu_stats[f'gpu_engine_{clean_name}_pct'] = round(usage, 2)

            if engine_count > 0:
                gpu_stats['gpu_engines_avg_pct'] = round(total_util / engine_count, 2)

        # Frequency (freqs is nested array: freqs[timestamp_idx][gt_idx])
        freqs = dev_stats.get('freqs', [])
        if freqs and len(freqs) > 0:
            freq_list = freqs[0]  # Get latest timestamp
            if freq_list and len(freq_list) > 0:
                freq = freq_list[0]  # Get first GT (usually main GPU)
                if isinstance(freq, dict):
                    if 'act_freq' in freq:
                        gpu_stats['gpu_freq_actual_mhz'] = freq['act_freq']
                    if 'cur_freq' in freq:
                        gpu_stats['gpu_freq_requested_mhz'] = freq['cur_freq']
                    if 'max_freq' in freq:
                        gpu_stats['gpu_freq_max_mhz'] = freq['max_freq']
                    if 'min_freq' in freq:
                        gpu_stats['gpu_freq_min_mhz'] = freq['min_freq']

        # Power (power is array of dicts)
        power = dev_stats.get('power', [])
        if power and len(power) > 0:
            pwr = power[0]  # Get latest
            if isinstance(pwr, dict):
                if 'gpu_cur_power' in pwr:
                    gpu_stats['gpu_power_w'] = round(pwr['gpu_cur_power'], 2)
                if 'pkg_cur_power' in pwr:
                    gpu_stats['gpu_package_power_w'] = round(pwr['pkg_cur_power'], 2)

        # Temperature (temps is array)
        temps = dev_stats.get('temps', [])
        if temps and len(temps) > 0:
            for i, temp_val in enumerate(temps):
                if isinstance(temp_val, (int, float)):
                    gpu_stats[f'gpu_temp_{i}_c'] = round(temp_val, 1)

        # Fan speeds (fans is array)
        fans = dev_stats.get('fans', [])
        if fans and len(fans) > 0:
            for i, fan_val in enumerate(fans):
                if isinstance(fan_val, (int, float)):
                    gpu_stats[f'gpu_fan_{i}_rpm'] = int(fan_val)

        # Clean up temp file
        try:
            os.remove(temp_file)
        except:
            pass

        return gpu_stats if gpu_stats else None, None

    except subprocess.TimeoutExpired:
        return None, "qmassa timed out"
    except json.JSONDecodeError as e:
        return None, f"Failed to parse qmassa JSON: {e}"
    except Exception as e:
        return None, str(e)


def get_battery_stats():
    """Get battery metrics using psutil."""
    stats = {}
    try:
        battery = psutil.sensors_battery()
        if battery:
            stats['battery_percent'] = round(battery.percent, 1)
            stats['battery_plugged'] = 1 if battery.power_plugged else 0
            if battery.secsleft and battery.secsleft != psutil.POWER_TIME_UNLIMITED and battery.secsleft > 0:
                stats['battery_mins_left'] = round(battery.secsleft / 60, 1)
    except Exception:
        pass
    return stats


def get_cpu_temperature():
    """Get CPU temperature using psutil."""
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            # Try common CPU temperature sensor names
            for name in ['coretemp', 'k10temp', 'cpu_thermal', 'acpitz']:
                if name in temps:
                    entries = temps[name]
                    if entries:
                        # Get the highest/package temperature
                        max_temp = max(e.current for e in entries)
                        return round(max_temp, 1)
    except Exception:
        pass
    return None


def monitor(output_file="system_metrics.csv", interval=0.5, use_qmassa=True, run_id=""):
    """
    Monitors system-wide CPU, RAM, GPU, and battery.

    Args:
        output_file: CSV file path for output metrics
        interval: Sampling interval in seconds
        use_qmassa: Whether to use qmassa for GPU monitoring
        run_id: Optional run ID for tagging metrics in the output CSV
    """
    print("=" * 60)
    print("📊 System Resource Monitor")
    print("=" * 60)
    if run_id:
        print(f"🆔 Run ID: {run_id}")

    # --- Check for GPU Monitor (qmassa) ---
    has_gpu_monitor = False
    gpu_temp_file = None
    qmassa_error_shown = False

    if use_qmassa:
        qmassa_path = shutil.which("qmassa")
        if qmassa_path:
            print(f"✅ qmassa found at: {qmassa_path}")
            # Check if running as root or have sudo access
            is_root = os.geteuid() == 0
            if is_root:
                print("✅ Running as root - full GPU access")
                gpu_temp_file = os.path.join(tempfile.gettempdir(), f"qmassa_{os.getpid()}.json")
                has_gpu_monitor = True
            else:
                # Check if we can run with sudo -n (non-interactive)
                sudo_check = subprocess.run(
                    ["sudo", "-n", "true"],
                    capture_output=True
                )
                if sudo_check.returncode == 0:
                    print("✅ sudo access available (passwordless)")
                    gpu_temp_file = os.path.join(tempfile.gettempdir(), f"qmassa_{os.getpid()}.json")
                    has_gpu_monitor = True
                else:
                    print("⚠️  sudo requires password - run with: sudo python3 monitor_linux_backup.py")
                    print("⚠️  Or configure passwordless sudo for qmassa")
                    print("⚠️  GPU monitoring disabled")
        else:
            print("⚠️  qmassa not found")
            print("   Install with: cargo install --locked qmassa")
            print("⚠️  GPU monitoring disabled")
    else:
        print("ℹ️  GPU monitoring disabled (--no-gpu)")

    # Check battery
    battery_stats = get_battery_stats()
    if battery_stats:
        print(f"🔋 Battery detected: {battery_stats.get('battery_percent', 'N/A')}%")
    else:
        print("ℹ️  No battery detected")

    # Check CPU temperature
    cpu_temp = get_cpu_temperature()
    if cpu_temp:
        print(f"🌡️  CPU temperature sensor available")

    print(f"📝 Output file: {output_file}")
    print(f"⏱️  Interval: {interval}s")
    print("=" * 60)
    print("Press Ctrl+C to stop monitoring\n")

    # --- CSV Setup ---
    # We'll write header on first row with all discovered columns
    first_row = True
    all_columns = []

    try:
        # Initialize CPU measurement (first call returns 0.0)
        psutil.cpu_percent(interval=None)

        while True:
            row = {}

            # Basic info
            row['run_id'] = run_id
            row['timestamp'] = datetime.now().isoformat()

            # CPU
            row['cpu_percent'] = psutil.cpu_percent(interval=None)

            # Memory
            mem = psutil.virtual_memory()
            row['memory_used_mb'] = round(mem.used / (1024 * 1024), 2)
            row['memory_total_mb'] = round(mem.total / (1024 * 1024), 2)
            row['memory_percent'] = mem.percent

            # CPU Temperature
            cpu_temp = get_cpu_temperature()
            if cpu_temp:
                row['cpu_temp_c'] = cpu_temp

            # Battery
            battery = get_battery_stats()
            row.update(battery)

            # GPU stats via qmassa
            if has_gpu_monitor and gpu_temp_file:
                gpu_stats, gpu_error = get_gpu_stats_qmassa(gpu_temp_file)
                if gpu_stats:
                    row.update(gpu_stats)
                    qmassa_error_shown = False
                elif gpu_error and not qmassa_error_shown:
                    print(f"⚠️  qmassa error: {gpu_error}")
                    qmassa_error_shown = True

            # Write to CSV
            if first_row:
                all_columns = list(row.keys())
                with open(output_file, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=all_columns)
                    writer.writeheader()
                    writer.writerow(row)
                first_row = False
            else:
                # Append row, handling new columns gracefully
                current_keys = set(row.keys())
                new_keys = current_keys - set(all_columns)
                if new_keys:
                    all_columns.extend(sorted(new_keys))
                    # Rewrite file with new columns (for simplicity, append anyway)

                with open(output_file, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=all_columns, extrasaction='ignore')
                    writer.writerow(row)

            # Console output (condensed)
            gpu_info = ""
            if 'gpu_power_w' in row:
                gpu_info = f" | GPU: {row.get('gpu_power_w', 0)}W"
            if 'gpu_engines_avg_pct' in row:
                gpu_info += f" {row.get('gpu_engines_avg_pct', 0)}%"

            bat_info = ""
            if 'battery_percent' in row:
                plug = "⚡" if row.get('battery_plugged') else "🔋"
                bat_info = f" | {plug} {row['battery_percent']}%"

            temp_info = ""
            if 'cpu_temp_c' in row:
                temp_info = f" | 🌡️ {row['cpu_temp_c']}°C"

            print(f"[{row['timestamp'][11:19]}] CPU: {row['cpu_percent']:5.1f}% | RAM: {row['memory_percent']:5.1f}%{temp_info}{gpu_info}{bat_info}")

            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n✅ Monitoring stopped")
        print(f"📁 Data saved to: {output_file}")

    except IOError as e:
        print(f"❌ Error writing to {output_file}: {e}", file=sys.stderr)
        return 1

    finally:
        # Clean up temp file
        if gpu_temp_file and os.path.exists(gpu_temp_file):
            try:
                os.remove(gpu_temp_file)
            except:
                pass

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Monitor system-wide CPU, RAM, Battery, and GPU (via qmassa).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
GPU metrics (via qmassa):
  - Memory: System memory (SMEM) and Video RAM (VRAM)
  - Engines: Per-engine and average utilization
  - Frequencies: Actual, requested, min, max (MHz)
  - Power: GPU and package power (Watts)
  - Temperature: GPU temperatures (Celsius)
  - Fans: Fan speeds (RPM)

Examples:
  # Basic monitoring
  python3 monitor_linux_backup.py

  # With run ID for tagging
  python3 monitor_linux_backup.py --run-id my_test_run

  # Custom interval (1 second)
  python3 monitor_linux_backup.py --interval 1.0

  # Without GPU monitoring
  python3 monitor_linux_backup.py --no-gpu

Note: Run as root or with passwordless sudo for full GPU stats:
  sudo python3 monitor_linux_backup.py --run-id test
        """
    )
    parser.add_argument(
        "--out",
        default="system_metrics.csv",
        help="Output CSV file (default: system_metrics.csv)"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.5,
        help="Sampling interval in seconds (default: 0.5)"
    )
    parser.add_argument(
        "--no-gpu",
        action="store_true",
        help="Disable GPU monitoring via qmassa"
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default="",
        help="Run ID for tagging metrics in CSV"
    )

    args = parser.parse_args()

    use_qmassa = not args.no_gpu
    exit_code = monitor(
        output_file=args.out,
        interval=args.interval,
        use_qmassa=use_qmassa,
        run_id=args.run_id
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
