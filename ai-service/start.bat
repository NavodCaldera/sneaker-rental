@echo off
rem Starts the local Qwen 2.5 14B model for the Nova Personal Stylist (see README.md).
setlocal

set "MODEL=qwen2.5:14b"
if not "%STYLIST_LLM_MODEL%"=="" set "MODEL=%STYLIST_LLM_MODEL%"

where ollama >nul 2>nul
if errorlevel 1 goto noollama

rem Start the server unless it is already listening on 11434.
ollama list >nul 2>nul
if not errorlevel 1 goto ready
echo Starting the Ollama server...
start "Ollama" /min ollama serve
set /a tries=0
:wait
timeout /t 1 /nobreak >nul
ollama list >nul 2>nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% lss 30 goto wait
echo The Ollama server did not start.
exit /b 1

:ready
ollama list | findstr /b /c:"%MODEL% " >nul
if not errorlevel 1 goto run
echo Pulling %MODEL% (about 9 GB the first time)...
ollama pull %MODEL%
if errorlevel 1 exit /b 1

:run
echo Qwen is ready at http://127.0.0.1:11434/v1 (model %MODEL%). Type /bye to leave the chat; the server keeps running.
ollama run %MODEL%
exit /b %errorlevel%

:noollama
echo Ollama is not installed. Get it from https://ollama.com/download and run this again.
exit /b 1
