@echo off
echo ==================================================
echo   REPARADOR AUTOMATICO DE FARMATODO APP
echo ==================================================
echo.
echo [1/3] Instalando librerias de Python...
python -m pip install --upgrade pip
python -m pip install flask flask-cors playwright openpyxl gspread google-auth
echo.
echo [2/3] Instalando Navegador de Scraping (Chrome Test)...
python -m playwright install chromium
echo.
echo [3/3] Iniciando aplicacion...
echo.
echo SI TODO SALIO BIEN, SE ABRIRA EL NAVEGADOR EN BREVE.
start http://localhost:5050
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Algo fallo. Copia el texto de arriba para ayudarme a revisarlo.
    pause
)
pause
