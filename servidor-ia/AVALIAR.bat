@echo off
cd /d "%~dp0"
echo Avaliacao da IA: roda as perguntas de teste (uns 10-15 minutos).
echo O Ollama precisa estar ligado. O INICIAR.bat pode ficar aberto.
call .venv\Scripts\python Avaliar.py
pause
