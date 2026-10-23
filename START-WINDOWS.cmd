@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto node_missing
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 goto node_missing
if not exist ".env" copy /y ".env.example" ".env" >nul
echo Installing dependencies...
call npm ci
if errorlevel 1 goto failed
echo Open http://localhost:3000/auth.html after the server starts.
call npm start
if errorlevel 1 goto failed
pause
exit /b 0
:node_missing
echo Node.js 24 or newer is required.
pause
exit /b 1
:failed
echo Read START-HERE.txt for initial Supabase database setup.
echo Keep this window open and send the error without any passwords.
pause
exit /b 1
