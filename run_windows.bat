@echo off
title VideoForge - Khoi dong tren Windows Local
echo ======================================================
echo    VideoForge - He Thong San Xuat Video 17 AI Agent
echo ======================================================
echo.

if not exist .env (
    echo Dang tao file .env tu file mau...
    copy .env.example .env
)

echo [1/3] Don dep tien trinh cu tren cong 4000 va 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [2/3] Kiem tra moi truong...
call pnpm doctor

echo.
echo ======================================================
echo  [3/3] KHOI DONG VIDEOFORGE:
echo  - Giao dien Web: http://localhost:3000
echo  - Backend API:   http://localhost:4000
echo ======================================================
echo.
start http://localhost:3000
call pnpm dev
pause
