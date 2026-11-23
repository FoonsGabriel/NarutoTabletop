@echo off
cd /d "%~dp0"
echo ============================================================
echo  Mapao de Konoha - Fase 1: mapa geral (4x4) a partir da planta
echo ============================================================
echo Planta: imagens\Konoha\Planta.jpg
echo A IA do chat e o gerador nao cabem juntos na placa de video:
echo vou tirar o modelo do chat da memoria (ollama stop qwen3:8b).
where ollama >nul 2>nul && ollama stop qwen3:8b >nul 2>nul
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:8188/system_stats -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Abrindo o ComfyUI numa janela separada...
  start "ComfyUI" /D "..\ComfyUI\ComfyUI_windows_portable" cmd /c run_nvidia_gpu.bat
)
set PY=..\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe
if not exist "%PY%" (
  echo Nao achei o Python do ComfyUI em %PY%
  pause
  exit /b 1
)

:menu
echo.
echo  1 - Gerar o mapa geral (so os pedacos que faltam) e montar
echo  2 - Refazer UM pedaco (outra tentativa) e montar
echo  3 - So montar de novo
echo  4 - NOITE: mapa detalhado 16x16 e 32x32 (1 km) - umas 16 horas, continua de onde parou
echo  5 - Sair
set "OPCAO="
set /p OPCAO=Escolha: 
if "%OPCAO%"=="1" (
  "%PY%" Konoha.py geral
  goto menu
)
if "%OPCAO%"=="4" (
  "%PY%" KonohaDetalhe.py noite
  goto menu
)
if "%OPCAO%"=="2" goto refazer
if "%OPCAO%"=="3" (
  "%PY%" Konoha.py montar
  goto menu
)
goto fim

:refazer
echo Pedaco = coluna,linha contando do 0 (ex.: 0,0 e o canto de cima a esquerda; 3,3 o de baixo a direita)
set "PEDACO="
set /p PEDACO=Pedaco: 
if "%PEDACO%"=="" goto menu
"%PY%" Konoha.py geral --refazer %PEDACO%
goto menu

:fim
echo.
echo Resultado: imagens\Konoha\Konoha-geral.png (e a previa Konoha-geral-previa.jpg)
echo Detalhe: imagens\Konoha\nivel16v2, nivel32v2, previas Konoha-nivelN-previa.jpg e o site em site32
echo Para voltar a usar a IA do chat: feche o ComfyUI e abra o INICIAR.bat.
pause
