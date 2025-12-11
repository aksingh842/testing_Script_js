#!/usr/bin/env python3
"""
System Resource Monitor for Model Performance Testing
Monitors CPU, Memory, and Intel iGPU utilization for a target process.
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


def get_process_by_name(process_name):
    """
    Finds a running process by its name or command line.

    Args:
        process_name: String to match against process name or command line

    Returns:
        psutil.Process object if found, None otherwise
    """
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            # Check if name matches
            if process_name.lower() in proc.info['name'].lower():
                return proc
            # Check if process_name appears in command line arguments
            if proc.info['cmdline'] and any(process_name in s for s in proc.info['cmdline']):
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None


def monitor(target_identifier, output_file="system_metrics.csv", interval=0.5):
    """
    Monitors CPU, RAM, and Intel iGPU utilization for a target process.

    Args:
        target_identifier: PID (int) or process name (str) to monitor
        output_file: CSV file path for output metrics
        interval: Sampling interval in seconds
    """
    # --- Find Target Process (CPU/RAM) ---
    try:
        pid = int(target_identifier)
        process = psutil.Process(pid)
    except ValueError:
        process = get_process_by_name(target_identifier)

    if not process:
        print(f"❌ Process '{target_identifier}' not found.", file=sys.stderr)
        print("Available Python processes:", file=sys.stderr)
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if 'python' in proc.info['name'].lower():
                    cmdline = ' '.join(proc.info['cmdline'][:3]) if proc.info['cmdline'] else ''
                    print(f"  PID {proc.info['pid']}: {proc.info['name']} {cmdline}", file=sys.stderr)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return 1

    print(f"📊 Monitoring Process: {process.name()} (PID: {process.pid})")

    # --- Check for and Start iGPU Monitor ---
    gpu_monitor_proc = None
    has_igpu_monitor = shutil.which("intel_gpu_top")

    if has_igpu_monitor:
        print("✅ 'intel_gpu_top' found. Starting iGPU monitoring.")
        try:
            # Try to start intel_gpu_top with sudo
            gpu_monitor_proc = subprocess.Popen(
                ["sudo", "-n", "intel_gpu_top", "-J", "-s", str(int(interval * 1000))],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            # The first line of JSON output is an opening bracket '[', skip it
            gpu_monitor_proc.stdout.readline()
        except subprocess.SubprocessError as e:
            print(f"⚠️ Could not start intel_gpu_top: {e}", file=sys.stderr)
            print("⚠️ Make sure you can run 'sudo intel_gpu_top' without password.", file=sys.stderr)
            print("⚠️ Add this line to /etc/sudoers: 'your_username ALL=(ALL) NOPASSWD: /usr/bin/intel_gpu_top'", file=sys.stderr)
            gpu_monitor_proc = None
            has_igpu_monitor = False
    else:
        print("⚠️ 'intel_gpu_top' not found. Monitoring CPU/RAM only.")
        print("Install with: sudo apt install intel-gpu-tools")

    # --- Setup CSV Logging ---
    file_exists = os.path.isfile(output_file)

    try:
        with open(output_file, 'a', newline='') as f:
            writer = csv.writer(f)
            header = ["timestamp", "cpu_percent", "memory_mb"]
            if has_igpu_monitor and gpu_monitor_proc:
                header.append("igpu_render_percent")

            if not file_exists:
                writer.writerow(header)

            # Initialize CPU measurement (first call returns 0.0)
            process.cpu_percent(interval=None)

            print(f"📝 Logging to: {output_file}")
            print("Press Ctrl+C to stop monitoring\n")

            try:
                while True:
                    # 1. Get CPU and Memory usage from psutil
                    try:
                        cpu_util = process.cpu_percent(interval=None)
                        mem_mb = process.memory_info().rss / (1024 * 1024)
                    except psutil.NoSuchProcess:
                        print("\n✅ Target process terminated.")
                        break

                    row_data = [datetime.now().isoformat(), cpu_util, round(mem_mb, 2)]

                    # 2. Get iGPU usage if monitor is active
                    if gpu_monitor_proc and gpu_monitor_proc.poll() is None:
                        try:
                            line = gpu_monitor_proc.stdout.readline()
                            if not line or line.strip() in (']', ''):
                                print("⚠️ intel_gpu_top stream ended", file=sys.stderr)
                                gpu_monitor_proc = None
                                row_data.append(0.0)
                            else:
                                # Clean the line for parsing (remove trailing comma)
                                clean_line = line.strip().removesuffix(',')

                                try:
                                    gpu_data = json.loads(clean_line)
                                    # Extract Render/3D engine usage (most relevant for models)
                                    igpu_util = gpu_data.get("engines", {}).get("Render/3D", {}).get("busy", 0.0)
                                    row_data.append(igpu_util)
                                except json.JSONDecodeError:
                                    row_data.append(0.0)
                        except Exception as e:
                            print(f"⚠️ GPU monitoring error: {e}", file=sys.stderr)
                            row_data.append(0.0)
                    elif has_igpu_monitor and gpu_monitor_proc:
                        row_data.append(0.0)

                    # 3. Write combined data to CSV
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
        if gpu_monitor_proc:
            gpu_monitor_proc.terminate()
            print("🛑 iGPU monitor stopped.")

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Monitor CPU, RAM, and Intel iGPU for a process.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Monitor by process name
  python3 monitor.py python --out model_metrics.csv

  # Monitor by PID
  python3 monitor.py 12345 --out metrics.csv

  # Custom sampling interval
  python3 monitor.py uvicorn --interval 1.0
        """
    )
    parser.add_argument(
        "target",
        help="PID or unique name of the model process (e.g., 'python', 'uvicorn', 'main.py')"
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

    args = parser.parse_args()

    exit_code = monitor(args.target, output_file=args.out, interval=args.interval)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
