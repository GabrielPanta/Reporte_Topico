@echo off
title Consolidador de Personal, Labores y Marcaciones - Unifrutti RRHH Pro
cd /d "%~dp0"

echo =========================================================================
echo   Iniciando Consolidador de Personal, Labores y Marcaciones (RRHH Pro)
echo   Unifrutti - Servidor SQL Server: vfstbd01 / bsis_rem_afr
echo =========================================================================
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
    echo [OK] Iniciando motor Python launcher.py...
    start "" python launcher.py
    exit
)

:: 3. Buscar Python en WindowsApps
if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    echo [OK] Iniciando motor Python WindowsApps...
    start "" "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" launcher.py
    exit
)

echo [ERROR] No se encontro ni dist\ConsolidadorRRHH.exe ni Python instalado.
echo Por favor asegurese de tener Python o el ejecutable listo.
pause
