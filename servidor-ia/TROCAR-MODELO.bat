@echo off
cd /d "%~dp0"
echo.
echo  Trocar o modelo de texto da IA
echo  ------------------------------
echo   1 = qwen3:8b   (atual, precisa de ~6 GB de memoria de video)
echo   2 = qwen3:14b  (melhor; numa placa de 8 GB fica mais lento, usa um pouco da RAM)
echo   3 = qwen3:30b  (NAO cabe numa placa de 8 GB com 16 GB de RAM)
echo   4 = qwen3:4b   (mais leve, para placas fracas)
echo.
set /p ESCOLHA=Digite o numero e aperte Enter: 
set "MODELO="
if "%ESCOLHA%"=="1" set "MODELO=qwen3:8b"
if "%ESCOLHA%"=="2" set "MODELO=qwen3:14b"
if "%ESCOLHA%"=="3" set "MODELO=qwen3:30b"
if "%ESCOLHA%"=="4" set "MODELO=qwen3:4b"
if not defined MODELO (echo Opcao invalida. & goto fim)
echo.
echo Baixando %MODELO% (pode demorar, sao varios GB)...
ollama pull %MODELO% || (echo DEU ERRO ao baixar. Confira se o Ollama esta aberto. & goto fim)
if not exist dados mkdir dados
>dados\Modelo.txt echo %MODELO%
echo.
echo PRONTO! A IA vai usar %MODELO%. Feche e abra o INICIAR.bat.
:fim
pause
