@echo off
cd /d "%~dp0"
echo Iniciando a IA do Sessao Zero em http://127.0.0.1:8000  (deixe esta janela aberta)
echo Teste no navegador: http://127.0.0.1:8000/saude
REM Atualiza a lista de clas/aptidoes/poderes com os dados do site (se o Node estiver instalado).
where node >nul 2>nul && node ExportarOpcoes.mjs
call .venv\Scripts\python -m uvicorn Servidor:app --host 127.0.0.1 --port 8000
pause
