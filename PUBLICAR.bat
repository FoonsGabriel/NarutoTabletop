@echo off
cd /d "%~dp0"
echo.
echo [1/3] Montando o site no seu PC (usa o .env.local)...
call npm run build || goto erro
echo.
echo [2/3] Preparando os arquivos para a Vercel...
if exist ".vercel\output" rmdir /s /q ".vercel\output"
xcopy "dist" ".vercel\output\static\" /e /i /y /q >nul || goto erro
> ".vercel\output\config.json" echo {"version":3,"routes":[{"src":"/assets/(.*)","headers":{"cache-control":"public, max-age=31536000, immutable"},"continue":true},{"handle":"filesystem"},{"src":"/(.*)","dest":"/index.html"}]}
echo.
echo [3/3] Enviando para a Vercel...
call npx vercel deploy --prebuilt --prod || goto erro
echo.
echo PRONTO! Site publicado em https://naruto-tabletop.vercel.app
pause
exit /b 0
:erro
echo.
echo DEU ERRO. Copie a mensagem acima e mande pro Claude.
pause
exit /b 1
