#!/usr/bin/env python3
"""
Enhanced System Resource Monitor with qmassa GPU Support
Monitors CPU, Memory, and GPU utilization using qmassa for comprehensive GPU stats.
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


def get_process_by_name(process_name):
    """Finds a running process by its name or command line."""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if process_name.lower() in proc.info['name'].lower():
                return proc
            if proc.info['cmdline'] and any(process_name in s for s in proc.info['cmdline']):
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None


def get_gpu_stats_qmassa(temp_file):
    """
    Capture a single snapshot of GPU stats using qmassa.

    Args:
        temp_file: Path to temporary JSON file for qmassa output

    Returns:
        dict with GPU metrics or None if capture failed
    """
    try:
        # Run qmassa for a single iteration and save to JSON
        result = subprocess.run(
            ["sudo", "-n", "qmassa", "-x", "-n", "1", "-t", temp_file],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            return None

        # Read and parse the JSON output
        if not os.path.exists(temp_file):
            return None

        with open(temp_file, 'r') as f:
            data = json.load(f)

        # Extract GPU stats from qmassa JSON
        gpu_stats = {}

        if 'iterations' in data and len(data['iterations']) > 0:
            latest = data['iterations'][-1]

            # Get device stats (first GPU)
            if 'devices' in latest and len(latest['devices']) > 0:
                device = latest['devices'][0]

                # Memory usage
                if 'memory' in device:
                    mem = device['memory']
                    if 'system' in mem:
                        gpu_stats['gpu_system_mem_used_mb'] = mem['system'].get('used', 0) / (1024 * 1024)
                        gpu_stats['gpu_system_mem_total_mb'] = mem['system'].get('total', 0) / (1024 * 1024)
                    if 'device' in mem:
                        gpu_stats['gpu_vram_used_mb'] = mem['device'].get('used', 0) / (1024 * 1024)
                        gpu_stats['gpu_vram_total_mb'] = mem['device'].get('total', 0) / (1024 * 1024)

                # Engine utilization (sum all engines)
                if 'engines' in device:
                    total_util = 0
                    engine_count = 0
                    for engine_name, engine_data in device['engines'].items():
                        if isinstance(engine_data, dict) and 'busy' in engine_data:
                            total_util += engine_data['busy']
                            engine_count += 1
                            # Also store individual engine stats
                            clean_name = engine_name.replace('/', '_').lower()
                            gpu_stats[f'gpu_engine_{clean_name}_percent'] = engine_data['busy']

                    if engine_count > 0:
                        gpu_stats['gpu_total_utilization_percent'] = total_util / engine_count
                    else:
                        gpu_stats['gpu_total_utilization_percent'] = 0.0

                # Frequency
                if 'frequencies' in device:
                    freq = device['frequencies']
                    if isinstance(freq, dict):
                        gpu_stats['gpu_freq_actual_mhz'] = freq.get('actual', 0)
                        gpu_stats['gpu_freq_requested_mhz'] = freq.get('requested', 0)
                        gpu_stats['gpu_freq_max_mhz'] = freq.get('max', 0)

                # Power
                if 'power' in device:
                    pwr = device['power']
                    if isinstance(pwr, dict):
                        gpu_stats['gpu_power_watts'] = pwr.get('gpu', 0)
                        gpu_stats['gpu_package_power_watts'] = pwr.get('package', 0)

                # Temperature
                if 'temperature' in device:
                    temps = device['temperature']
                    if isinstance(temps, dict):
                        for temp_name, temp_val in temps.items():
                            clean_name = temp_name.replace('-', '_').lower()
                            gpu_stats[f'gpu_temp_{clean_name}_c'] = temp_val

        # Clean up temp file
        try:
            os.remove(temp_file)
        except:
            pass

        return gpu_stats if gpu_stats else None

    except (subprocess.TimeoutExpired, subprocess.SubprocessError, json.JSONDecodeError) as e:
        return None


def monitor(output_file="system_metrics.csv", interval=0.5, use_qmassa=True, run_id=""):
    """
    Monitors system-wide CPU, RAM, and GPU utilization.

    Args:
        output_file: CSV file path for output metrics
        interval: Sampling interval in seconds
        use_qmassa: Whether to use qmassa for GPU monitoring
        run_id: Optional run ID for tagging metrics in the output CSV
    """
    print(f"📊 Monitoring System-Wide Resources")
    if run_id:
        print(f"🆔 Run ID: {run_id}")

    # --- Check for GPU Monitor ---
    has_gpu_monitor = False
    gpu_temp_file = None

    if use_qmassa:
        qmassa_path = shutil.which("qmassa")
        if qmassa_path:
            print("✅ 'qmassa' found. Starting GPU monitoring with qmassa.")
            # Create temp file for qmassa JSON output
            gpu_temp_file = os.path.join(tempfile.gettempdir(), f"qmassa_monitor_{os.getpid()}.json")
            has_gpu_monitor = True
        else:
            print("⚠️ 'qmassa' not found. Install with: cargo install --locked qmassa")
            print("⚠️ Monitoring CPU/RAM only.")

    # --- Setup CSV Logging ---
    file_exists = os.path.isfile(output_file)

    # Determine CSV headers
    header = ["run_id", "timestamp", "cpu_percent", "memory_mb"]

    # We'll add GPU columns dynamically on first GPU stats capture
    gpu_columns_added = False
    all_gpu_keys = []

    try:
        with open(output_file, 'a', newline='') as f:
            writer = csv.writer(f)

            if not file_exists:
                writer.writerow(header)

            # Initialize CPU measurement (first call returns 0.0)
            psutil.cpu_percent(interval=None)

            print(f"📝 Logging to: {output_file}")
            print("Press Ctrl+C to stop monitoring\n")

            try:
                while True:
                    # 1. Get system-wide CPU and Memory usage
                    cpu_util = psutil.cpu_percent(interval=None)
                    mem = psutil.virtual_memory()
                    mem_mb = mem.used / (1024 * 1024)

                    row_data = [run_id, datetime.now().isoformat(), cpu_util, round(mem_mb, 2)]

                    # 2. Get GPU stats if qmassa is available
                    if has_gpu_monitor and gpu_temp_file:
                        gpu_stats = get_gpu_stats_qmassa(gpu_temp_file)

                        if gpu_stats:
                            # On first successful GPU capture, update CSV header
                            if not gpu_columns_added:
                                all_gpu_keys = sorted(gpu_stats.keys())
                                header.extend(all_gpu_keys)

                                # Rewrite header if file is new or recreate with new header
                                if file_exists:
                                    # File exists but we need to add GPU columns
                                    # Just add them to current header for new rows
                                    pass
                                else:
                                    # Rewrite header with GPU columns
                                    f.seek(0)
                                    writer.writerow(header)

                                gpu_columns_added = True

                            # Add GPU values in consistent order
                            for key in all_gpu_keys:
                                row_data.append(gpu_stats.get(key, 0.0))
                        else:
                            # No GPU stats, append zeros
                            if gpu_columns_added:
                                row_data.extend([0.0] * len(all_gpu_keys))

                    # 3. Write data to CSV
                    writer.writerow(row_data)
                    f.flush()

                    # Sleep to maintain the desired interval
                    time.sleep(interval)

            except KeyboardInterrupt:
                print("\n✅ Monitoring stopped by user.")

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
        description="Monitor system-wide CPU, RAM, and GPU (via qmassa).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Monitor system with qmassa GPU support
  python3 monitor_linux_backup.py --out system_metrics.csv

  # Monitor with custom interval
  python3 monitor_linux_backup.py --interval 1.0

  # Without GPU monitoring
  python3 monitor_linux_backup.py --no-gpu

  # With run ID for tagging
  python3 monitor_linux_backup.py --run-id my_test_run
        """
    )
    parser.add_argument(
        "--out",
        default="system_metrics.csv",
        help="Output CSV file name (default: system_metrics.csv)"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.5,
        help="Monitoring interval in seconds (default: 0.5)"
    )
    parser.add_argument(
        "--no-gpu",
        action="store_true",
        help="Disable GPU monitoring (CPU/RAM only)"
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default="",
        help="Run ID for tagging metrics in the output CSV"
    )

    args = parser.parse_args()

    use_qmassa = not args.no_gpu
    exit_code = monitor(output_file=args.out, interval=args.interval, use_qmassa=use_qmassa, run_id=args.run_id)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
