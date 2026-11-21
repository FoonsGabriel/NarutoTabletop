"""Regras da mesa (PLANEJAMENTO-IA seção 5): lê as regras do Mestre no Supabase.

Valem as regras da mesa + as "todas as minhas mesas" do Mestre dela. Guarda por alguns segundos
para não consultar o banco a cada pergunta. Sem Supabase configurado, devolve lista vazia.
"""
import time

import httpx

import Config

_cache = {}  # room_id -> (quando, regras)


def configurado():
    return bool(Config.SUPABASE_URL and Config.SUPABASE_CHAVE)


async def _get(cliente, tabela, params):
    r = await cliente.get(f'{Config.SUPABASE_URL}/rest/v1/{tabela}', params=params, headers={
        'apikey': Config.SUPABASE_CHAVE, 'Authorization': f'Bearer {Config.SUPABASE_CHAVE}'})
    r.raise_for_status()
    return r.json()


async def da_mesa(room_id):
    """[{texto, tipo, dados, visivel, room_id}, ...] — vazio se não der para ler."""
    if not room_id or not configurado():
        return []
    agora = time.monotonic()
    if room_id in _cache and agora - _cache[room_id][0] < Config.REGRAS_CACHE_SEGUNDOS:
        return _cache[room_id][1]
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            sala = await _get(c, 'rooms', {'id': f'eq.{room_id}', 'select': 'gm_id'})
            gm = sala[0]['gm_id'] if sala else None
            filtro = f'(room_id.eq.{room_id},and(room_id.is.null,mestre_id.eq.{gm}))' if gm else f'(room_id.eq.{room_id})'
            regras = await _get(c, 'regras_mesa', {'or': filtro, 'select': 'texto,tipo,dados,visivel,room_id', 'order': 'created_at.asc'})
    except (httpx.HTTPError, KeyError, ValueError) as e:
        print(f'[regras] não consegui ler as regras da mesa {room_id}: {e}', flush=True)
        return []
    _cache[room_id] = (agora, regras)
    return regras


def para_prompt(regras, nomes, eh_mestre):
    """Bloco de texto para a IA. nomes: {id: nome} dos poderes/aptidões."""
    if not regras:
        return ''
    linhas = []
    for r in regras:
        texto = r.get('texto', '').strip()
        if r.get('tipo') == 'liberar':
            itens = ', '.join(nomes.get(i, i) for i in (r.get('dados') or {}).get('itens', []))
            texto += f' (libera {itens} mesmo sendo de outro clã)'
        marca = '' if r.get('visivel') or eh_mestre else ' [OCULTA]'
        linhas.append(f'- {texto}{marca}')
    aviso = ('Quem pergunta é o Mestre: pode dizer que é uma regra da mesa.' if eh_mestre else
             'Regras marcadas [OCULTA]: aplique na resposta como se fosse a regra, mas NUNCA diga que existe uma regra '
             'do Mestre nem cite essas regras. As outras você pode chamar de "regra da mesa".')
    return ('REGRAS DA MESA (definidas pelo Mestre; valem MAIS que o livro quando falam do mesmo assunto):\n'
            + '\n'.join(linhas) + '\n' + aviso)
