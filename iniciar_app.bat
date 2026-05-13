@echo off
echo ==========================================
echo   Iniciando Farmatodo App...
echo ==========================================
echo.
echo [INFO] Abriendo navegador en http://localhost:5050...
start http://localhost:5050
echo.
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] La aplicacion se detuvo inesperadamente.
    pause
)
pause
