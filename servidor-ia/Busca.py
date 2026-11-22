"""Busca nos livros: acha os trechos mais parecidos com a pergunta.

Mistura duas notas: o significado (vetores do bge-m3) e as palavras da pergunta que aparecem no trecho
(avaliação de 21/11: "pré-requisito do Hachimon Tonkou" não achava a pág. 202, que tem as duas coisas).
"""
import json
import re
import unicodedata

import numpy as np

import Config
import Ollama


class Indice:
    def __init__(self):
        self.vetores = None
        self.trechos = []

    @property
    def pronto(self):
        return self.vetores is not None and len(self.trechos) > 0

    def carregar(self):
        arq_v = Config.PASTA_INDICE / 'Vetores.npy'
        arq_t = Config.PASTA_INDICE / 'Trechos.json'
        if arq_v.exists() and arq_t.exists():
            self.vetores = np.load(arq_v)
            self.trechos = json.loads(arq_t.read_text(encoding='utf-8'))
            self.textos = [_norm(t['texto']) for t in self.trechos]
            # Títulos (NOMES EM MAIÚSCULAS) de cada trecho: é onde a regra de uma técnica/poder começa.
            # Páginas de índice (até a 10) ficam de fora: têm o nome de tudo em maiúsculas.
            self.titulos = ['' if t['pagina'] <= 10 else _norm(' '.join(re.findall(r'[A-ZÀ-Ý][A-ZÀ-Ý0-9\'’ -]{3,}', t['texto'])))
                            for t in self.trechos]
        return self.pronto

    async def buscar(self, pergunta: str, quantos: int = Config.TRECHOS):
        if not self.pronto:
            return []
        [vetor] = await Ollama.embeddings([pergunta])
        v = np.asarray(vetor, dtype=np.float32)
        v /= np.linalg.norm(v) + 1e-9
        notas = self.vetores @ v
        palavras = palavras_chave(pergunta)
        if palavras and Config.PESO_PALAVRAS:
            # Raiz de 6 letras: "esquivar" acha "esquiva", "requisito" acha "requisitos".
            raizes = [w[:6] for w in palavras]
            fracao = np.array([sum(r in txt for r in raizes) / len(raizes) for txt in self.textos], dtype=np.float32)
            notas = notas + Config.PESO_PALAVRAS * fracao
        # Nome próprio da pergunta (ex.: "Hachimon Tonkou") escrito como título no trecho: é a regra dele.
        # Avaliação de 21/11: a pág. 202 tem o título do Hachimon no fim de um trecho sobre Dokujutsu.
        nomes = [_norm(n) for n in re.findall(r'[A-Z][\w\'’]+(?:\s+(?:no\s+|de\s+)?[A-Z][\w\'’]+)*', pergunta)
                 if len(n) >= 5 and _norm(n) not in _VAZIAS]
        if nomes and Config.PESO_TITULO:
            notas = notas + Config.PESO_TITULO * np.array(
                [1.0 if any(n in tit for n in nomes) else 0.0 for tit in self.titulos], dtype=np.float32)
        melhores = [int(i) for i in np.argsort(-notas)[:quantos]]
        # Regras costumam continuar no trecho seguinte (ex.: o cansaço do Hachimon fica na página depois).
        # Junta o trecho vizinho dos 3 melhores, logo depois dele.
        escolhidos = []
        for pos, i in enumerate(melhores):
            if i not in escolhidos:
                escolhidos.append(i)
            vizinho = i + 1
            if pos < Config.VIZINHOS and vizinho < len(self.trechos) and vizinho not in escolhidos \
                    and self.trechos[vizinho]['livro'] == self.trechos[i]['livro']:
                escolhidos.append(vizinho)
        return [{**self.trechos[i], 'nota': float(notas[i])} for i in escolhidos]


def _norm(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


# Palavras que não ajudam a achar a regra.
_VAZIAS = set('''qual quais como quanto quanta quantos quantas quando onde porque para pelo pela pelos pelas
posso pode podem fazer faz tenho tem esta este essa esse isso isto aquele aquela minha meu meus minhas
seu sua seus suas voce voces quem sobre funciona acontece usar usando uma umas uns sao ser estar ficar fica
dele dela deles delas mais menos muito pouco depois antes ainda entao tambem livro regra regras'''.split())


def palavras_chave(pergunta):
    return [w for w in re.findall(r'[a-z0-9]+', _norm(pergunta)) if len(w) >= 4 and w not in _VAZIAS]


INDICE = Indice()
