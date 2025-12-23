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
        # Run qmassa for a single iteration and save to JSON
        result = subprocess.run(
            ["sudo", "-n", "qmassa", "-x", "-n", "1", "-t", temp_file],
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

        with open(temp_file, 'r') as f:
            data = json.load(f)

        # Extract GPU stats from qmassa JSON
        gpu_stats = {}

        if 'iterations' in data and len(data['iterations']) > 0:
            latest = data['iterations'][-1]

            # Get device stats (first GPU)
            if 'devices' in latest and len(latest['devices']) > 0:
                device = latest['devices'][0]

                # Device info
                if 'driver' in device:
                    gpu_stats['gpu_driver'] = device['driver']
                if 'type' in device:
                    gpu_stats['gpu_type'] = device['type']

                # Memory usage (values in bytes from qmassa, convert to MB)
                if 'memory' in device:
                    mem = device['memory']
                    if 'system' in mem and isinstance(mem['system'], dict):
                        used = mem['system'].get('used', 0)
                        total = mem['system'].get('total', 0)
                        if used or total:
                            gpu_stats['gpu_smem_used_mb'] = round(used / (1024 * 1024), 2)
                            gpu_stats['gpu_smem_total_mb'] = round(total / (1024 * 1024), 2)
                    if 'device' in mem and isinstance(mem['device'], dict):
                        used = mem['device'].get('used', 0)
                        total = mem['device'].get('total', 0)
                        if used or total:
                            gpu_stats['gpu_vram_used_mb'] = round(used / (1024 * 1024), 2)
                            gpu_stats['gpu_vram_total_mb'] = round(total / (1024 * 1024), 2)

                # Engine utilization
                if 'engines' in device and isinstance(device['engines'], dict):
                    total_util = 0
                    engine_count = 0
                    for engine_name, engine_data in device['engines'].items():
                        if isinstance(engine_data, dict) and 'busy' in engine_data:
                            busy = engine_data['busy']
                            total_util += busy
                            engine_count += 1
                            # Store individual engine stats
                            clean_name = engine_name.replace('/', '_').replace('-', '_').replace(' ', '_').lower()
                            gpu_stats[f'gpu_engine_{clean_name}_pct'] = round(busy, 2)

                    if engine_count > 0:
                        gpu_stats['gpu_engines_avg_pct'] = round(total_util / engine_count, 2)

                # Frequency (values in MHz)
                if 'frequencies' in device and isinstance(device['frequencies'], dict):
                    freq = device['frequencies']
                    if 'actual' in freq:
                        gpu_stats['gpu_freq_actual_mhz'] = freq['actual']
                    if 'requested' in freq:
                        gpu_stats['gpu_freq_requested_mhz'] = freq['requested']
                    if 'max' in freq:
                        gpu_stats['gpu_freq_max_mhz'] = freq['max']
                    if 'min' in freq:
                        gpu_stats['gpu_freq_min_mhz'] = freq['min']

                # Power (values in Watts)
                if 'power' in device and isinstance(device['power'], dict):
                    pwr = device['power']
                    if 'gpu' in pwr:
                        gpu_stats['gpu_power_w'] = round(pwr['gpu'], 2)
                    if 'package' in pwr:
                        gpu_stats['gpu_package_power_w'] = round(pwr['package'], 2)

                # Temperature (values in Celsius)
                if 'temperature' in device and isinstance(device['temperature'], dict):
                    for temp_name, temp_val in device['temperature'].items():
                        if isinstance(temp_val, (int, float)):
                            clean_name = temp_name.replace('-', '_').replace(' ', '_').lower()
                            gpu_stats[f'gpu_temp_{clean_name}_c'] = round(temp_val, 1)

                # Fan speeds (values in RPM)
                if 'fans' in device and isinstance(device['fans'], dict):
                    for fan_name, fan_val in device['fans'].items():
                        if isinstance(fan_val, (int, float)):
                            clean_name = fan_name.replace('-', '_').replace(' ', '_').lower()
                            gpu_stats[f'gpu_fan_{clean_name}_rpm'] = int(fan_val)

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
