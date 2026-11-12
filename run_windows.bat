@echo off
title VideoForge - Khoi dong tren Windows Local
chcp 65001 > nul
echo ======================================================
echo    VideoForge - He Thong San Xuat Video 17 AI Agent
echo ======================================================
echo.

echo [1/5] Kiem tra Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May ban chua cai Node.js - yeu cau Node 22 tro len.
    echo Vui long tai va cai dat tai: https://nodejs.org/
    pause
    exit /b 1
)

echo [2/5] Kiem tra pnpm...
pnpm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang tu dong cai dat pnpm...
    call npm install -g pnpm
)

if not exist .env (
    echo Dang tao file .env tu file mau...
    copy .env.example .env
)

echo [3/5] Cai dat thu vien Monorepo...
call pnpm approve-builds --all >nul 2>&1
call pnpm install --dangerously-allow-all-builds

echo [4/5] Don dep tien trinh cu dang chiem cong 4000 va 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [5/5] Kiem tra moi truong va khoi dong...
call npx tsx scripts/doctor.ts

echo.
echo ======================================================
echo  KHOI DONG THANH CONG!
echo  - Giao dien Web: http://localhost:3000
echo  - Backend API:   http://localhost:4000
echo ======================================================
echo.
start http://localhost:3000
call pnpm dev
pause
