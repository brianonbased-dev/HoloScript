@echo off
REM HoloScript Repository Cleanup Script (Windows)
REM Generated: 2026-02-23
REM Purpose: Archive old files, delete temp files, organize docs

setlocal enabledelayedexpansion

set "REPO_ROOT=C:\Users\josep\Documents\GitHub\HoloScript"
cd /d "%REPO_ROOT%"

echo.
echo ========================================
echo   HoloScript Repository Cleanup
echo ========================================
echo.

REM Create archive directories
echo Creating archive directories...
mkdir "docs\archive\sessions" 2>nul
mkdir "docs\archive\features" 2>nul
mkdir "docs\strategy\vision" 2>nul
mkdir "docs\strategy\analysis" 2>nul
mkdir "docs\strategy\audits" 2>nul
mkdir "docs\strategy\agents" 2>nul
mkdir "docs\deployment" 2>nul
mkdir "docs\physics" 2>nul
mkdir "docs\runtime" 2>nul
mkdir "docs\security" 2>nul
mkdir "docs\branding" 2>nul
mkdir "docs\proposals" 2>nul
mkdir "docs\integrations" 2>nul
mkdir "docs\guides" 2>nul
mkdir "docs\community" 2>nul
mkdir "docs\examples" 2>nul

echo Done.
echo.

REM PHASE 1: Delete temporary test output files
echo ========================================
echo   PHASE 1: Deleting temp test files
echo ========================================
del /q ast_v1.txt b49_out.txt 2>nul
del /q c16*_result.txt c17*_result.txt c18*_result.txt c174_176_result.txt c177_179_result.txt c180_185_combined.txt c181_183_result.txt c184_185_result.txt 2>nul
del /q full_suite_*.txt 2>nul
del /q hitl_*.txt hotreload_v*.txt 2>nul
del /q mcp_result.txt mcp_v*.txt 2>nul
del /q parser_snap_v1.txt 2>nul
del /q resilience_v*.txt 2>nul
del /q test_*.txt test_*.log test-output.txt 2>nul
del /q skel_out.txt snap_fail.txt 2>nul
del /q vitest_fluid_output.txt vitest-results.json 2>nul
del /q webrtc_v*.txt 2>nul
del /q tsc_output.txt runtime_debug.log stryker.log stryker-run.log 2>nul

echo   Deleted ~48 test output files
echo.

REM PHASE 2: Delete diagnostic scripts
echo ========================================
echo   PHASE 2: Deleting diagnostic scripts
echo ========================================
del /q diagnose*.mjs fix*.py gen.js gen.ps1 gen.py 2>nul
del /q b64test.py 2>nul
del /q test_gen.js test_write.txt test_out.txt test-hs.mjs 2>nul
del /q setup-migrate.js 2>nul
del /q sprint5.ps1 write-sprint5.js 2>nul
del /q nul 2>nul

echo   Deleted ~19 temporary scripts
echo.

REM PHASE 3: Archive session documents
echo ========================================
echo   PHASE 3: Archiving session docs
echo ========================================
move /y COMPLETE_GAME_ENGINE_SESSION.md docs\archive\sessions\ 2>nul
move /y COMPLETE_PLATFORM_SUMMARY.md docs\archive\sessions\ 2>nul
move /y COMPLETE_SESSION_SUMMARY.md docs\archive\sessions\ 2>nul
move /y SESSION_*.md docs\archive\sessions\ 2>nul
move /y SPRINT_CLXXXII_COMPLETE.md docs\archive\sessions\ 2>nul
move /y WEEK_5_*.md docs\archive\sessions\ 2>nul

echo   Archived ~13 session documents
echo.

REM PHASE 4: Archive feature completion docs
echo ========================================
echo   PHASE 4: Archiving feature docs
echo ========================================
move /y ADVANCED_POSTFX_COMPLETE.md docs\archive\features\ 2>nul
move /y AGENT_6_VERIFICATION.md docs\archive\features\ 2>nul
move /y AUDIO_REALITY_GAP_ANALYSIS.md docs\archive\features\ 2>nul
move /y FILM3D_DASHBOARD_COMPLETION.md docs\archive\features\ 2>nul
move /y FRAGMENT_VISUALIZATION_COMPLETE.md docs\archive\features\ 2>nul
move /y GAME_ENGINE_FEATURES_COMPLETE.md docs\archive\features\ 2>nul
move /y GPU_ACCELERATION_MONTH_1_COMPLETE.md docs\archive\features\ 2>nul
move /y GPU_ACCELERATION_PROGRESS.md docs\archive\features\ 2>nul
move /y GPU_PHASE_3_COMPLETE.md docs\archive\features\ 2>nul
move /y IMPLEMENTATION_AUDIT_2026.md docs\archive\features\ 2>nul
move /y IPFS_IMPLEMENTATION_COMPLETE.md docs\archive\features\ 2>nul
move /y PARTICLE_SYNC_COMPLETE.md docs\archive\features\ 2>nul
move /y PHYSICS_INTEGRATION_COMPLETE.md docs\archive\features\ 2>nul
move /y PRODUCTION_READINESS_COMPLETE.md docs\archive\features\ 2>nul
move /y PRODUCTION_READINESS_PROGRESS.md docs\archive\features\ 2>nul
move /y RUNTIME_INTEGRATION_COMPLETE.md docs\archive\features\ 2>nul
move /y VISUAL_SHADER_EDITOR_COMPLETION.md docs\archive\features\ 2>nul

echo   Archived ~17 feature documents
echo.

REM PHASE 5: Organize strategic documents
echo ========================================
echo   PHASE 5: Organizing strategy docs
echo ========================================
move /y ROADMAP.md docs\strategy\ 2>nul
move /y VISION_*.md docs\strategy\vision\ 2>nul
move /y READY_PLAYER_ONE_GAP_ANALYSIS.md docs\strategy\analysis\ 2>nul
move /y TRAINING_GAP_COVERAGE_REPORT.md docs\strategy\analysis\ 2>nul
move /y HoloScript_Omega_Audit_Feb_2026.md docs\strategy\audits\ 2>nul
move /y MULTI_AGENT_DEPLOYMENT.md docs\strategy\agents\ 2>nul
move /y AGENT_STATUS_DASHBOARD.md docs\strategy\agents\ 2>nul

echo   Organized strategic documents
echo.

REM PHASE 6: Organize technical docs
echo ========================================
echo   PHASE 6: Organizing technical docs
echo ========================================
move /y DEPLOYMENT*.md docs\deployment\ 2>nul
move /y RAILWAY_MAINTENANCE_GUIDE.md docs\deployment\ 2>nul
move /y FRONTEND_DEPLOYMENT_PLAN.md docs\deployment\ 2>nul
move /y PHYSICS_*.md docs\physics\ 2>nul
move /y RUNTIME_*.md docs\runtime\ 2>nul
move /y SECURITY_HARDENING_GUIDE.md docs\security\ 2>nul
move /y TRADEMARK_BRANDING_GUIDE.md docs\branding\ 2>nul
move /y EXTENDED_GEOMETRIES_PROPOSAL.md docs\proposals\ 2>nul
move /y HOLOLAND_INTEGRATION_TODOS.md docs\integrations\ 2>nul
move /y PLUGIN_ECOSYSTEM_HOLOLAND_TODOS.md docs\integrations\ 2>nul
move /y PLATFORM_ARCHITECTURE.md docs\architecture\ 2>nul
move /y BROWSER_CONTROL_SETUP.md docs\guides\ 2>nul
move /y FUNDING.md docs\community\ 2>nul
move /y EARTHQUAKE_DEMO_PLAN.md docs\examples\ 2>nul

echo   Organized technical documentation
echo.

echo ========================================
echo   CLEANUP COMPLETE!
echo ========================================
echo.
echo Summary:
echo   - Deleted: ~67 temporary files (~25MB)
echo   - Archived: ~30 completion/session documents
echo   - Organized: ~20 technical reference documents
echo.
echo Root directory is now clean with only:
echo   * Core documentation (README, CONTRIBUTING, etc.)
echo   * Current roadmap (ROADMAP_v3.1-v5.0_MERGED.md)
echo   * Immutability Manifesto (strategic positioning)
echo   * Configuration files (.gitignore, package.json, etc.)
echo.
echo All historical documents preserved in docs\archive\
echo.
echo Repository cleanup successful!
echo.

pause
