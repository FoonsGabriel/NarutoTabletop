"""Servidor de IA do Sessão Zero (FastAPI). Roda no PC; o site chama pelo túnel da Cloudflare.

Iniciar:  uvicorn Servidor:app --host 127.0.0.1 --port 8000
Rotas:
  GET  /saude      → se a IA está pronta (Ollama, modelos, índice dos livros, fila)
  POST /perguntar  → dúvida de regra, respondida com os trechos dos livros e as páginas
  POST /ficha      → sugestão de ficha (o site confere tudo antes de usar)
"""
import asyncio
import json
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
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
APTIDOES = {a['id']: a for a in OPCOES['aptidoes']}
CLAS_SEM_ACENTO = None  # preenchido depois que sem_acento existir
PODERES = {p['id']: p for p in OPCOES['poderes']}


@asynccontextmanager
async def ciclo(_app):
    INDICE.carregar()
    FILA.iniciar()
    asyncio.create_task(aquecer_modelos())  # em segundo plano: o servidor já abre na hora
    yield


async def aquecer_modelos():
    print('Carregando os modelos na memória (só na abertura)...', flush=True)
    try:
        await Ollama.aquecer()
        print('Modelos prontos! Pode perguntar.', flush=True)
    except Exception as e:  # noqa: BLE001 — se falhar, carrega na 1ª pergunta como antes
        print(f'Não consegui pré-carregar os modelos ({e}). Vão carregar na 1ª pergunta.', flush=True)


app = FastAPI(title='IA do Sessão Zero', lifespan=ciclo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.SITES_PERMITIDOS,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)


class Pergunta(BaseModel):
    pergunta: str = Field(min_length=1)
    papel: str = 'geral'           # mestre | mesa | geral (prioridade na fila)
    historico: list[dict] = []     # últimas mensagens da conversa [{"role": "user"|"assistant", "content": "..."}]


class Limites(BaseModel):
    atributos: int = 12            # pontos de atributo desta ficha (criação + evolução)
    pericias: int = 8
    poder: int = 4
    min_atributo: int = 0
    max_atributo: int = 4
    max_pericia: int = 2
    pericias_disponiveis: list[str] = []
    pericias_atributo: dict = {}   # perícia → atributo que ela usa (ex.: lidar_animais → inteligencia)


class AjudaFicha(BaseModel):
    pedido: str = Field(min_length=1)
    ficha: dict = {}               # como a ficha está agora (o site manda)
    limites: Limites = Limites()
    nc: int = 4
    papel: str = 'geral'
    livre: bool = False


class PedidoFicha(BaseModel):
    descricao: str = Field(min_length=3)
    nc: int = 4
    papel: str = 'geral'
    livre: bool = False            # o Mestre marcou "Liberar regras" na ficha: pode misturar clãs


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


def com_folego(trabalho):
    """O túnel da Cloudflare corta pedidos que ficam 100 s sem mandar nada. Para respostas demoradas
    (modelo grande montando ficha), manda um espaço a cada 10 s e no fim o JSON. JSON aceita espaços
    antes, então o site lê normal. Erros vêm como {"erro": "..."} (o código HTTP já foi 200)."""
    async def gerar():
        tarefa = asyncio.create_task(trabalho)
        while True:
            pronto, _ = await asyncio.wait({tarefa}, timeout=10)
            if pronto:
                break
            yield ' '
        try:
            yield json.dumps(tarefa.result(), ensure_ascii=False)
        except HTTPException as e:
            yield json.dumps({'erro': str(e.detail)}, ensure_ascii=False)
        except Exception as e:  # noqa: BLE001
            yield json.dumps({'erro': f'Erro no servidor da IA: {e}'}, ensure_ascii=False)

    return StreamingResponse(gerar(), media_type='application/json',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


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
        historico = [m for m in p.historico[-6:] if m.get('role') in ('user', 'assistant') and isinstance(m.get('content'), str)]
        historico = [{'role': m['role'], 'content': m['content'][:Config.TAMANHO_MAXIMO]} for m in historico]

        # "oi", "valeu", "obrigado"...: responde curto, sem buscar nos livros e sem fontes.
        if eh_conversa(p.pergunta):
            mensagens = [{'role': 'system', 'content': Prompts.CONVERSA}, *historico, {'role': 'user', 'content': p.pergunta}]
            return {'resposta': limpar_resposta(await Ollama.conversar(mensagens)), 'fontes': []}

        trechos = await INDICE.buscar(p.pergunta)
        mensagens = [
            {'role': 'system', 'content': Prompts.REGRAS},
            *historico,
            {'role': 'user', 'content': f'TRECHOS DOS LIVROS:\n{Prompts.montar_contexto(trechos)}\n\nPERGUNTA: {p.pergunta}'},
        ]
        resposta = limpar_resposta(await Ollama.conversar(mensagens))
        return {'resposta': resposta, 'fontes': fontes_citadas(resposta, trechos)}

    return com_folego(na_fila(p.papel, tarefa))


@app.post('/perguntar/partes')
async def perguntar_em_partes(p: Pergunta):
    """Igual a /perguntar, mas a resposta chega aos pedaços (uma linha JSON por pedaço):
    {"t": "texto"} ... e no fim {"fim": true, "fontes": [...]} — ou {"erro": "..."}."""
    conferir_tamanho(p.pergunta)
    if not INDICE.pronto:
        raise HTTPException(503, 'Os livros ainda não foram lidos. Rode "python Livros.py" no PC.')
    historico = [m for m in p.historico[-6:] if m.get('role') in ('user', 'assistant') and isinstance(m.get('content'), str)]
    historico = [{'role': m['role'], 'content': m['content'][:Config.TAMANHO_MAXIMO]} for m in historico]

    async def gerar():
        linha = lambda d: json.dumps(d, ensure_ascii=False) + '\n'  # noqa: E731
        try:
            async with FILA.vez(p.papel):
                if eh_conversa(p.pergunta):
                    trechos = []
                    mensagens = [{'role': 'system', 'content': Prompts.CONVERSA}, *historico, {'role': 'user', 'content': p.pergunta}]
                else:
                    trechos = await INDICE.buscar(p.pergunta)
                    mensagens = [
                        {'role': 'system', 'content': Prompts.REGRAS},
                        *historico,
                        {'role': 'user', 'content': f'TRECHOS DOS LIVROS:\n{Prompts.montar_contexto(trechos)}\n\nPERGUNTA: {p.pergunta}'},
                    ]
                texto = ''
                async for pedaco in Ollama.conversar_em_partes(mensagens):
                    texto += pedaco
                    yield linha({'t': pedaco})
                yield linha({'fim': True, 'fontes': fontes_citadas(texto, trechos) if trechos else []})
        except FilaCheia as e:
            yield linha({'erro': str(e)})
        except Ollama.OllamaErro as e:
            yield linha({'erro': f'IA indisponível: {e}'})

    return StreamingResponse(gerar(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


CONVERSAS = {
    'oi', 'ola', 'olá', 'eai', 'e ai', 'e aí', 'opa', 'salve', 'bom dia', 'boa tarde', 'boa noite',
    'valeu', 'vlw', 'obrigado', 'obrigada', 'obg', 'brigado', 'tchau', 'ok', 'blz', 'beleza', 'show', 'top',
}


def eh_conversa(texto):
    """Mensagem curta de cumprimento/agradecimento, sem pergunta de regra."""
    t = re.sub(r'[^\w\s]', '', texto.lower()).strip()
    return t in CONVERSAS or (len(t.split()) <= 2 and any(t.startswith(c) for c in CONVERSAS) and '?' not in texto)


def fontes_citadas(resposta, trechos):
    """Só as páginas que a resposta realmente citou (e que vieram da busca)."""
    citadas = set()
    # "pág. 203", "págs. 203 e 204", "pág. 202-204", "páginas 206, 207"
    for grupo in re.findall(r'p[áa]g(?:ina)?s?\.?\s*(\d+(?:\s*(?:,|e|-|–|a)\s*\d+)*)', resposta, flags=re.IGNORECASE):
        numeros = [int(n) for n in re.findall(r'\d+', grupo)]
        if re.search(r'\d\s*[-–]\s*\d', grupo) and len(numeros) == 2 and 0 <= numeros[1] - numeros[0] <= 10:
            numeros = list(range(numeros[0], numeros[1] + 1))
        citadas.update(numeros)
    fontes = sorted({(t['livro'], t['pagina']) for t in trechos if t['pagina'] in citadas})
    return [{'livro': l, 'pagina': pg} for l, pg in fontes]


def combina_cla(clas_item, clas_ficha):
    """O item (aptidão/poder) é liberado para estes clãs? clas_item vazio = qualquer um.
    clas_ficha: texto da ficha, ex.: "Aburame / Jiton" (clã + segundo clã ou hijutsu)."""
    clas_item = [clas_item] if isinstance(clas_item, str) else list(clas_item or [])
    if not clas_item:
        return True
    ficha = sem_acento(clas_ficha or '')
    return any(sem_acento(c) in ficha for c in clas_item if c)


def opcoes_compactas(clas_ficha='', livre=False):
    """Opções para a IA. Itens de clã só entram se forem do clã da ficha (ou se o Mestre liberou),
    para a lista não ficar enorme."""
    clas = ', '.join(OPCOES['clas'])
    pode = lambda x: livre or combina_cla(x.get('cla'), clas_ficha)  # noqa: E731
    # Aptidões de clã são muitas (mais de 100): mesmo com regras liberadas, só as dos clãs da ficha/pedido.
    pode_apt = lambda x: combina_cla(x.get('cla'), clas_ficha)  # noqa: E731
    marca = lambda x: f" [clã {' ou '.join([x['cla']] if isinstance(x['cla'], str) else x['cla'])}]" if x.get('cla') else ''  # noqa: E731
    apts = '\n'.join(
        f"- {a['id']}: {a['nome']}{marca(a)}" + ('' if a.get('gratuita', True) else ' (não pode ser gratuita)')
        for a in OPCOES['aptidoes'] if pode_apt(a)
    )
    pods = '\n'.join(f"- {p['id']}: {p['nome']}{marca(p)}" for p in OPCOES['poderes'] if pode(p))
    return f'CLÃS: {clas}\nVILAS: {", ".join(OPCOES["vilas"])}\n\nAPTIDÕES:\n{apts}\n\nPODERES:\n{pods}'


def pontos_atributo(nc):
    # Ficha inicial (NC 4): 12 pontos; cada NC acima dá +6 (mesma conta da ficha do site).
    return 12 + 6 * max(0, nc - 4)


def pontos_poder(nc):
    # NC 4: 4 pontos; cada NC acima dá +2.
    return 4 + 2 * max(0, nc - 4)


def sem_acento(texto):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(texto).lower()) if unicodedata.category(c) != 'Mn').strip()


CLAS_SEM_ACENTO = {sem_acento(c) for c in OPCOES['clas']}
ID_POR_NOME_APTIDAO = {sem_acento(nome): aid for aid, nome in NOMES_APTIDOES.items()}
ID_POR_NOME_PODER = {sem_acento(p['nome']): pid for pid, p in PODERES.items()}


def ajustar_atributos(pedidos, total, minimo, maximo, importantes=()):
    """Deixa a soma exatamente igual ao total, sem passar do mínimo/máximo.
    Sobrou ponto: tira primeiro dos atributos que NÃO são importantes para a ficha (do maior para o menor).
    Faltou ponto: põe primeiro nos importantes. Assim a ideia da IA (ex.: Percepção 4) é mantida."""
    attrs = {k: max(minimo, min(maximo, int(pedidos.get(k, 0) or 0))) for k in ATRIBUTOS}
    importantes = [a for a in importantes if a in ATRIBUTOS]
    peso = lambda k: (importantes.index(k) if k in importantes else -1)  # noqa: E731  (-1 = não importante)
    for _ in range(200):
        soma = sum(attrs.values())
        if soma == total:
            break
        if soma > total:
            candidatos = [k for k in ATRIBUTOS if attrs[k] > minimo]
            if not candidatos:
                break
            # não importantes primeiro; entre eles, o maior valor
            k = min(candidatos, key=lambda k: (k in importantes, -peso(k) if k in importantes else 0, -attrs[k]))
            attrs[k] -= 1
        else:
            candidatos = [k for k in ATRIBUTOS if attrs[k] < maximo]
            if not candidatos:
                break
            k = min(candidatos, key=lambda k: (k not in importantes, peso(k), attrs[k]))
            attrs[k] += 1
    return attrs


def sem_prefixo(i):
    """A IA às vezes escreve "id_lutador" ou "id: lutador" em vez de "lutador"."""
    i = str(i or '').strip()
    if i in IDS_APTIDOES or i in PODERES:
        return i
    for p in ('id_', 'id:', 'id '):
        if i.lower().startswith(p) and i[len(p):].strip():
            return i[len(p):].strip()
    return i


def validar_aptidoes(lista, clas_ficha='', livre=False, ja_tem=()):
    """Aceita id ou nome; devolve (até 3 ids válidos, avisos). Respeita o clã (a não ser que o Mestre
    tenha liberado) e se a aptidão pode ser gratuita. O que a ficha já tinha (ex.: criada pelo Mestre) fica."""
    apts, avisos = [], []
    for a in lista or []:
        a = sem_prefixo(a)
        aid = a if (a in IDS_APTIDOES or a in ja_tem) else ID_POR_NOME_APTIDAO.get(sem_acento(a))
        if not aid or aid in apts:
            continue
        info = APTIDOES.get(aid)
        if info and aid not in ja_tem:
            if not livre and not combina_cla(info.get('cla'), clas_ficha):
                avisos.append(f'{info["nome"]} é do clã {" ou ".join(info["cla"])}; tirei da sugestão (o Mestre pode liberar na ficha).')
                continue
            if info.get('gratuita') is False:
                avisos.append(f'{info["nome"]} não pode ser aptidão gratuita; tirei da sugestão.')
                continue
        apts.append(aid)
    return apts[:3], avisos


def validar_poderes(lista, cla, livre, pontos):
    """Aceita id ou nome; respeita o clã (a não ser que o Mestre tenha liberado) e os pontos."""
    avisos, poderes, gastos, vistos = [], [], 0, set()
    for item in lista or []:
        if not isinstance(item, dict):
            continue
        bruto = sem_prefixo(item.get('id') or item.get('nome') or '')
        pid = bruto if bruto in PODERES else ID_POR_NOME_PODER.get(sem_acento(bruto))
        info = PODERES.get(pid)
        if not info:
            aid = bruto if bruto in IDS_APTIDOES else ID_POR_NOME_APTIDAO.get(sem_acento(bruto))
            if aid:
                avisos.append(f'{NOMES_APTIDOES[aid]} é uma aptidão, não um poder; tirei da lista de poderes.')
            continue
        if pid in vistos:
            continue
        vistos.add(pid)
        if not livre and not combina_cla(info.get('cla'), cla):
            clas_txt = ' ou '.join([info['cla']] if isinstance(info['cla'], str) else info['cla'])
            avisos.append(f'{info["nome"]} é do clã {clas_txt}; tirei da sugestão (o Mestre pode liberar na ficha).')
            continue
        nivel = min(max(1, int(item.get('nivel', 1) or 1)), pontos - gastos)
        if nivel < 1:
            avisos.append(f'{info["nome"]} ficou de fora: acabaram os {pontos} pontos de poder.')
            continue
        gastos += nivel
        poderes.append({'id': pid, 'nome': info['nome'], 'nivel': nivel})
    if gastos < pontos:
        avisos.append(f'Sobraram {pontos - gastos} de {pontos} pontos de poder; use na ficha (poder ou aptidão extra).')
    return poderes, avisos


def pericias_importantes(f, lim):
    """Perícias que os poderes/aptidões da ficha usam (ex.: Kikaichuu → lidar_animais)."""
    achadas = []
    ids = [*(f.get('aptidoes_gratuitas') or []), *(f.get('aptidoes_extra') or []), *[p.get('id') for p in f.get('poderes') or []]]
    for i in ids:
        texto = sem_acento((PODERES.get(i) or APTIDOES.get(i) or {}).get('resumo', ''))
        for pericia in (lim.pericias_disponiveis or lim.pericias_atributo or []):
            palavras = [w for w in pericia.split('_') if len(w) > 2]
            if palavras and all(w in texto for w in palavras) and pericia not in achadas:
                achadas.append(pericia)
    return achadas


def completar_pericias(per, lim, atributos):
    """Sobrou ponto de perícia: põe nas perícias dos atributos mais altos (primeiro nas que já têm ponto)."""
    per = dict(per)
    disponiveis = lim.pericias_disponiveis or list(lim.pericias_atributo or {})
    usa = lim.pericias_atributo or {}
    ordem = sorted(disponiveis, key=lambda k: (-int(atributos.get(usa.get(k, ''), 0) or 0), -(k in per)))
    for k in ordem:
        while sum(per.values()) < lim.pericias and per.get(k, 0) < lim.max_pericia:
            per[k] = per.get(k, 0) + 1
    return per


def ajustar_pericias(pedidas, total, maximo, disponiveis, importantes=()):
    """Só perícias que existem/estão liberadas; cada uma até o máximo; soma até o total.
    Sobrou: tira primeiro das que não são importantes. Faltou: põe primeiro nas importantes."""
    per = {}
    for k, v in (pedidas or {}).items():
        k = k if k in disponiveis else next((d for d in disponiveis if sem_acento(d) == sem_acento(k).replace(' ', '_')), None)
        if k:
            per[k] = max(0, min(maximo, int(v or 0)))
    for imp in importantes:
        if imp in disponiveis:
            per.setdefault(imp, 0)
    while sum(per.values()) > total:
        candidatos = [k for k in per if per[k] > 0]
        k = min(candidatos, key=lambda k: (k in importantes, -per[k]))
        per[k] -= 1
    for imp in importantes:  # faltou ponto: completa as importantes primeiro
        while imp in per and per[imp] < maximo and sum(per.values()) < total:
            per[imp] += 1
    return {k: v for k, v in per.items() if v > 0}


def conferir_ficha(s, nc, livre=False):
    """Confere a sugestão de ficha completa contra as regras básicas e as opções reais, e corrige o que der.
    O site confere de novo. livre=True: o Mestre liberou misturar clãs."""
    avisos = []
    maximo = max(4, nc)
    minimo = max(0, (nc - 3) // 2)
    total = pontos_atributo(nc)
    attrs = ajustar_atributos(s.get('atributos', {}) or {}, total, minimo, maximo)
    if sum(attrs.values()) != total:
        avisos.append(f'Atributos somam {sum(attrs.values())} (o certo é {total}); ajuste na ficha.')
    cla = s.get('cla') if s.get('cla') in OPCOES['clas'] else ''
    if s.get('cla') and not cla:
        avisos.append(f'Clã "{s.get("cla")}" não existe na lista; escolha na ficha.')
    apts, av = validar_aptidoes(s.get('aptidoes_gratuitas'), cla, livre)
    avisos += av
    if len(apts) < 3:
        avisos.append(f'Só {len(apts)} de 3 aptidões gratuitas são válidas; escolha {3 - len(apts)} na ficha.')
    poderes, av = validar_poderes(s.get('poderes'), cla, livre, pontos_poder(nc))
    avisos += av
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


PARTES = {
    'atributos': ('atribut', 'forca', 'destreza', 'agilidade', 'percepcao', 'inteligencia', 'vigor', 'espirito'),
    'pericias': ('pericia',),
    'aptidoes_gratuitas': ('aptid',),
    'poderes': ('poder', 'jutsu', 'ninjutsu', 'taijutsu', 'genjutsu', 'ninpou', 'hijutsu'),
    'historia': ('histori', 'passado', 'origem', 'background'),
    'conceito': ('conceito', 'personalidade', 'ideia do personagem'),
    'nome': ('nome',),
    'cla': ('cla ', 'cla?', 'cla,', 'cla.', 'clan'),
    'vila': ('vila', 'aldeia'),
}
TUDO = ('do zero', 'ficha toda', 'ficha inteira', 'ficha completa', 'tudo', 'montar a ficha', 'monta a ficha', 'criar a ficha', 'cria a ficha')


def partes_pedidas(pedido):
    """Quais partes o pedido deixa mudar. Nenhuma reconhecida (ou "do zero") = todas."""
    t = sem_acento(pedido) + ' '
    if any(x in t for x in TUDO):
        return set(PARTES)
    achadas = {parte for parte, chaves in PARTES.items() if any(c in t for c in chaves)}
    # "separa meus atributos de acordo com meu clã e conceito": clã/conceito ali são contexto, não o que mudar.
    # Nome, clã, vila e conceito só mudam se o pedido for só sobre eles.
    identidade = {'nome', 'cla', 'vila', 'conceito'}
    if achadas - identidade:
        achadas -= identidade
    return achadas or set(PARTES)


APELIDOS = {
    # atributos
    'for': 'forca', 'des': 'destreza', 'agi': 'agilidade', 'per': 'percepcao', 'int': 'inteligencia', 'vig': 'vigor', 'esp': 'espirito',
    # partes da ficha
    'atributo': 'atributos', 'attributes': 'atributos', 'pericia': 'pericias', 'skills': 'pericias',
    'aptidoes': 'aptidoes_gratuitas', 'aptidoes gratuitas': 'aptidoes_gratuitas', 'aptidao': 'aptidoes_gratuitas',
    'poder': 'poderes', 'jutsus': 'poderes', 'historico': 'historia', 'explicacoes': 'explicacao', 'motivo': 'explicacao',
}


def chave(k):
    """'Força' → 'forca', 'Explicação' → 'explicacao', 'Aptidões Gratuitas' → 'aptidoes_gratuitas'."""
    k = sem_acento(k).strip()
    k = APELIDOS.get(k, k)
    k = k.replace(' ', '_')
    return APELIDOS.get(k, k)


def normalizar_sugestao(s):
    """A IA às vezes escreve as chaves com acento/maiúscula ou embrulha tudo em outra chave."""
    if not isinstance(s, dict):
        return {}
    s = {chave(k): v for k, v in s.items()}
    # {"ficha": {...}} ou {"mudancas": {...}}
    for embrulho in ('ficha', 'mudancas', 'sugestao', 'resposta'):
        if isinstance(s.get(embrulho), dict) and not any(k in s for k in ('atributos', 'pericias', 'poderes')):
            interno = normalizar_sugestao(s[embrulho])
            interno.setdefault('explicacao', s.get('explicacao', ''))
            s = interno
    # atributos soltos no topo ({"forca": 3, ...})
    soltos = {k: s.pop(k) for k in list(s) if k in ATRIBUTOS}
    if soltos and not isinstance(s.get('atributos'), dict):
        s['atributos'] = soltos
    for parte in ('atributos', 'pericias'):
        if isinstance(s.get(parte), dict):
            novo = {}
            for k, v in s[parte].items():
                try:
                    novo[chave(k)] = int(v)
                except (TypeError, ValueError):
                    pass
            s[parte] = novo
    if isinstance(s.get('explicacao'), list):
        s['explicacao'] = ' '.join(map(str, s['explicacao']))
    return s


def cortar_na_frase(texto, tam):
    """Corta no fim da última frase que cabe (não no meio de uma palavra)."""
    if len(texto) <= tam:
        return texto
    corte = texto[:tam]
    fim = max(corte.rfind('. '), corte.rfind('! '), corte.rfind('? '), corte.rfind('.\n'))
    return corte[:fim + 1] if fim > tam // 2 else corte.rsplit(' ', 1)[0] + '…'


def citados_no_pedido(pedido):
    """Aptidões e poderes que o jogador citou pelo nome (ex.: "Kikaichuu", "Satetsu"): {'aptidoes': [...], 'poderes': [...]}."""
    t = ' ' + re.sub(r'[^a-z0-9 ]', ' ', sem_acento(pedido)) + ' '
    def citado(nome):
        base = sem_acento(nome)
        partes = [base.split('(')[0]] + re.findall(r'\(([^)]*)\)', base) + [p for p in re.split(r'[:(),]', base)]
        for p in partes:
            p = re.sub(r'[^a-z0-9 ]', ' ', p).strip()
            # "Aburame" ou "Jiton" sozinhos são o clã, não o nome do poder/aptidão.
            if p in CLAS_SEM_ACENTO:
                continue
            if len(p) >= 5 and f' {p} ' in t:
                return True
        return False
    apts = [a['id'] for a in OPCOES['aptidoes'] if citado(a['nome']) and a.get('gratuita', True)]
    # "Kikaichuu" também casa com "Kikaichuu Nv 2": fica só o nome mais curto (a aptidão básica).
    apts = [a for a in apts if not any(b != a and NOMES_APTIDOES[a].startswith(NOMES_APTIDOES[b].split(' (')[0]) and len(NOMES_APTIDOES[b]) < len(NOMES_APTIDOES[a]) for b in apts)]
    pods = [p['id'] for p in OPCOES['poderes'] if citado(p['nome'])]
    return {'aptidoes': apts, 'poderes': pods}


def conferir_ajuda(s, atual, lim: Limites, livre, pedido=''):
    """Confere só as partes que a IA mudou (e que o pedido deixa mudar). Devolve {mudancas, explicacao, avisos}."""
    avisos, m = [], {}
    s = normalizar_sugestao(s)
    pode = partes_pedidas(pedido)
    s = {k: v for k, v in s.items() if k == 'explicacao' or k in pode}
    for campo, tam in (('nome', 60), ('conceito', 600), ('historia', 3000)):
        if isinstance(s.get(campo), str) and s[campo].strip() and s[campo].strip() != (atual.get(campo) or '').strip():
            m[campo] = cortar_na_frase(s[campo].strip(), tam)
    if s.get('cla'):
        if s['cla'] in OPCOES['clas']:
            if s['cla'] != atual.get('cla'):
                m['cla'] = s['cla']
        else:
            avisos.append(f'Clã "{s["cla"]}" não existe na lista; não mudei.')
    if s.get('vila') in OPCOES['vilas'] and s['vila'] != atual.get('vila'):
        m['vila'] = s['vila']
    cla = ' / '.join(x for x in [m.get('cla', atual.get('cla') or ''), atual.get('segundo_cla') or ''] if x)

    if isinstance(s.get('atributos'), dict) and s['atributos']:
        base = {**(atual.get('atributos') or {}), **s['atributos']}
        importantes = [a for a, _ in prioridades(atual, lim)[:3]]
        attrs = ajustar_atributos(base, lim.atributos, lim.min_atributo, lim.max_atributo, importantes)
        if attrs != {k: int((atual.get('atributos') or {}).get(k, 0) or 0) for k in ATRIBUTOS}:
            m['atributos'] = attrs
    if 'atributos' in m:
        for attr, motivos in prioridades(atual, lim)[:2]:
            if m['atributos'].get(attr, 0) < max(lim.min_atributo, lim.max_atributo - 1):
                avisos.append(f'{NOMES_ATRIBUTOS[attr]} ficou em {m["atributos"].get(attr, 0)}, mas é importante para você ({motivos[0]}). '
                              'Se quiser, peça de novo ou ajuste na ficha.')
    if isinstance(s.get('pericias'), dict) and s['pericias']:
        attrs_finais = m.get('atributos') or atual.get('atributos') or {}
        per = ajustar_pericias(s['pericias'], lim.pericias, lim.max_pericia, lim.pericias_disponiveis or [], pericias_importantes(atual, lim))
        per = completar_pericias(per, lim, attrs_finais)
        if sum(per.values()) < lim.pericias:
            avisos.append(f'A sugestão usa {sum(per.values())} de {lim.pericias} pontos de perícia; complete na ficha.')
        m['pericias'] = per
    citados = citados_no_pedido(pedido)
    if 'aptidoes_gratuitas' in pode and citados['aptidoes'] and isinstance(s.get('aptidoes_gratuitas'), list):
        # O que o jogador citou pelo nome entra primeiro (a IA às vezes esquece).
        s['aptidoes_gratuitas'] = citados['aptidoes'] + [a for a in s['aptidoes_gratuitas'] if sem_prefixo(a) not in citados['aptidoes']]
    if 'poderes' in pode and citados['poderes'] and isinstance(s.get('poderes'), list):
        tem = {sem_prefixo(x.get('id')) for x in s['poderes'] if isinstance(x, dict)}
        s['poderes'] = s['poderes'] + [{'id': p, 'nivel': 1} for p in citados['poderes'] if p not in tem]
    if isinstance(s.get('aptidoes_gratuitas'), list) and s['aptidoes_gratuitas']:
        apts, av = validar_aptidoes(s['aptidoes_gratuitas'], cla, livre, ja_tem=set(atual.get('aptidoes_gratuitas') or []))
        avisos += av
        if len(apts) < 3:
            avisos.append(f'Só {len(apts)} de 3 aptidões gratuitas são válidas; escolha {3 - len(apts)} na ficha.')
        if apts:
            m['aptidoes_gratuitas'] = apts
    if isinstance(s.get('poderes'), list) and s['poderes']:
        extras = len(atual.get('aptidoes_extra') or [])
        poderes, av = validar_poderes(s['poderes'], cla, livre, max(0, lim.poder - 2 * extras))
        avisos += av
        if poderes:
            m['poderes'] = poderes
    rotulos = {'atributos': 'atributos', 'pericias': 'perícias', 'aptidoes_gratuitas': 'aptidões', 'poderes': 'poderes', 'historia': 'história', 'conceito': 'conceito'}
    pedidas = [rotulos[p] for p in pode if p in rotulos and p not in m]
    if not m and 'atributos' in s and 'atributos' in pode:
        avisos.append('A IA achou que seus atributos já estão bons para o personagem e não mudou nada.')
    elif not m:
        avisos.append('A IA não sugeriu nenhuma mudança. Tente pedir de outro jeito.')
    elif len(pode) < len(PARTES) and pedidas:
        avisos.append(f'A IA não mudou: {", ".join(pedidas)}. Se quiser, peça de novo.')
    # Nomes das aptidões/poderes (de antes e de depois) para o site mostrar "antes → depois".
    ids = set(m.get('aptidoes_gratuitas', [])) | set(atual.get('aptidoes_gratuitas') or [])
    ids |= {x['id'] for x in m.get('poderes', [])} | {x.get('id') for x in atual.get('poderes') or [] if isinstance(x, dict)}
    nomes_ficha = atual.get('nomes') or {}
    nomes = {i: NOMES_APTIDOES.get(i) or PODERES.get(i, {}).get('nome') or nomes_ficha.get(i) for i in ids if i}
    return {'mudancas': m, 'explicacao': str(s.get('explicacao', ''))[:600], 'avisos': avisos,
            'nomes': {k: v for k, v in nomes.items() if v}}


NOMES_ATRIBUTOS = {'forca': 'Força', 'destreza': 'Destreza', 'agilidade': 'Agilidade', 'percepcao': 'Percepção',
                   'inteligencia': 'Inteligência', 'vigor': 'Vigor', 'espirito': 'Espírito'}


def prioridades(f, lim: Limites):
    """Quais atributos importam para esta ficha, lendo o resumo dos poderes e aptidões.
    Devolve [(atributo, motivo), ...] do mais para o menos importante. O modelo pequeno erra isso
    sozinho, então o servidor calcula e entrega pronto."""
    nome = lambda i: NOMES_APTIDOES.get(i) or PODERES.get(i, {}).get('nome') or i  # noqa: E731
    motivos = {}
    def soma(attr, peso, motivo):
        m = motivos.setdefault(attr, [0, []])
        m[0] += peso
        if motivo not in m[1]:
            m[1].append(motivo)
    ids = [*(f.get('aptidoes_gratuitas') or []), *(f.get('aptidoes_extra') or []), *[p.get('id') for p in f.get('poderes') or []]]
    for i in ids:
        info = PODERES.get(i) or APTIDOES.get(i) or {}
        texto = ' ' + sem_acento(info.get('resumo', '')) + ' '
        if i in PODERES:
            soma('espirito', 2, f'chakra para {nome(i)}')
        if 'por espirito' in texto or 'espirito' in texto and 'no lugar do espirito' not in texto:
            soma('espirito', 3, f'{nome(i)} cresce com Espírito')
        for pericia, attr in (lim.pericias_atributo or {}).items():
            palavras = [w for w in pericia.split('_') if len(w) > 2]
            if palavras and all(w in texto for w in palavras):
                rotulo = {'lidar_animais': 'Lidar com Animais', 'ciencias_naturais': 'Ciências Naturais'}.get(pericia, pericia.replace('_', ' ').capitalize())
                soma(attr, 3, f'{nome(i)} usa {rotulo}')
        if ' cd' in texto or 'distancia' in texto:
            soma('destreza', 2, f'{nome(i)} ataca à distância (CD)')
        if ' cc' in texto or 'corpo a corpo' in texto:
            soma('forca', 2, f'{nome(i)} ataca corpo a corpo (CC)')
        if 'esquiva' in texto:
            soma('agilidade', 1, f'{nome(i)} usa Esquiva')
    return [(a, m[1]) for a, m in sorted(motivos.items(), key=lambda x: -x[1][0])]


def ficha_para_ia(f, lim: Limites):
    """Ficha atual em texto curto (com nomes, para a IA entender)."""
    attrs = f.get('atributos') or {}
    per = {k: v for k, v in (f.get('pericias') or {}).items() if v}
    nomes = f.get('nomes') or {}
    nome = lambda i: NOMES_APTIDOES.get(i) or PODERES.get(i, {}).get('nome') or nomes.get(i) or i  # noqa: E731
    apts = [f'{nome(a)} (id {a})' for a in f.get('aptidoes_gratuitas') or []]
    extras = [nome(a) for a in f.get('aptidoes_extra') or []]
    pods = [f"{nome(p.get('id'))} (id {p.get('id')}, nível {p.get('nivel', 1)})" for p in f.get('poderes') or []]
    # O que os poderes/aptidões fazem: é daí que a IA tira quais atributos e perícias importam.
    resumos = [f"- {nome(i)}: {(PODERES.get(i) or APTIDOES.get(i) or {}).get('resumo', '')}"
               for i in [*(f.get('aptidoes_gratuitas') or []), *(f.get('aptidoes_extra') or []), *[p.get('id') for p in f.get('poderes') or []]]
               if (PODERES.get(i) or APTIDOES.get(i) or {}).get('resumo')]
    usa = ', '.join(f'{k}→{v}' for k, v in (lim.pericias_atributo or {}).items())
    return '\n'.join([
        f"Nome: {f.get('nome') or '(vazio)'}",
        f"Clã: {f.get('cla') or 'Nenhum'}" + (f" | Segundo clã/Hijutsu: {f['segundo_cla']}" if f.get('segundo_cla') else '') + f" | Vila: {f.get('vila') or '(vazia)'}",
        f"Conceito: {f.get('conceito') or '(vazio)'}",
        f"História: {(f.get('historia') or '(vazia)')[:800]}",
        'Atributos: ' + ', '.join(f'{k} {attrs.get(k, 0)}' for k in ATRIBUTOS) + f" (soma {sum(int(attrs.get(k, 0) or 0) for k in ATRIBUTOS)} de {lim.atributos})",
        'Perícias com pontos: ' + (', '.join(f'{k} {v}' for k, v in per.items()) or 'nenhuma') + f" (soma {sum(per.values())} de {lim.pericias})",
        'Aptidões gratuitas: ' + (', '.join(apts) or 'nenhuma'),
        'Aptidões extras (2 pontos de poder cada): ' + (', '.join(extras) or 'nenhuma'),
        'Poderes: ' + (', '.join(pods) or 'nenhum'),
        *(['O que os poderes e aptidões fazem:', *resumos] if resumos else []),
        *([f'Atributo que cada perícia usa: {usa}'] if usa else []),
    ])


@app.post('/ficha')
async def ficha(p: PedidoFicha):
    conferir_tamanho(p.descricao)
    nc = max(4, min(20, p.nc))

    async def tarefa():
        sistema = Prompts.FICHA.format(
            nc=nc, pontos_atributos=pontos_atributo(nc), max_atributo=max(4, nc), pontos_poder=pontos_poder(nc), opcoes=opcoes_compactas('', True),
            restricao_cla=Prompts.RESTRICAO_LIVRE if p.livre else Prompts.RESTRICAO_NORMAL)
        bruto = await Ollama.conversar(
            [{'role': 'system', 'content': sistema}, {'role': 'user', 'content': p.descricao}],
            formato='json',
        )
        try:
            sugestao = json.loads(bruto)
        except json.JSONDecodeError as e:
            raise HTTPException(502, 'A IA não devolveu uma ficha válida. Tente descrever de outro jeito.') from e
        return conferir_ficha(sugestao, nc, livre=p.livre)

    return com_folego(na_fila(p.papel, tarefa))


def clas_do_contexto(p):
    """Clãs da ficha + clãs citados no pedido (ex.: "monta do zero um Aburame")."""
    clas = [p.ficha.get('cla'), p.ficha.get('segundo_cla')]
    pedido = sem_acento(p.pedido)
    clas += [c for c in OPCOES['clas'] if len(c) > 3 and sem_acento(c) in pedido]
    return ' / '.join(c for c in clas if c)


@app.post('/ficha/ajudar')
async def ajudar_ficha(p: AjudaFicha):
    """Ajuda aos poucos: recebe a ficha atual + o pedido e devolve só o que mudaria."""
    conferir_tamanho(p.pedido)
    nc = max(4, min(20, p.nc))
    lim = p.limites

    async def tarefa():
        sistema = Prompts.AJUDA_FICHA.format(
            nc=nc, pontos_atributos=lim.atributos, min_atributo=lim.min_atributo, max_atributo=lim.max_atributo,
            pontos_pericias=lim.pericias, max_pericia=lim.max_pericia, pericias=', '.join(lim.pericias_disponiveis) or '(todas)',
            pontos_poder=lim.poder, restricao_cla=Prompts.RESTRICAO_LIVRE if p.livre else Prompts.RESTRICAO_NORMAL,
            opcoes=opcoes_compactas(clas_do_contexto(p), p.livre))
        partes = partes_pedidas(p.pedido)
        so = '' if len(partes) == len(PARTES) else f"\nMUDE SOMENTE: {', '.join(sorted(partes))}. Não coloque outras chaves no JSON."
        if 'atributos' in partes:
            prio = prioridades(p.ficha, lim)
            if prio:
                so += '\nATRIBUTOS MAIS IMPORTANTES PARA ESTA FICHA (dê mais pontos a eles, na ordem):\n' + '\n'.join(
                    f'- {NOMES_ATRIBUTOS[a]}: ' + '; '.join(m) for a, m in prio[:3])
            so += ('\nNos atributos, proponha valores DIFERENTES dos atuais (mesmo total). '
                   'Na explicação, cite só o que realmente mudou.')
        if 'pericias' in partes:
            imp = pericias_importantes(p.ficha, lim)
            so += f'\nPerícias: use EXATAMENTE {lim.pericias} pontos no total, no máximo {lim.max_pericia} em cada.'
            if imp:
                so += f" Mais importantes para esta ficha (coloque o máximo nelas): {', '.join(imp)}."
        if 'aptidoes_gratuitas' in partes or 'poderes' in partes:
            so += ('\nUse os ids exatamente como na lista (sem "id_"). Aptidões vão em "aptidoes_gratuitas", '
                   'poderes em "poderes" (não misture).')
        so += '\nSempre preencha "explicacao".'
        usuario = f'FICHA ATUAL:\n{ficha_para_ia(p.ficha, lim)}\n\nPEDIDO: {p.pedido}{so}'
        mensagens = [{'role': 'system', 'content': sistema}, {'role': 'user', 'content': usuario}]
        resultado = None
        for tentativa in (1, 2):
            bruto = await Ollama.conversar(mensagens, formato='json')
            print(f'[ficha/ajudar] tentativa {tentativa} | pedido: {p.pedido[:80]!r}\n  IA respondeu: {bruto[:600]}', flush=True)
            try:
                sugestao = json.loads(bruto)
            except json.JSONDecodeError:
                continue
            resultado = conferir_ajuda(sugestao, p.ficha, lim, p.livre, p.pedido)
            if resultado['mudancas']:
                break
            if 'atributos' in partes and tentativa == 1:
                mensagens = mensagens + [
                    {'role': 'assistant', 'content': bruto},
                    {'role': 'user', 'content': 'Você devolveu os mesmos atributos que a ficha já tem. Proponha uma distribuição DIFERENTE, '
                                                'que combine com os poderes, aptidões, nome e conceito do personagem, somando o mesmo total. '
                                                'Explique em "explicacao" o porquê. Responda só com o JSON.'},
                ]
                continue
            # Nada aproveitável: lembra a IA do formato e tenta mais uma vez.
            mensagens = mensagens + [
                {'role': 'assistant', 'content': bruto},
                {'role': 'user', 'content': 'Essa resposta não mudou nada do que pedi. Responda de novo só com o JSON, usando exatamente as chaves do formato (sem acento), por exemplo {"atributos": {"forca": 2, ...}, "explicacao": "..."}.'},
            ]
        if resultado is None:
            raise HTTPException(502, 'A IA não devolveu uma sugestão válida. Tente pedir de outro jeito.')
        return resultado

    return com_folego(na_fila(p.papel, tarefa))


def limpar_resposta(texto):
    # Alguns modelos devolvem o "pensamento" entre <think>...</think>: não mostra para o jogador.
    return re.sub(r'<think>.*?</think>', '', texto, flags=re.S).strip()
