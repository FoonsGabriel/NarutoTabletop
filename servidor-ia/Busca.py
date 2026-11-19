"""Busca nos livros: acha os trechos mais parecidos com a pergunta."""
import json

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
        return self.pronto

    async def buscar(self, pergunta: str, quantos: int = Config.TRECHOS):
        if not self.pronto:
            return []
        [vetor] = await Ollama.embeddings([pergunta])
        v = np.asarray(vetor, dtype=np.float32)
        v /= np.linalg.norm(v) + 1e-9
        notas = self.vetores @ v
        melhores = np.argsort(-notas)[:quantos]
        return [{**self.trechos[i], 'nota': float(notas[i])} for i in melhores]


INDICE = Indice()
