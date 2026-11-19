"""Configuração do servidor de IA do Sessão Zero (roda no PC do Gabriel).

Tudo pode ser trocado por variável de ambiente, sem mexer no código.
"""
import os
from pathlib import Path

PASTA = Path(__file__).resolve().parent

# Ollama (instalado no PC). Modelos: texto e "embedding" (transforma texto em números para a busca).
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
MODELO_TEXTO = os.getenv('MODELO_TEXTO', 'qwen3:8b')       # se faltar memória: qwen3:4b
MODELO_BUSCA = os.getenv('MODELO_BUSCA', 'bge-m3')         # bom em português
CONTEXTO = int(os.getenv('CONTEXTO', '8192'))              # tamanho da "memória" de cada pergunta

# Livros (PDFs) e o índice de busca gerado a partir deles. Os dois ficam fora do GitHub.
PASTA_LIVROS = Path(os.getenv('PASTA_LIVROS', PASTA / 'livros'))
PASTA_INDICE = Path(os.getenv('PASTA_INDICE', PASTA / 'indice'))

# Nome bonito de cada livro (pelo nome do arquivo, sem diferenciar maiúsculas). O resto usa o nome do arquivo.
NOMES_LIVROS = {
    'basico': 'Livro Básico',
    'hijutsus 4.1b': 'Livro de Hijutsus 4.1b',
    'hijutsus vol': 'Livro de Hijutsus Vol. 2',
}

# Segurança (PLANEJAMENTO-IA seção 5): o servidor não escreve no banco; só responde.
SITES_PERMITIDOS = [s.strip() for s in os.getenv(
    'SITES_PERMITIDOS',
    'https://naruto-tabletop.vercel.app,https://sessaozerorpg.com.br,https://www.sessaozerorpg.com.br,http://localhost:5173,https://localhost:5173',
).split(',') if s.strip()]
TAMANHO_MAXIMO = int(os.getenv('TAMANHO_MAXIMO', '1200'))  # caracteres por pergunta
FILA_MAXIMA = int(os.getenv('FILA_MAXIMA', '30'))          # pedidos esperando ao mesmo tempo
TEMPO_LIMITE = int(os.getenv('TEMPO_LIMITE', '180'))       # segundos por resposta
TRECHOS = int(os.getenv('TRECHOS', '6'))                   # quantos trechos do livro vão junto na pergunta
