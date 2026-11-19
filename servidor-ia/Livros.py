"""Lê os PDFs dos livros e monta o índice de busca (rodar uma vez, e de novo se trocar os livros).

Uso:  python Livros.py            (lê a pasta livros/)
      python Livros.py C:\\pasta\\com\\os\\pdfs
"""
import asyncio
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
from pypdf import PdfReader

import Config
import Ollama

TAMANHO = 900      # caracteres por trecho
SOBRA = 150        # pedaço repetido entre trechos vizinhos (não corta uma regra no meio)
LOTE = 32          # trechos por chamada de embedding


def nome_do_livro(arquivo: Path) -> str:
    sem_acento = lambda t: ''.join(c for c in unicodedata.normalize('NFD', t.lower()) if unicodedata.category(c) != 'Mn')
    base = sem_acento(arquivo.stem)
    for chave, nome in Config.NOMES_LIVROS.items():
        if chave in base:
            return nome
    return arquivo.stem


def limpar(texto: str) -> str:
    texto = texto.replace('\u00ad', '')                  # hífen invisível
    texto = re.sub(r'-\n(\w)', r'\1', texto)             # palavra quebrada no fim da linha
    texto = re.sub(r'[ \t]+', ' ', texto)
    texto = re.sub(r'\n{2,}', '\n', texto)
    return texto.strip()


def trechos_da_pagina(texto: str):
    if len(texto) <= TAMANHO:
        return [texto] if texto else []
    partes, i = [], 0
    while i < len(texto):
        fim = min(len(texto), i + TAMANHO)
        # termina num fim de frase ou de linha, se der
        corte = max(texto.rfind('. ', i, fim), texto.rfind('\n', i, fim))
        if corte > i + TAMANHO // 2 and fim < len(texto):
            fim = corte + 1
        partes.append(texto[i:fim].strip())
        if fim >= len(texto):
            break
        i = max(fim - SOBRA, i + 1)
    return partes


def ler_livros(pasta: Path):
    pdfs = sorted(pasta.glob('*.pdf'))
    if not pdfs:
        raise SystemExit(f'Nenhum PDF em {pasta}. Coloque os livros lá (eles não vão para o GitHub).')
    itens, sem_texto = [], []
    for pdf in pdfs:
        livro = nome_do_livro(pdf)
        leitor = PdfReader(str(pdf))
        vazias = 0
        for numero, pagina in enumerate(leitor.pages, start=1):
            texto = limpar(pagina.extract_text() or '')
            if len(texto) < 40:
                vazias += 1
                continue
            for parte in trechos_da_pagina(texto):
                itens.append({'livro': livro, 'pagina': numero, 'texto': parte})
        if vazias > len(leitor.pages) * 0.5:
            sem_texto.append(pdf.name)
        print(f'  {livro}: {len(leitor.pages)} páginas')
    if sem_texto:
        print('ATENÇÃO: estes PDFs parecem ser imagem (sem texto). Precisam de OCR antes:', ', '.join(sem_texto))
    return itens


async def montar(pasta: Path):
    print(f'Lendo os livros em {pasta} ...')
    itens = ler_livros(pasta)
    print(f'{len(itens)} trechos. Gerando o índice com {Config.MODELO_BUSCA} (pode levar alguns minutos)...')
    vetores = []
    for i in range(0, len(itens), LOTE):
        lote = [f"{x['livro']}, pág. {x['pagina']}: {x['texto']}" for x in itens[i:i + LOTE]]
        vetores.extend(await Ollama.embeddings(lote))
        print(f'  {min(i + LOTE, len(itens))}/{len(itens)}', end='\r')
    matriz = np.asarray(vetores, dtype=np.float32)
    matriz /= np.linalg.norm(matriz, axis=1, keepdims=True) + 1e-9
    Config.PASTA_INDICE.mkdir(parents=True, exist_ok=True)
    np.save(Config.PASTA_INDICE / 'Vetores.npy', matriz)
    (Config.PASTA_INDICE / 'Trechos.json').write_text(json.dumps(itens, ensure_ascii=False), encoding='utf-8')
    print(f'\nPronto: índice salvo em {Config.PASTA_INDICE}')


if __name__ == '__main__':
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else Config.PASTA_LIVROS
    asyncio.run(montar(destino))
