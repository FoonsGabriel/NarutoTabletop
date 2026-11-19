# IA do Sessão Zero (servidor no PC)

Dúvidas de regras com os livros e ajuda para montar ficha. Roda **no PC** (RTX 5060 8 GB):
Ollama (modelos) + este servidor (FastAPI) + túnel da Cloudflare até o site.
O site nunca recebe os livros: só as respostas, com as páginas citadas.

## Peças
| Arquivo | O que faz |
|---|---|
| `Servidor.py` | O servidor: `/saude`, `/perguntar`, `/ficha` |
| `Livros.py` | Lê os PDFs da pasta `livros/` e monta o índice de busca (`indice/`) |
| `Busca.py` | Acha os trechos dos livros mais parecidos com a pergunta |
| `Fila.py` | Um pedido por vez, na ordem: Mestre → mesa → resto |
| `Ollama.py` | Conversa com o Ollama |
| `Prompts.py` | O que a IA deve (e não deve) fazer |
| `ExportarOpcoes.mjs` | Copia as opções de ficha do site (clãs, aptidões, poderes) para `dados/Opcoes.json` |
| `Config.py` | Modelos, sites permitidos, limites |

`livros/` e `indice/` **não vão para o GitHub** (livros têm direitos autorais e são grandes).

## Primeira vez (no PC)
1. Instale: **Python 3.11+** (marque "Add to PATH"), **Ollama** e **Node.js**.
2. Copie os 3 PDFs para `servidor-ia\livros\`. O nome do arquivo ajuda a achar o livro:
   algo com "Basico", "Hijutsus 4.1b" e "Hijutsus Vol" no nome.
3. Dois cliques em **`INSTALAR.bat`** (baixa os modelos e lê os livros; demora na primeira vez).
   - Se aparecer "estes PDFs parecem ser imagem", o PDF precisa de OCR antes (me avise).

## Todo dia de uso
1. **`INICIAR.bat`** (deixe aberto). Teste: http://127.0.0.1:8000/saude → `"ok": true`.
2. **`TUNEL.bat`** (deixe aberto). Ele mostra um endereço `https://….trycloudflare.com`.
3. No site: `VITE_IA_URL` = esse endereço (no `.env.local` e na Vercel) e publique.
   - O endereço rápido muda toda vez. Com o domínio, dá para usar um fixo (abaixo).

## Túnel fixo (depois do domínio `sessaozerorpg.com.br`)
Com o domínio na Cloudflare: `cloudflared tunnel login`, `cloudflared tunnel create sessaozero-ia`,
`cloudflared tunnel route dns sessaozero-ia ia.sessaozerorpg.com.br` e rodar o túnel com o nome.
Aí `VITE_IA_URL=https://ia.sessaozerorpg.com.br` fica para sempre.

## Ajustes
- Pouca memória ou lento: `set MODELO_TEXTO=qwen3:4b` antes do `INICIAR.bat`.
- Site novo: acrescente em `SITES_PERMITIDOS` (Config.py).
- Mudou clã/poder/aptidão no site: rode `node ExportarOpcoes.mjs` de novo.
- Trocou os livros: rode `.venv\Scripts\python Livros.py` de novo.

## Segurança
O servidor só responde: não escreve no banco, aceita só os sites da lista, limita o tamanho da
pergunta e atende um pedido por vez. Com o PC desligado, o site mostra "IA offline" e o resto funciona.
