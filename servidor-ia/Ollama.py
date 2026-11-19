"""Conversa com o Ollama (texto e embeddings) pela API local."""
import httpx

import Config


class OllamaErro(RuntimeError):
    pass


async def embeddings(textos, cliente=None):
    """Lista de textos -> lista de vetores (números) para a busca."""
    dono = cliente is None
    cliente = cliente or httpx.AsyncClient(timeout=Config.TEMPO_LIMITE)
    try:
        r = await cliente.post(f'{Config.OLLAMA_URL}/api/embed', json={'model': Config.MODELO_BUSCA, 'input': textos})
        if r.status_code != 200:
            raise OllamaErro(f'Ollama (embed) respondeu {r.status_code}: {r.text[:200]}')
        return r.json()['embeddings']
    except httpx.HTTPError as e:
        raise OllamaErro(f'Não consegui falar com o Ollama em {Config.OLLAMA_URL}: {e}') from e
    finally:
        if dono:
            await cliente.aclose()


async def conversar(mensagens, formato=None, cliente=None):
    """Mensagens no formato do chat -> texto da resposta. formato='json' pede JSON puro."""
    dono = cliente is None
    cliente = cliente or httpx.AsyncClient(timeout=Config.TEMPO_LIMITE)
    corpo = {
        'model': Config.MODELO_TEXTO,
        'messages': mensagens,
        'stream': False,
        'think': False,  # Qwen3: responde direto, sem o "pensamento" longo (mais rápido)
        'options': {'num_ctx': Config.CONTEXTO, 'temperature': 0.3},
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


async def online():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f'{Config.OLLAMA_URL}/api/tags')
            nomes = [m.get('name', '') for m in r.json().get('models', [])]
            return {'ok': True, 'modelos': nomes}
    except Exception as e:  # noqa: BLE001 — qualquer falha = offline
        return {'ok': False, 'erro': str(e)}
