# views.py

#-----SET UP/INIT----------------------------------------------------------------------------------------------------------------#

from flask import (
    Blueprint, render_template, request, jsonify,
    redirect, url_for, flash
)
import os
import pandas as pd
from shapely.geometry import LineString, Point
from collections import defaultdict
from dotenv import load_dotenv

# Flask-Login imports
from flask_login import (
    login_user, logout_user,
    login_required, current_user,
    UserMixin
)
from extensions import login_manager  # your local LoginManager

# Point Flask-Login at the correct login view
login_manager.login_view = "views.login"

# Load environment
load_dotenv("/home/andrewfreeman/mysite/.env")
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise RuntimeError("API_KEY environment variable not set")

views = Blueprint(__name__, "views")


#----- IN-MEMORY AUTH SETUP ----------------------------------------------------------------------------------------------------#

USERS = {
    "admin":    "password123",
    "operator": "operatorpass"
}

class SimpleUser(UserMixin):
    def __init__(self, username):
        self.id = username
        self.username = username

@login_manager.user_loader
def load_user(username):
    if username in USERS:
        return SimpleUser(username)
    return None


#----- AUTH ROUTES --------------------------------------------------------------------------------------------------------------#

@views.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("views.home"))

    if request.method == "POST":
        u = request.form.get("username", "")
        p = request.form.get("password", "")
        if USERS.get(u) == p:
            login_user(SimpleUser(u))
            flash(f"Welcome, {u}!", "success")
            nxt = request.args.get("next")
            return redirect(nxt or url_for("views.home"))
        flash("Invalid username or password", "danger")

    return render_template("login.html")


@views.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You’ve been logged out.", "info")
    return redirect(url_for("views.login"))


#----- GLOBALS & FLIGHT-PATH CONFIG --------------------------------------------------------------------------------------------#

comments = []
ALLOWED_CALLSIGNS = sorted(["DUSKY18", "DUSKY21", "DUSKY24", "DUSKY27"])
latest_json = {}
history_by_callsign = {}
cumulative_dev_sum_map = defaultdict(float)

FLIGHT_XLSX_DIR = "/home/andrewfreeman/mysite/json_data"
flight_paths = {
    "DUSKY27": "Disaster_City_Survey_V2_converted.xlsx",
    "DUSKY18": "RELLIS_NORTH_-_REL→Hearne_converted.xlsx",
    "DUSKY24": "RELLIS_SOUTH_-_REL_→_AggieFarm_converted.xlsx",
    "DUSKY21": "RELLIS_WEST_-_REL_→_Caldwell_converted.xlsx"
}

path_lines = {}
for name, xlsx in flight_paths.items():
    full_path = os.path.join(FLIGHT_XLSX_DIR, xlsx)
    df = (
        pd.read_excel(full_path, sheet_name="in")
          [["Latitude", "Longitude", "Altitude"]]
          .dropna()
          .reset_index(drop=True)
    )
    coords = list(zip(df["Longitude"], df["Latitude"]))
    path_lines[name] = LineString(coords)


#-----HOME PAGE-----------------------------------------------------------------------------------------------------------------#

@views.route("/")
@login_required
def home():
    return render_template("index.html", drones=sorted(ALLOWED_CALLSIGNS))


#-----DRONE PAGES----------------------------------------------------------------------------------------------------------------#

@views.route("/drone/<call_sign>")
@login_required
def drone_page(call_sign):
    if call_sign not in ALLOWED_CALLSIGNS:
        return render_template("404.html"), 404
    return render_template(
        "droneJ.html",
        call_sign=call_sign,
        drones=ALLOWED_CALLSIGNS
    )

@views.route("/droneJ")
@login_required
def droneJ():
    return render_template("droneJ.html")


#-----BACKEND PAGES--------------------------------------------------------------------------------------------------------------#
# Unprotected POST: receive JSON via API key
@views.route("/data", methods=["POST"])
def receive_data():
    global latest_json, history_by_callsign

    client_key = request.headers.get("X-API-KEY")
    if client_key != API_KEY:
        return jsonify({"error": "Unauthorized: Invalid API Key"}), 401

    latest_json = request.get_json() or {}
    if not latest_json:
        return jsonify({"error": "No JSON data received"}), 400

    call_sign = latest_json.get("call_sign")
    lat = latest_json.get("position", {}).get("latitude")
    lon = latest_json.get("position", {}).get("longitude")

    # Compute deviation
    if call_sign in path_lines and lat is not None and lon is not None:
        pt = Point(lon, lat)
        line = path_lines[call_sign]
        nearest = line.interpolate(line.project(pt))
        dist_m = pt.distance(nearest) * 111000
        dist_ft = dist_m * 3.28084
        deviation = round(dist_ft, 2)
        latest_json["deviation"] = deviation

        if deviation > 25:
            cumulative_dev_sum_map[call_sign] += (deviation - 25)
        latest_json["cumulative_dev_sum"] = round(
            cumulative_dev_sum_map[call_sign], 2
        )

    if call_sign:
        history_by_callsign.setdefault(call_sign, []).append(latest_json)

    # build and send back confirmation including callsign and timestamp
    time_measured = latest_json.get("time_measured")
    response_body = {
        "message": "Data received and verified",
        "call_sign": call_sign,
        "time_measured": time_measured
    }
    return jsonify(response_body), 200


# Protected GET: view the JSON only if logged in
@views.route("/data", methods=["GET"])
@login_required
def view_data():
    return render_template(
        "displayJSON.html",
        data=latest_json,
        drones=ALLOWED_CALLSIGNS
    )


@views.route("/data/<call_sign>", methods=["GET"])
def data_by_callsign(call_sign):
    data_list = history_by_callsign.get(call_sign)
    if data_list is None:
        return jsonify({"error": "No data found for this call_sign"}), 404
    return data_list


@views.route("/reset_history", methods=["POST"])
@login_required
def reset_history():
    global history_by_callsign, cumulative_dev_sum_map, latest_json
    history_by_callsign.clear()
    cumulative_dev_sum_map.clear()
    latest_json.clear()
    return redirect(url_for("views.home"))

