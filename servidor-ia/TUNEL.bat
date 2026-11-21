@echo off
cd /d "%~dp0"
REM Abre o tunel da Cloudflare ate a IA e avisa o site do endereco novo (Tunel.py). Deixe esta janela aberta.
REM O INICIAR.bat ja abre esta janela sozinho; so use este arquivo se ela tiver sido fechada.
call .venv\Scripts\python Tunel.py
pause
