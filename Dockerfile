# Usar imagen oficial de Python compatible con Playwright
FROM mcr.microsoft.com/playwright/python:v1.43.0-jammy

# Establecer directorio de trabajo
WORKDIR /app

# Copiar dependencias e instalarlas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar navegadores de Playwright
RUN playwright install chromium

# Copiar todo el código de la app
COPY . .

# Exponer el puerto
EXPOSE 5051

# Comando para arrancar la app
CMD ["python", "app.py"]
