"""Configuração do servidor de IA do Sessão Zero (roda no PC do Gabriel).

Tudo pode ser trocado por variável de ambiente, sem mexer no código.
"""
import os
from pathlib import Path

PASTA = Path(__file__).resolve().parent

# Ollama (instalado no PC). Modelos: texto e "embedding" (transforma texto em números para a busca).
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434')
# Modelo de texto: o TROCAR-MODELO.bat grava o escolhido em dados/Modelo.txt.
_arquivo_modelo = Path(__file__).parent / 'dados' / 'Modelo.txt'
_modelo_salvo = _arquivo_modelo.read_text(encoding='utf-8').strip() if _arquivo_modelo.exists() else ''
MODELO_TEXTO = os.getenv('MODELO_TEXTO') or _modelo_salvo or 'qwen3:8b'   # se faltar memória: qwen3:4b
MODELO_BUSCA = os.getenv('MODELO_BUSCA', 'bge-m3')         # bom em português
# Busca no processador (avaliação de 21/11): com a busca na placa de vídeo, o qwen3:8b + bge-m3 passam dos
# 8 GB e parte do modelo de texto vai para o processador (respostas de 60–90 s). A busca de uma pergunta
# curta no processador leva menos de 1 s. Para voltar à placa de vídeo: set BUSCA_NA_CPU=0.
BUSCA_NA_CPU = os.getenv('BUSCA_NA_CPU', 'sim').lower() in ('1', 'sim', 'true')
CONTEXTO = int(os.getenv('CONTEXTO', '8192'))              # tamanho da "memória" de cada pergunta

# Livros (PDFs) e o índice de busca gerado a partir deles. Os dois ficam fora do GitHub.
PASTA_LIVROS = Path(os.getenv('PASTA_LIVROS', PASTA / 'livros'))
PASTA_INDICE = Path(os.getenv('PASTA_INDICE', PASTA / 'indice'))

# Nome bonito de cada livro (pelo nome do arquivo). Arquivos que não batem usam o próprio nome.
# Cada regra: todas as palavras precisam estar no nome do arquivo (sem acento). A primeira que bate vale.
NOMES_LIVROS = [
    (('hijutsu', 'vol'), 'Livro de Hijutsus Vol. 2'),
    (('hijutsu',), 'Livro de Hijutsus 4.1b'),
    (('basico',), 'Livro Básico'),
]

# Segurança (PLANEJAMENTO-IA seção 5): o servidor não escreve no banco; só responde.
SITES_PERMITIDOS = [s.strip() for s in os.getenv(
    'SITES_PERMITIDOS',
    'https://naruto-tabletop.vercel.app,https://sessaozerorpg.com.br,https://www.sessaozerorpg.com.br,http://localhost:5173,https://localhost:5173',
).split(',') if s.strip()]
TAMANHO_MAXIMO = int(os.getenv('TAMANHO_MAXIMO', '1200'))  # caracteres por pergunta
FILA_MAXIMA = int(os.getenv('FILA_MAXIMA', '30'))          # pedidos esperando ao mesmo tempo
TEMPO_LIMITE = int(os.getenv('TEMPO_LIMITE', '300' if MODELO_TEXTO.endswith((':4b', ':8b')) else '480'))  # segundos por resposta (modelo grande é mais lento)
PESO_PALAVRAS = float(os.getenv('PESO_PALAVRAS', '0.15'))
PESO_TITULO = float(os.getenv('PESO_TITULO', '0.1'))       # busca: bônus quando o nome da pergunta é título no trecho
TEMPERATURA_REGRAS = float(os.getenv('TEMPERATURA_REGRAS', '0.1'))  # baixo = copia os números do livro, inventa menos  # busca: bônus para trecho que tem as palavras da pergunta
TRECHOS = int(os.getenv('TRECHOS', '8'))                   # quantos trechos do livro vão junto na pergunta
VIZINHOS = int(os.getenv('VIZINHOS', '3'))                 # dos melhores trechos, quantos levam junto o trecho seguinte


# Regras da mesa: o servidor lê as regras do Mestre direto do Supabase (as ocultas não passam pelo
# navegador do jogador). Endereço e chave PÚBLICA (anon) vêm do .env.local do site, lido sozinho.
def _ler_env_local():
    arquivo = PASTA.parent / '.env.local'
    valores = {}
    if arquivo.exists():
        for linha in arquivo.read_text(encoding='utf-8', errors='ignore').splitlines():
            if '=' in linha and not linha.strip().startswith('#'):
                k, v = linha.split('=', 1)
                valores[k.strip()] = v.strip().strip('"').strip("'")
    return valores


_env_site = _ler_env_local()
SUPABASE_URL = (os.getenv('SUPABASE_URL') or _env_site.get('VITE_SUPABASE_URL', '')).rstrip('/')
SUPABASE_CHAVE = os.getenv('SUPABASE_CHAVE') or _env_site.get('VITE_SUPABASE_ANON_KEY', '')
REGRAS_CACHE_SEGUNDOS = 20

# Ajuda da ficha: trechos do livro do clã/poderes que vão junto (poucos e curtos para caber na memória do modelo).
TRECHOS_FICHA = int(os.getenv('TRECHOS_FICHA', '4'))
TAMANHO_TRECHO_FICHA = int(os.getenv('TAMANHO_TRECHO_FICHA', '700'))
