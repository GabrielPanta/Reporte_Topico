@echo off
title Servidor & Aplicacion - Consolidador RRHH Pro
cd /d "%~dp0"

echo ========================================================
echo   Iniciando Consolidador de Personal y Marcaciones...
echo   Servidor SQL Server: vfstbd01 (bsis_rem_afr)
echo ========================================================
echo.

:: 1. Prioridad: Iniciar ejecutable nativo compilado si existe
if exist "dist\ConsolidadorRRHH.exe" (
    echo [OK] Iniciando aplicacion de escritorio nativa...
    start "" "dist\ConsolidadorRRHH.exe"
    exit
)

:: 2. Si no existe dist, iniciar mediante Python launcher.py
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Ejecutando launcher.py con Python...
    start "" python launcher.py
    exit
)

if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    echo [OK] Ejecutando launcher.py con WindowsApps Python...
    start "" "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" launcher.py
    exit
)

echo [ERROR] No se pudo encontrar Python ni el ejecutable compilado.
pause

:end
