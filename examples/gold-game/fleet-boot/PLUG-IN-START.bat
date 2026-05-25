@echo off
rem ============================================================================
rem GOLD DRIVE - plug-in ignition.
rem Windows killed true autorun-on-insert, so this is fired by the per-PC
rem setup-gold-game-autolaunch.ps1 registration (or a double-click). It boots
rem the enabled fleet tiers via gold-fleet-boot.mjs (offline + local; cloud only
rem if you flip it on with a budget cap in fleet-manifest.json).
rem ============================================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [fleet-boot] Node.js not found - opening the offline game launcher only.
  start "" "D:\GOLD-GAME\index.html" 2>nul || start "" "..\assets\game\gold-game\index.html"
  exit /b 0
)
node "%~dp0gold-fleet-boot.mjs" boot
echo.
echo [fleet-boot] done. Run  node gold-fleet-boot.mjs status  to see what is live,
echo                         node gold-fleet-boot.mjs stop    to shut it down.
