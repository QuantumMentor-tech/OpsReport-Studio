@echo off
setlocal enabledelayedexpansion
title OpsReport Studio Launcher

cd /d "%~dp0"

echo ======================================================
echo    OpsReport Studio - Desktop Application Launcher
echo ======================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 goto missing_node

:: Check npm
where npm >nul 2>nul
if %errorlevel% neq 0 goto missing_npm

:: Check dependencies
if not exist "node_modules\" goto install_dependencies

:after_dep_check
:: Handle direct CLI arguments
set "CLI_ARG=%~1"
if /i "%CLI_ARG%"=="dev" goto run_dev
if /i "%CLI_ARG%"=="start" goto run_dev
if /i "%CLI_ARG%"=="test" goto run_test
if /i "%CLI_ARG%"=="typecheck" goto run_typecheck
if /i "%CLI_ARG%"=="build" goto run_build
if /i "%CLI_ARG%"=="install" goto run_install

:menu
echo Select an action:
echo   [1] Start Desktop Application [Development Mode - Default]
echo   [2] Run Automated Tests [Vitest]
echo   [3] Run TypeScript Typecheck
echo   [4] Build Production Application
echo   [5] Reinstall Dependencies [npm install]
echo   [6] Exit
echo.
set "choice="
set /p choice="Enter choice 1-6 (Press Enter to start app): "

if "%choice%"=="" goto run_dev
if "%choice%"=="1" goto run_dev
if "%choice%"=="2" goto run_test
if "%choice%"=="3" goto run_typecheck
if "%choice%"=="4" goto run_build
if "%choice%"=="5" goto run_install
if "%choice%"=="6" exit /b 0

echo Invalid selection. Launching application by default...
goto run_dev

:install_dependencies
echo [INFO] node_modules directory not found.
echo Installing project dependencies via npm install...
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Dependency installation failed.
    pause
    exit /b %errorlevel%
)
echo.
echo [OK] Dependencies installed successfully.
echo.
goto after_dep_check

:run_dev
echo.
echo [LAUNCHING] Starting OpsReport Studio desktop application...
echo Press Ctrl+C in this terminal window to stop the application.
echo.
call npm run dev
set "EXIT_CODE=%errorlevel%"
if %EXIT_CODE% neq 0 (
    echo.
    echo [ERROR] Application exited with error code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%

:run_test
echo.
echo [TESTS] Running Vitest test suite...
call npm test
set "EXIT_CODE=%errorlevel%"
if not "%CLI_ARG%"=="" exit /b %EXIT_CODE%
echo.
pause
goto menu

:run_typecheck
echo.
echo [TYPECHECK] Running TypeScript compiler checks...
call npm run typecheck
set "EXIT_CODE=%errorlevel%"
if %EXIT_CODE% equ 0 (
    echo [OK] All TypeScript checks passed cleanly.
)
if not "%CLI_ARG%"=="" exit /b %EXIT_CODE%
echo.
pause
goto menu

:run_build
echo.
echo [BUILD] Building production bundles...
call npm run build
set "EXIT_CODE=%errorlevel%"
if %EXIT_CODE% equ 0 (
    echo [OK] Production build completed successfully.
)
if not "%CLI_ARG%"=="" exit /b %EXIT_CODE%
echo.
pause
goto menu

:run_install
echo.
echo [INSTALL] Installing project dependencies...
call npm install
set "EXIT_CODE=%errorlevel%"
if not "%CLI_ARG%"=="" exit /b %EXIT_CODE%
echo.
pause
goto menu

:missing_node
echo [ERROR] Node.js was not found in your system PATH.
echo OpsReport Studio requires Node.js v20 LTS or higher.
echo Please download and install Node.js from https://nodejs.org/
echo.
pause
exit /b 1

:missing_npm
echo [ERROR] npm was not found in your system PATH.
echo Please ensure Node.js and npm are properly added to your PATH environment variable.
echo.
pause
exit /b 1

