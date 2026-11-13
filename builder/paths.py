"""Folders and files the builder reads and writes, based on this folder (not the shell's cwd)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
STOPS_FILE = os.path.join(HERE, "stops.json")
PHOTO_PICKS_FILE = os.path.join(HERE, "photo_picks.json")

MISSION_DIR = os.path.normpath(os.path.join(HERE, "..", "web", "mission"))
MISSION_FILE = os.path.join(MISSION_DIR, "mission.json")
ASSETS = os.path.join(MISSION_DIR, "assets")
TERRAIN = os.path.join(MISSION_DIR, "terrain")
