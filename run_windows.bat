@echo off
title VideoForge - Khoi dong tren Windows Local
chcp 65001 > nul
echo ======================================================
echo    VideoForge - He Thong San Xuat Video 17 AI Agent
echo ======================================================
echo.

echo [1/4] Kiem tra Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May ban chua cai Node.js (yeu cau Node >= 22).
    echo Vui long tai va cai dat tai: https://nodejs.org/
    pause
    exit /b 1
)

echo [2/4] Kiem tra pnpm...
pnpm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang tu dong cai dat pnpm...
    call npm install -g pnpm
)

if not exist .env (
    echo Dang tao file .env tu file mau...
    copy .env.example .env
)

echo [3/4] Cai dat thu vien Monorepo...
call pnpm approve-builds --all >nul 2>&1
call pnpm install --dangerously-allow-all-builds

echo [4/4] Kiem tra moi truong va Voice Studio (192.168.5.18:3900)...
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
