@echo off
chcp 65001 >nul
cd /d "%~dp0"

set XDG_DATA_HOME=%CD%\.argos-local\data
set XDG_CONFIG_HOME=%CD%\.argos-local\config
set XDG_CACHE_HOME=%CD%\.argos-local\cache
set ARGOS_CHUNK_TYPE=MINISBD

echo.
echo   ====================================
echo     Argos 翻译工作台 - 本地启动
echo   ====================================
echo.
echo   启动后打开 http://127.0.0.1:5055
echo   按 Ctrl+C 停止服务
echo.

start "" http://127.0.0.1:5055
python webapp\app.py
pause
