"""Fila com prioridade (PLANEJAMENTO-IA seção 5): a placa de vídeo responde um pedido por vez.

Prioridade: 1) Mestre · 2) pergunta de dentro de uma mesa · 3) o resto.
Dentro da mesma prioridade, quem chegou primeiro é atendido primeiro.
"""
import asyncio
import itertools

import Config

PRIORIDADE = {'mestre': 0, 'mesa': 1, 'geral': 2}


class FilaCheia(RuntimeError):
    pass


class Fila:
    def __init__(self):
        self.fila = asyncio.PriorityQueue()
        self.contador = itertools.count()
        self.trabalhador = None
        self.em_andamento = 0

    def iniciar(self):
        if self.trabalhador is None:
            self.trabalhador = asyncio.create_task(self._trabalhar())

    @property
    def tamanho(self):
        return self.fila.qsize() + self.em_andamento

    async def executar(self, papel, tarefa):
        """Põe a tarefa (função async sem argumentos) na fila e espera o resultado."""
        if self.fila.qsize() >= Config.FILA_MAXIMA:
            raise FilaCheia('A IA está com muitos pedidos agora. Tente de novo em instantes.')
        futuro = asyncio.get_running_loop().create_future()
        await self.fila.put((PRIORIDADE.get(papel, 2), next(self.contador), tarefa, futuro))
        return await futuro

    async def _trabalhar(self):
        while True:
            _, _, tarefa, futuro = await self.fila.get()
            if futuro.cancelled():
                continue
            self.em_andamento = 1
            try:
                futuro.set_result(await asyncio.wait_for(tarefa(), Config.TEMPO_LIMITE))
            except Exception as e:  # noqa: BLE001 — o erro volta para quem pediu
                if not futuro.done():
                    futuro.set_exception(e)
            finally:
                self.em_andamento = 0


FILA = Fila()
