@echo off
cd /d "%~dp0"
echo ============================================================
echo  Gerador de mapas do Sessao Zero (estilo 3/4, FLUX.2 klein)
echo ============================================================
echo A IA do chat e o gerador nao cabem juntos na placa de video:
echo vou tirar o modelo do chat da memoria (ollama stop qwen3:8b).
where ollama >nul 2>nul && ollama stop qwen3:8b >nul 2>nul
REM Abre o ComfyUI se ainda nao estiver aberto.
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:8188/system_stats -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Abrindo o ComfyUI numa janela separada...
  start "ComfyUI" /D "..\ComfyUI\ComfyUI_windows_portable" cmd /c run_nvidia_gpu.bat
)
REM Python do ComfyUI (tem o Pillow, usado para juntar os pedacos).
set PY=python
if exist "..\servidor-ia\.venv\Scripts\python.exe" set PY=..\servidor-ia\.venv\Scripts\python.exe
if exist "..\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe" set PY=..\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe

:menu
echo.
echo  1 - Mapa novo
echo  2 - Continuar um mapa para o lado (outro pedaco)
echo  3 - Sair
set "OPCAO="
set /p OPCAO=Escolha: 
if "%OPCAO%"=="1" goto novo
if "%OPCAO%"=="2" goto continuar
goto fim

:novo
echo.
echo Descreva o lugar do mapa (em ingles e sem acento funciona melhor).
echo Exemplo: a waterfall between two giant stone statues, river below
set "LUGAR="
set /p LUGAR=Lugar: 
if "%LUGAR%"=="" goto menu
set "QTD="
set /p QTD=Quantas variacoes? [1]: 
if "%QTD%"=="" set QTD=1
"%PY%" Gerar.py "%LUGAR%" --qtd %QTD%
goto menu

:continuar
echo.
echo Arraste o mapa (.png) para esta janela e aperte Enter.
echo (Pode ser um _JUNTO de antes, para continuar mais.)
set "MAPA="
set /p MAPA=Mapa: 
if "%MAPA%"=="" goto menu
echo Para qual lado? direita / esquerda / baixo / cima
set "LADO="
set /p LADO=Lado [direita]: 
if "%LADO%"=="" set LADO=direita
echo O que aparece no pedaco novo? (ex.: the river continues into a dense forest)
set "LUGAR="
set /p LUGAR=Lugar: 
if "%LUGAR%"=="" goto menu
set "QTD="
set /p QTD=Quantas variacoes? [1]: 
if "%QTD%"=="" set QTD=1
"%PY%" Gerar.py "%LUGAR%" --continuar %MAPA% --lado %LADO% --qtd %QTD%
goto menu

:fim
echo.
echo Para voltar a usar a IA do chat: feche o ComfyUI e abra o INICIAR.bat.
pause
