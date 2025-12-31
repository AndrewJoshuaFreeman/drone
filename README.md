# Autonomous Drone Combat Display System

Overview
--------
![Main Display](main/static/main.png)

This project implements a real-time combat display and analytics system for tracking autonomous drones during research and testing operations. The system ingests live telemetry data from multiple unmanned platforms, processes it through a Python-based API, and visualizes drone positions and performance metrics via an interactive web interface.

The primary goals of this project are:

- Real-time situational awareness for autonomous systems
- Low-latency telemetry ingestion and visualization
- Scalable architecture for research and operational experimentation

This system was designed and built from scratch to support autonomy research and operational analysis.

System Architecture
-------------------

At a high level, the system consists of:

- **Telemetry Ingestion API (Python)**
  Receives live telemetry streams from autonomous drones, validates incoming data, and processes updates for downstream visualization.

- **Real-Time Visualization Frontend**
  Interactive web-based combat display map showing live drone positions, status, and mission data.

- **Analytics and Statistics Dashboard**
  Displays per-drone performance metrics using live-updating graphs to support trend analysis and post-test evaluation.

Architecture Flow:

    Autonomous Drones
            |
            v
    Python Telemetry API
            |
            v
    Real-Time Data Pipeline
            |
      +-----+-----+
      |           |
      v           v
    Interactive   Analytics and
    Combat Display   Statistics
    Map           Dashboard

Key Features
------------

- Real-time tracking of multiple autonomous drones
- Live geospatial visualization of drone positions
- Low-latency telemetry updates
- Per-drone statistics and performance analytics
- Continuously updating graphs and metrics
- Modular and extensible system design

Telemetry Data
--------------

The API is designed to ingest structured telemetry data, including but not limited to:

- Drone identifier
- Latitude, longitude, and altitude
- Velocity and heading
- Timestamped status updates
- Mission- or research-specific data fields

The system is extensible and can support additional telemetry formats and autonomous platforms with minimal modification.

Technologies Used
-----------------

- **Backend**: Python (REST API, telemetry processing)
- **Frontend**: Web-based interactive visualization (HTML, JavaScript, CSS)
- **Data Visualization**: Live-updating charts and graphs
- **Networking**: Real-time data streaming and low-latency updates

Use Cases
---------

- Monitoring autonomous drone behavior during live testing
- Supporting real-time situational awareness for research teams
- Analyzing performance metrics and trends across multiple platforms
- Providing a foundation for future autonomy and command-and-control visualization tools

Project Status
--------------

This project is intended for research and educational purposes. It is not designed for production deployment or operational combat use.

Disclaimer
----------

This repository contains no classified, sensitive, or restricted information. All implementations are for academic and research demonstration only.
