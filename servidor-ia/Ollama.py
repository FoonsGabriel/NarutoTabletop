"""Conversa com o Ollama (texto e embeddings) pela API local."""
import json

import httpx

import Config


class OllamaErro(RuntimeError):
    pass


# -1 = manter os modelos carregados enquanto o Ollama estiver aberto.
MANTER = -1

# Com um modelo de texto grande (ex.: qwen3:14b numa placa de 8 GB), a busca roda no processador
# para deixar a memória da placa de vídeo toda para o modelo de texto.
OPCOES_BUSCA = {'options': {'num_gpu': 0}} if Config.BUSCA_NA_CPU else {}


async def aquecer():
    """Carrega os dois modelos na memória logo ao abrir o servidor, para a 1ª pergunta não demorar."""
    async with httpx.AsyncClient(timeout=600) as c:
        await c.post(f'{Config.OLLAMA_URL}/api/embed', json={'model': Config.MODELO_BUSCA, 'input': ['aquecer'], 'keep_alive': MANTER, **OPCOES_BUSCA})
        await c.post(f'{Config.OLLAMA_URL}/api/chat', json={
            'model': Config.MODELO_TEXTO, 'messages': [{'role': 'user', 'content': 'oi'}],
            'stream': False, 'think': False, 'keep_alive': MANTER,
            'options': {'num_ctx': Config.CONTEXTO, 'num_predict': 1},
        })


async def embeddings(textos, cliente=None):
    """Lista de textos -> lista de vetores (números) para a busca."""
    dono = cliente is None
    cliente = cliente or httpx.AsyncClient(timeout=Config.TEMPO_LIMITE)
    try:
        r = await cliente.post(f'{Config.OLLAMA_URL}/api/embed', json={'model': Config.MODELO_BUSCA, 'input': textos, 'keep_alive': MANTER, **OPCOES_BUSCA})
        if r.status_code != 200:
            raise OllamaErro(f'Ollama (embed) respondeu {r.status_code}: {r.text[:200]}')
        return r.json()['embeddings']
    except httpx.HTTPError as e:
        raise OllamaErro(f'Não consegui falar com o Ollama em {Config.OLLAMA_URL}: {e}') from e
    finally:
        if dono:
            await cliente.aclose()


async def conversar(mensagens, formato=None, cliente=None, temperatura=0.3):
    """Mensagens no formato do chat -> texto da resposta. formato='json' pede JSON puro."""
    dono = cliente is None
    cliente = cliente or httpx.AsyncClient(timeout=Config.TEMPO_LIMITE)
    corpo = {
        'model': Config.MODELO_TEXTO,
        'messages': mensagens,
        'stream': False,
        'keep_alive': MANTER,  # fica carregado na memória (não recarrega a cada pergunta)
        'think': False,  # Qwen3: responde direto, sem o "pensamento" longo (mais rápido)
        'options': {'num_ctx': Config.CONTEXTO, 'temperature': temperatura},
    }
    if formato:
        corpo['format'] = formato
    try:
        r = await cliente.post(f'{Config.OLLAMA_URL}/api/chat', json=corpo)
        if r.status_code != 200:
            raise OllamaErro(f'Ollama (chat) respondeu {r.status_code}: {r.text[:200]}')
        return r.json()['message']['content']
    except httpx.HTTPError as e:
        raise OllamaErro(f'Não consegui falar com o Ollama em {Config.OLLAMA_URL}: {e}') from e
    finally:
        if dono:
            await cliente.aclose()


async def conversar_em_partes(mensagens, temperatura=0.3):
    """Igual a conversar(), mas devolve o texto aos pedaços, conforme o modelo escreve."""
    corpo = {
        'model': Config.MODELO_TEXTO,
        'messages': mensagens,
        'stream': True,
        'keep_alive': MANTER,
        'think': False,
        'options': {'num_ctx': Config.CONTEXTO, 'temperature': temperatura},
    }
    try:
        async with httpx.AsyncClient(timeout=Config.TEMPO_LIMITE) as cliente:
            async with cliente.stream('POST', f'{Config.OLLAMA_URL}/api/chat', json=corpo) as r:
                if r.status_code != 200:
                    raise OllamaErro(f'Ollama (chat) respondeu {r.status_code}: {(await r.aread())[:200]!r}')
                async for linha in r.aiter_lines():
                    if not linha:
                        continue
                    dados = json.loads(linha)
                    pedaco = dados.get('message', {}).get('content', '')
                    if pedaco:
                        yield pedaco
                    if dados.get('done'):
                        break
    except httpx.HTTPError as e:
        raise OllamaErro(f'Não consegui falar com o Ollama em {Config.OLLAMA_URL}: {e}') from e


async def online():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f'{Config.OLLAMA_URL}/api/tags')
            nomes = [m.get('name', '') for m in r.json().get('models', [])]
            return {'ok': True, 'modelos': nomes}
    except Exception as e:  # noqa: BLE001 — qualquer falha = offline
        return {'ok': False, 'erro': str(e)}
