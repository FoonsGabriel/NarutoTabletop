@echo off
cd /d "%~dp0"
echo Iniciando a IA do Sessao Zero em http://127.0.0.1:8000  (deixe esta janela aberta)
echo Teste no navegador: http://127.0.0.1:8000/saude
call .venv\Scripts\python -m uvicorn Servidor:app --host 127.0.0.1 --port 8000
pause
