@echo off
cd /d "%~dp0"
echo.
echo === Instalar a IA do Sessao Zero (uma vez so) ===
echo.
where python >nul 2>nul || (echo Falta o Python 3.11+ : https://www.python.org/downloads/  ^(marque "Add to PATH"^) & goto erro)
where ollama >nul 2>nul || (echo Falta o Ollama: https://ollama.com/download & goto erro)
where node >nul 2>nul || (echo Falta o Node.js: https://nodejs.org & goto erro)
echo [1/4] Ambiente do Python...
if not exist ".venv" python -m venv .venv || goto erro
call .venv\Scripts\python -m pip install -q -r Requisitos.txt || goto erro
echo [2/4] Baixando os modelos (texto ~5 GB e busca ~1 GB, so na primeira vez)...
ollama pull qwen3:8b || goto erro
ollama pull bge-m3 || goto erro
echo [3/4] Opcoes de ficha do Shinobi (as mesmas do site)...
node ExportarOpcoes.mjs || goto erro
echo [4/4] Lendo os livros da pasta "livros" (coloque os 3 PDFs la antes)...
call .venv\Scripts\python Livros.py || goto erro
echo.
echo PRONTO! Agora use INICIAR.bat
pause
exit /b 0
:erro
echo.
echo DEU ERRO. Copie a mensagem acima e mande pro Claude.
pause
exit /b 1
