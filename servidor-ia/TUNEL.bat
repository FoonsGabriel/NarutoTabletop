@echo off
cd /d "%~dp0"
REM Abre um tunel da Cloudflare ate a IA (o site chama por ele). Deixe esta janela aberta.
REM Rapido (endereco muda a cada vez): cloudflared tunnel --url http://127.0.0.1:8000
REM Fixo (ia.sessaozerorpg.com.br): depois do dominio, ver LEIA-ME.md, parte "Tunel fixo".
where cloudflared >nul 2>nul || (echo Falta o cloudflared: winget install --id Cloudflare.cloudflared & pause & exit /b 1)
cloudflared tunnel --url http://127.0.0.1:8000
pause
