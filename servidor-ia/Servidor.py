"""Servidor de IA do Sessão Zero (FastAPI). Roda no PC; o site chama pelo túnel da Cloudflare.

Iniciar:  uvicorn Servidor:app --host 127.0.0.1 --port 8000
Rotas:
  GET  /saude      → se a IA está pronta (Ollama, modelos, índice dos livros, fila)
  POST /perguntar  → dúvida de regra, respondida com os trechos dos livros e as páginas
  POST /ficha      → sugestão de ficha (o site confere tudo antes de usar)
"""
import json
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import Config
import Ollama
import Prompts
from Busca import INDICE
from Fila import FILA, FilaCheia

ATRIBUTOS = ['forca', 'destreza', 'agilidade', 'percepcao', 'inteligencia', 'vigor', 'espirito']
OPCOES = json.loads((Config.PASTA / 'dados' / 'Opcoes.json').read_text(encoding='utf-8'))
NOMES_APTIDOES = {a['id']: a['nome'] for a in OPCOES['aptidoes']}
IDS_APTIDOES = set(NOMES_APTIDOES)
PODERES = {p['id']: p for p in OPCOES['poderes']}


@asynccontextmanager
async def ciclo(_app):
    INDICE.carregar()
    FILA.iniciar()
    yield


app = FastAPI(title='IA do Sessão Zero', lifespan=ciclo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.SITES_PERMITIDOS,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)


class Pergunta(BaseModel):
    pergunta: str = Field(min_length=3)
    papel: str = 'geral'           # mestre | mesa | geral (prioridade na fila)
    historico: list[dict] = []     # últimas mensagens da conversa [{"role": "user"|"assistant", "content": "..."}]


class PedidoFicha(BaseModel):
    descricao: str = Field(min_length=3)
    nc: int = 4
    papel: str = 'geral'


def conferir_tamanho(texto):
    if len(texto) > Config.TAMANHO_MAXIMO:
        raise HTTPException(413, f'Pergunta grande demais (máximo {Config.TAMANHO_MAXIMO} caracteres).')


async def na_fila(papel, tarefa):
    try:
        return await FILA.executar(papel, tarefa)
    except FilaCheia as e:
        raise HTTPException(503, str(e)) from e
    except Ollama.OllamaErro as e:
        raise HTTPException(503, f'IA indisponível: {e}') from e


@app.get('/saude')
async def saude():
    ollama = await Ollama.online()
    return {
        'ok': ollama['ok'] and INDICE.pronto,
        'ollama': ollama,
        'livros': len({t['livro'] for t in INDICE.trechos}) if INDICE.pronto else 0,
        'trechos': len(INDICE.trechos),
        'fila': FILA.tamanho,
        'modelos': {'texto': Config.MODELO_TEXTO, 'busca': Config.MODELO_BUSCA},
    }


@app.post('/perguntar')
async def perguntar(p: Pergunta):
    conferir_tamanho(p.pergunta)
    if not INDICE.pronto:
        raise HTTPException(503, 'Os livros ainda não foram lidos. Rode "python Livros.py" no PC.')

    async def tarefa():
        trechos = await INDICE.buscar(p.pergunta)
        historico = [m for m in p.historico[-6:] if m.get('role') in ('user', 'assistant') and isinstance(m.get('content'), str)]
        mensagens = [
            {'role': 'system', 'content': Prompts.REGRAS},
            *[{'role': m['role'], 'content': m['content'][:Config.TAMANHO_MAXIMO]} for m in historico],
            {'role': 'user', 'content': f'TRECHOS DOS LIVROS:\n{Prompts.montar_contexto(trechos)}\n\nPERGUNTA: {p.pergunta}'},
        ]
        resposta = await Ollama.conversar(mensagens)
        fontes = sorted({(t['livro'], t['pagina']) for t in trechos[:4]})
        return {
            'resposta': limpar_resposta(resposta),
            'fontes': [{'livro': l, 'pagina': pg} for l, pg in fontes],
        }

    return await na_fila(p.papel, tarefa)


def opcoes_compactas():
    clas = ', '.join(OPCOES['clas'])
    apts = '\n'.join(f"- {a['id']}: {a['nome']}" for a in OPCOES['aptidoes'])
    pods = '\n'.join(
        f"- {p['id']}: {p['nome']}" + (f" (restrito, clã {p['cla']})" if p.get('cla') else '')
        for p in OPCOES['poderes']
    )
    return f'CLÃS: {clas}\nVILAS: {", ".join(OPCOES["vilas"])}\n\nAPTIDÕES:\n{apts}\n\nPODERES:\n{pods}'


def pontos_atributo(nc):
    # Ficha inicial (NC 4): 12 pontos; cada NC acima dá +6 (mesma conta da ficha do site).
    return 12 + 6 * max(0, nc - 4)


def pontos_poder(nc):
    # NC 4: 4 pontos; cada NC acima dá +2.
    return 4 + 2 * max(0, nc - 4)


def conferir_ficha(s, nc):
    """Confere a sugestão contra as regras básicas e as opções reais. O site confere de novo."""
    avisos = []
    limite = max(4, nc)
    total = pontos_atributo(nc)
    attrs = {k: max(0, min(limite, int(s.get('atributos', {}).get(k, 0) or 0))) for k in ATRIBUTOS}
    if sum(attrs.values()) != total:
        avisos.append(f'Atributos somam {sum(attrs.values())} (o certo é {total}); ajuste na ficha.')
    cla = s.get('cla') if s.get('cla') in OPCOES['clas'] else ''
    if s.get('cla') and not cla:
        avisos.append(f'Clã "{s.get("cla")}" não existe na lista; escolha na ficha.')
    apts = [a for a in s.get('aptidoes_gratuitas', []) if a in IDS_APTIDOES][:3]
    if len(apts) < 3:
        avisos.append('Faltam aptidões gratuitas válidas; complete na ficha.')
    poderes = []
    for item in s.get('poderes', []):
        pid = item.get('id') if isinstance(item, dict) else None
        info = PODERES.get(pid)
        if not info:
            continue
        if info.get('cla') and info['cla'] != cla:
            avisos.append(f'{info["nome"]} é do clã {info["cla"]}; tirei da sugestão.')
            continue
        poderes.append({'id': pid, 'nome': info['nome'], 'nivel': max(1, int(item.get('nivel', 1) or 1))})
    vila = s.get('vila') if s.get('vila') in OPCOES['vilas'] else ''
    return {
        'nome': str(s.get('nome', ''))[:60],
        'cla': cla,
        'vila': vila,
        'conceito': str(s.get('conceito', ''))[:400],
        'historia': str(s.get('historia', ''))[:1500],
        'atributos': attrs,
        'aptidoes_gratuitas': apts,
        'aptidoes_nomes': [NOMES_APTIDOES[a] for a in apts],
        'poderes': poderes,
        'explicacao': str(s.get('explicacao', ''))[:500],
        'avisos': avisos,
    }


@app.post('/ficha')
async def ficha(p: PedidoFicha):
    conferir_tamanho(p.descricao)
    nc = max(4, min(20, p.nc))

    async def tarefa():
        sistema = Prompts.FICHA.format(nc=nc, pontos_atributos=pontos_atributo(nc), max_atributo=max(4, nc), pontos_poder=pontos_poder(nc), opcoes=opcoes_compactas())
        bruto = await Ollama.conversar(
            [{'role': 'system', 'content': sistema}, {'role': 'user', 'content': p.descricao}],
            formato='json',
        )
        try:
            sugestao = json.loads(bruto)
        except json.JSONDecodeError as e:
            raise HTTPException(502, 'A IA não devolveu uma ficha válida. Tente descrever de outro jeito.') from e
        return conferir_ficha(sugestao, nc)

    return await na_fila(p.papel, tarefa)


def limpar_resposta(texto):
    # Alguns modelos devolvem o "pensamento" entre <think>...</think>: não mostra para o jogador.
    return re.sub(r'<think>.*?</think>', '', texto, flags=re.S).strip()
