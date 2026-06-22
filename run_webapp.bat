@echo off
cd /d "%~dp0"
set XDG_DATA_HOME=%CD%\.argos-local\data
set XDG_CONFIG_HOME=%CD%\.argos-local\config
set XDG_CACHE_HOME=%CD%\.argos-local\cache
set ARGOS_CHUNK_TYPE=MINISBD
python webapp\app.py
