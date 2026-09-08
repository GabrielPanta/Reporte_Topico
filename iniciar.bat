@echo off
title Servidor & Aplicacion - Consolidador RRHH Pro
cd /d "%~dp0"

echo ========================================================
echo   Iniciando Consolidador de Personal y Marcaciones...
echo   Servidor SQL Server: vfstbd01 (bsis_rem_afr)
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Ejecutando launcher.py con Python...
    python launcher.py
    goto end
)

if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    echo [OK] Ejecutando launcher.py con WindowsApps Python...
    "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" launcher.py
    goto end
)

if exist "dist\ConsolidadorRRHH.exe" (
    echo [OK] Ejecutando aplicacion nativa dist\ConsolidadorRRHH.exe...
    dist\ConsolidadorRRHH.exe
    goto end
)

echo [ERROR] No se pudo encontrar Python ni el ejecutable compilado.
pause

:end
