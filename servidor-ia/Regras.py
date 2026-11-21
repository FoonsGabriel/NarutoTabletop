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


async def personagens(regras, jogador_id):
    """({id: nome} dos personagens citados nas liberações, [nomes dos personagens de quem pergunta])."""
    ids = sorted({(r.get('dados') or {}).get('personagem_id') for r in regras} - {None, ''})
    if not configurado() or not (ids or jogador_id):
        return {}, []
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            citados = await _get(c, 'characters', {'id': f'in.({",".join(map(str, ids))})', 'select': 'id,name'}) if ids else []
            meus = await _get(c, 'characters', {'owner_id': f'eq.{jogador_id}', 'select': 'name'}) if jogador_id else []
    except (httpx.HTTPError, ValueError) as e:
        print(f'[regras] não consegui ler os personagens: {e}', flush=True)
        return {}, []
    return {str(x['id']): x.get('name') or '?' for x in citados}, [x.get('name') for x in meus if x.get('name')]


def para_prompt(regras, nomes, eh_mestre, nomes_personagens=None, meus=()):
    """Bloco de texto para a IA. nomes: {id: nome} dos poderes/aptidões; nomes_personagens: {id: nome};
    meus: personagens de quem pergunta (para responder "posso usar X?")."""
    if not regras:
        return ''
    nomes_personagens = nomes_personagens or {}
    linhas = []
    for r in regras:
        texto = r.get('texto', '').strip()
        if r.get('tipo') == 'liberar':
            dados = r.get('dados') or {}
            itens = ', '.join(nomes.get(i, i) for i in dados.get('itens', []))
            pid = dados.get('personagem_id')
            quem = f'só para o personagem {nomes_personagens.get(str(pid), "escolhido pelo Mestre")}' if pid else 'para todos os personagens da mesa'
            texto += f' (libera {itens} mesmo sendo de outro clã, {quem})'
        marca = '' if r.get('visivel') or eh_mestre else ' [OCULTA]'
        linhas.append(f'- {texto}{marca}')
    aviso = ('Quem pergunta é o Mestre: pode dizer que é uma regra da mesa.' if eh_mestre else
             'Regras marcadas [OCULTA]: aplique na resposta como se fosse a regra, mas NUNCA diga que existe uma regra '
             'do Mestre nem cite essas regras. As outras você pode chamar de "regra da mesa".')
    if meus and not eh_mestre:
        aviso += f'\nQuem pergunta joga com: {", ".join(meus)}.'
    aviso += ('\nSe a pergunta for "posso usar/pegar X?", comece com "Sim" ou "Não" seguindo as regras da mesa acima '
              '(uma liberação vale para o personagem dela) e depois resuma a regra de X pelos livros.')
    return ('REGRAS DA MESA (definidas pelo Mestre; valem MAIS que o livro quando falam do mesmo assunto):\n'
            + '\n'.join(linhas) + '\n' + aviso)
