#!/bin/bash
# Publica o site na Vercel a partir do Mac (igual ao PUBLICAR.bat do Windows).
# Dois cliques no Finder, ou no Terminal: bash PUBLICAR.command
cd "$(dirname "$0")" || exit 1

erro() {
  echo
  echo "DEU ERRO. Copie a mensagem acima e mande pro Claude."
  read -r -p "Aperte Enter para fechar..."
  exit 1
}

if [ ! -f ".env.local" ]; then
  echo "Falta o arquivo .env.local nesta pasta (as chaves do Supabase)."
  echo "Copie o .env.local do PC para: $(pwd)"
  erro
fi

if [ ! -f ".vercel/project.json" ]; then
  echo "Primeira vez neste Mac: ligar a pasta ao projeto da Vercel."
  npx vercel link || erro
fi

echo
echo "[1/3] Montando o site (usa o .env.local)..."
npm run build || erro

echo
echo "[2/3] Preparando os arquivos para a Vercel..."
rm -rf ".vercel/output"
mkdir -p ".vercel/output/static"
cp -R dist/. ".vercel/output/static/" || erro
cat > ".vercel/output/config.json" <<'JSON'
{"version":3,"routes":[{"src":"/assets/(.*)","headers":{"cache-control":"public, max-age=31536000, immutable"},"continue":true},{"handle":"filesystem"},{"src":"/(.*)","dest":"/index.html"}]}
JSON

echo
echo "[3/3] Enviando para a Vercel..."
npx vercel deploy --prebuilt --prod || erro

echo
echo "PRONTO! Site publicado em https://naruto-tabletop.vercel.app"
read -r -p "Aperte Enter para fechar..."
