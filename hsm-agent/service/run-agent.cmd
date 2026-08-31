@echo off
REM ===========================================================================
REM  GRIDx local HSM agent - supervised launcher.
REM
REM  Keeps the agent running: if it exits for any reason (crash, network stack
REM  reset, node fault) this restarts it after a short pause. Registered with
REM  Task Scheduler so it also comes back after a reboot.
REM
REM  The agent itself already retries failed polls with backoff; this is the
REM  outer net for the case where the process dies entirely.
REM ===========================================================================
setlocal EnableExtensions

set "REPO=C:\Users\kamat\Documents\Projects\Gridx\GRIDx-Workspace\gridx-combined-platform"
set "NODE=C:\Program Files\nodejs\node.exe"
set "LOGDIR=%REPO%\hsm-agent\service\logs"
set "LOG=%LOGDIR%\agent.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
cd /d "%REPO%" || exit /b 1

:loop
REM Rotate once past ~10 MB so the log cannot grow without bound.
for %%A in ("%LOG%") do if %%~zA GTR 10485760 move /y "%LOG%" "%LOG%.1" >nul 2>&1

echo. >> "%LOG%"
echo [%date% %time%] starting HSM agent >> "%LOG%"
"%NODE%" "%REPO%\hsm-agent\run-agent.js" >> "%LOG%" 2>&1
echo [%date% %time%] agent exited with code %errorlevel% - restarting in 15s >> "%LOG%"

timeout /t 15 /nobreak >nul
goto loop
