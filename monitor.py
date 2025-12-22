#!/usr/bin/env python3
"""
HWiNFO Shared Memory Monitor for Windows
Reads hardware metrics from HWiNFO's shared memory interface and logs to CSV.

Usage:
    1. Start HWiNFO with Shared Memory Support enabled
    2. Run: python -u monitor.py (in Admin PowerShell)

Requirements:
    - Windows OS
    - HWiNFO64 with "Shared Memory Support" enabled in settings
    - Administrator privileges (for shared memory access)
"""

import mmap
import ctypes
import time
import csv
import datetime
import os
import argparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Parse command line arguments
parser = argparse.ArgumentParser(description='HWiNFO Shared Memory Monitor')
parser.add_argument('--run-id', type=str, default=None, help='Unique run ID to include in CSV')
args = parser.parse_args()

# =========================================================
# HWiNFO Shared Memory Constants and Structs
# =========================================================
HWINFO_SENSORS_MAP_FILE_NAME = "Global\\HWiNFO_SENS_SM2"
LOG_FILE = os.getenv("HWINFO_LOG_FILE", r"hwinfo_log.csv")

# =========================================================
# KEYWORD FILTER LIST
# =========================================================
# This list captures all key metrics relevant to model inference,
# matching the fields found in your official HWiNFO log.
TARGET_KEYWORDS = [
    # --- GPU & Graphics ---
    "GPU D3D",          # Covers D3D Usage, D3D Memory Dynamic
    "GPU Video",        # Covers Video Decode 0, Video Processing usage
    "GT Cores Power",   # iGPU specific power
    "GPU Clock",        # Clock speed
    "GPU Busy",         # Latency metric (from PresentMon)
    "Framerate",        # FPS metrics (Presented/Displayed)

    # --- CPU & System Power ---
    "CPU Package Power",# Total chip power (CPU + iGPU + System Agent)
    "Total CPU Usage",  # Global CPU load
    "IA Cores Power",   # Power used by CPU cores only

    # --- Thermals ---
    "CPU GT Cores",     # iGPU Temperature (Graphics)
    "CPU Package",      # Overall Package Temperature
    "Drive Temperature",# SSD Temp

    # --- Battery ---
    "Charge Level",     # Battery %
    "Remaining Capacity", # Wh remaining
    "Battery Voltage",  # V

    # --- NPU (If available) ---
    "NPU"               # Will capture any NPU metrics if they appear
]

# =========================================================
# HWiNFO Structures
# =========================================================
class HWiNFO_Header(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("Signature", ctypes.c_char * 4),
        ("Version", ctypes.c_uint32),
        ("Revision", ctypes.c_uint32),
        ("PollTime", ctypes.c_int64),
        ("OffsetOfSensorSection", ctypes.c_uint32),
        ("SizeOfSensorElement", ctypes.c_uint32),
        ("NumSensorElements", ctypes.c_uint32),
        ("OffsetOfReadingSection", ctypes.c_uint32),
        ("SizeOfReadingElement", ctypes.c_uint32),
        ("NumReadingElements", ctypes.c_uint32)
    ]

class HWiNFO_Element_460(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("tReading", ctypes.c_uint32),
        ("dwSensorIndex", ctypes.c_uint32),
        ("dwReadingID", ctypes.c_uint32),
        ("szLabelOrig", ctypes.c_char * 128),
        ("szLabelUser", ctypes.c_char * 128),
        ("szUnit", ctypes.c_char * 16),
        ("Value", ctypes.c_double),
        ("ValueMin", ctypes.c_double),
        ("ValueMax", ctypes.c_double),
        ("ValueAvg", ctypes.c_double),
        ("Padding", ctypes.c_ubyte * (460 - 320))
    ]

class HWiNFO_Element_320(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("tReading", ctypes.c_uint32),
        ("dwSensorIndex", ctypes.c_uint32),
        ("dwReadingID", ctypes.c_uint32),
        ("szLabelOrig", ctypes.c_char * 128),
        ("szLabelUser", ctypes.c_char * 128),
        ("szUnit", ctypes.c_char * 16),
        ("Value", ctypes.c_double),
        ("ValueMin", ctypes.c_double),
        ("ValueMax", ctypes.c_double),
        ("ValueAvg", ctypes.c_double)
    ]

class HWiNFO_Element_252(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("tReading", ctypes.c_uint32),
        ("dwSensorIndex", ctypes.c_uint32),
        ("dwReadingID", ctypes.c_uint32),
        ("szLabelOrig", ctypes.c_char * 96),
        ("szLabelUser", ctypes.c_char * 96),
        ("szUnit", ctypes.c_char * 16),
        ("Value", ctypes.c_double),
        ("ValueMin", ctypes.c_double),
        ("ValueMax", ctypes.c_double),
        ("ValueAvg", ctypes.c_double)
    ]

# =========================================================
# Functions
# =========================================================

def get_hwinfo_data():
    """Reads shared memory and returns a dictionary of filtered metrics."""
    metrics = {}
    try:
        shm = mmap.mmap(-1, 500000, tagname=HWINFO_SENSORS_MAP_FILE_NAME, access=mmap.ACCESS_READ)
        header = HWiNFO_Header.from_buffer_copy(shm.read(ctypes.sizeof(HWiNFO_Header)))

        if header.Signature != b'HWiS':
             shm.close()
             return None

        # Select Structure based on size from header
        element_size = header.SizeOfReadingElement
        if element_size == 460: element_struct = HWiNFO_Element_460
        elif element_size == 320: element_struct = HWiNFO_Element_320
        elif element_size == 252: element_struct = HWiNFO_Element_252
        else:
            shm.close()
            return None

        shm.seek(header.OffsetOfReadingSection)

        for _ in range(header.NumReadingElements):
            block = shm.read(element_size)
            element = element_struct.from_buffer_copy(block)

            try:
                label = element.szLabelUser.decode('latin-1').strip('\x00')
                unit = element.szUnit.decode('latin-1').strip('\x00')
            except:
                continue

            if element.tReading != 0 and label:
                # Check if this sensor is in our target list
                if any(k in label for k in TARGET_KEYWORDS):
                    full_key = f"{label} [{unit}]" if unit else label
                    metrics[full_key] = element.Value

        shm.close()
        return metrics

    except Exception:
        return None

def safe_fmt(val):
    """Safely formats a value to 1 decimal place if it's a number."""
    if isinstance(val, (int, float)):
        return f"{val:.1f}"
    return str(val)

def main():
    run_id = args.run_id
    print(f"Monitoring started. Logging to {LOG_FILE}...")
    if run_id:
        print(f"Run ID: {run_id}")
    print("Press Ctrl+C to stop.\n")

    csv_headers = None

    try:
        while True:
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            data = get_hwinfo_data()

            if data:
                row_data = {"Run_ID": run_id or "N/A", "Time": timestamp}
                row_data.update(data)

                # Setup CSV header if first run
                if csv_headers is None:
                    csv_headers = list(row_data.keys())
                    with open(LOG_FILE, 'w', newline='') as f:
                        writer = csv.DictWriter(f, fieldnames=csv_headers)
                        writer.writeheader()

                # Append data to CSV
                with open(LOG_FILE, 'a', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=csv_headers)
                    # Use dictionary matching to safely write row
                    clean_row = {k: row_data.get(k, '') for k in csv_headers}
                    writer.writerow(clean_row)

                # --- Safe Console Summary ---
                # We prioritize specific sensors for the live view
                gpu_mem = data.get('GPU D3D Memory Dynamic [MB]', 'N/A')

                # Fallback logic for GPU Power: try GT Cores -> CPU GT Cores
                gpu_pwr = data.get('GT Cores Power [W]',
                          data.get('CPU GT Cores Power [W]', 'N/A'))

                # Fallback logic for Total Power: try CPU Package Power
                pkg_pwr = data.get('CPU Package Power [W]', 'N/A')

                gpu_clk = data.get('GPU Clock [MHz]', 'N/A')
                gpu_load = data.get('GPU D3D Usage [%]', 'N/A')
                bat_pct = data.get('Charge Level [%]', 'N/A')

                print(f"[{timestamp}] Logged {len(data)} metrics.")
                print(f"   GPU Memory: {safe_fmt(gpu_mem)} MB")
                print(f"   GPU Usage:  {safe_fmt(gpu_load)} %")
                print(f"   GPU Power:  {safe_fmt(gpu_pwr)} W  (Total Pkg: {safe_fmt(pkg_pwr)} W)")
                print(f"   GPU Clock:  {safe_fmt(gpu_clk)} MHz")
                print(f"   Battery:    {safe_fmt(bat_pct)} %")
                print("-" * 50)
                # ----------------------------

            else:
                print("Error reading HWiNFO. Is it running?")

            time.sleep(5)

    except KeyboardInterrupt:
        print(f"\nStopped. Data saved to {LOG_FILE}")

if __name__ == "__main__":
    main()