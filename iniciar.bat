@echo off
title Servidor - Consolidador de Personal y Marcaciones
echo ========================================================
echo   Iniciando Consolidador de Personal y Marcaciones...
echo ========================================================
echo.
echo Abriendo el navegador en http://localhost:8000 ...
start http://localhost:8000
echo.
echo Presione Ctrl+C para detener el servidor.
echo.
python -m http.server 8000
pause
