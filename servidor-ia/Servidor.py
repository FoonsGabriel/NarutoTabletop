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
import Regras

ATRIBUTOS = ['forca', 'destreza', 'agilidade', 'percepcao', 'inteligencia', 'vigor', 'espirito']
OPCOES = json.loads((Config.PASTA / 'dados' / 'Opcoes.json').read_text(encoding='utf-8'))
NOMES_APTIDOES = {a['id']: a['nome'] for a in OPCOES['aptidoes']}
IDS_APTIDOES = set(NOMES_APTIDOES)
APTIDOES = {a['id']: a for a in OPCOES['aptidoes']}
CLAS_SEM_ACENTO = None  # preenchido depois que sem_acento existir
PODERES = {p['id']: p for p in OPCOES['poderes']}
ARMAS = {a['id']: a for a in OPCOES.get('armas', [])}   # equipamento (págs. 137–140); vazio com Opcoes.json antigo
ITENS = {i['id']: i for i in OPCOES.get('itens', [])}


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
    room_id: str | None = None     # mesa de onde veio a pergunta (para usar as Regras da mesa)
    jogador_id: str | None = None  # quem pergunta (para saber os personagens dele nas liberações)


class Limites(BaseModel):
    atributos: int = 12            # pontos de atributo desta ficha (criação + evolução)
    pericias: int = 8
    poder: int = 4
    min_atributo: int = 0
    max_atributo: int = 4
    max_pericia: int = 2
    pericias_disponiveis: list[str] = []
    pericias_atributo: dict = {}   # perícia → atributo que ela usa (ex.: lidar_animais → inteligencia)
    complementos_escolhas: dict = {}  # aptidão → opções prontas do complemento (ex.: Especialista → grupos de arma)
    sociais: int = 2               # pontos sociais (Carisma + Manipulação)
    max_social: int = 2


class AjudaFicha(BaseModel):
    pedido: str = Field(min_length=1)
    ficha: dict = {}               # como a ficha está agora (o site manda)
    limites: Limites = Limites()
    nc: int = 4
    papel: str = 'geral'
    livre: bool = False
    liberados: list[str] = []      # poderes/aptidões que o Mestre liberou para esta ficha (Regras da mesa)


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

        mensagens, trechos = await mensagens_de_regra(p, historico)
        resposta = limpar_resposta(await Ollama.conversar(mensagens))
        return {'resposta': resposta, 'fontes': fontes_citadas(resposta, trechos)}

    return com_folego(na_fila(p.papel, tarefa))


async def mensagens_de_regra(p, historico):
    """Mensagens para uma pergunta de regra: Regras da mesa (antes do livro) + trechos dos livros."""
    trechos = await INDICE.buscar(p.pergunta)
    lista = await Regras.da_mesa(p.room_id)
    nomes_personagens, meus = await Regras.personagens(lista, p.jogador_id) if lista else ({}, [])
    regras = Regras.para_prompt(lista, NOMES_ITENS, p.papel == 'mestre', nomes_personagens, meus)
    bloco_regras = f'{regras}\n\n' if regras else ''
    mensagens = [
        {'role': 'system', 'content': Prompts.REGRAS},
        *historico,
        # Regras da mesa DEPOIS dos trechos, perto da pergunta: o modelo pequeno segue melhor o que leu por último.
        {'role': 'user', 'content': f'TRECHOS DOS LIVROS:\n{Prompts.montar_contexto(trechos)}\n\n{bloco_regras}PERGUNTA: {p.pergunta}'},
    ]
    return mensagens, trechos


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
                    mensagens, trechos = await mensagens_de_regra(p, historico)
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


# Frases só de cumprimento, mesmo com "?" ("Oi beleza?", "E aí, tudo bem?"): nenhuma palavra de regra.
PALAVRAS_CONVERSA = {
    'oi', 'ola', 'opa', 'salve', 'eai', 'e', 'ai', 'beleza', 'blz', 'tudo', 'td', 'bem', 'bom', 'boa', 'dia', 'tarde',
    'noite', 'tranquilo', 'tranquila', 'suave', 'como', 'vai', 'voce', 'vc', 'contigo', 'ai', 'valeu', 'vlw', 'obrigado',
    'obrigada', 'obg', 'brigado', 'tchau', 'ok', 'show', 'top', 'mano', 'cara', 'parceiro', 'ia', 'claude', 'bot', 'com',
}


def eh_conversa(texto):
    """Mensagem curta de cumprimento/agradecimento, sem pergunta de regra."""
    t = re.sub(r'[^\w\s]', '', texto.lower()).strip()
    if t in CONVERSAS or (len(t.split()) <= 2 and any(t.startswith(c) for c in CONVERSAS) and '?' not in texto):
        return True
    palavras = sem_acento(t).split()
    return 0 < len(palavras) <= 6 and all(p in PALAVRAS_CONVERSA for p in palavras)


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


def opcoes_compactas(clas_ficha='', livre=False, liberados=()):
    """Opções para a IA. Itens de clã só entram se forem do clã da ficha (ou se o Mestre liberou),
    para a lista não ficar enorme."""
    clas = ', '.join(OPCOES['clas'])
    pode = lambda x: livre or x['id'] in liberados or combina_cla(x.get('cla'), clas_ficha)  # noqa: E731
    # Aptidões de clã são muitas (mais de 100): mesmo com regras liberadas, só as dos clãs da ficha/pedido.
    pode_apt = lambda x: x['id'] in liberados or combina_cla(x.get('cla'), clas_ficha)  # noqa: E731
    marca = lambda x: f" [clã {' ou '.join([x['cla']] if isinstance(x['cla'], str) else x['cla'])}]" if x.get('cla') else ''  # noqa: E731
    linha_apt = lambda a: (f"- {a['id']}: {a['nome']}{marca(a)}"  # noqa: E731
                           + (f" (exige {a['requer']})" if a.get('requer') else '') + (f" (não combina com {a['exclui']})" if a.get('exclui') else '')
                           + (f" (pede {prereq_texto(a)})" if a.get('prereq') else '')
                           + (f" (complemento: {a.get('dica') or a['complemento']})" if a.get('complemento') else ''))
    gratis = '\n'.join(linha_apt(a) for a in OPCOES['aptidoes'] if pode_apt(a) and a.get('gratuita', True))
    so_extra = '\n'.join(linha_apt(a) for a in OPCOES['aptidoes'] if pode_apt(a) and not a.get('gratuita', True))
    apts = f'(podem ser gratuitas ou extras)\n{gratis}' + (f'\n\nAPTIDÕES SÓ COMO EXTRA (2 pontos de poder; NUNCA em "aptidoes_gratuitas"):\n{so_extra}' if so_extra else '')
    req = lambda p: f" (exige {requisitos_do_poder(p)})" if requisitos_do_poder(p) else ''  # noqa: E731
    pods = '\n'.join(f"- {p['id']}: {p['nome']}{marca(p)}{req(p)}" for p in OPCOES['poderes'] if pode(p))
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
NOMES_ITENS = {**{a['id']: a['nome'] for a in OPCOES['aptidoes']}, **{p['id']: p['nome'] for p in OPCOES['poderes']}}
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


def validar_aptidoes(lista, clas_ficha='', livre=False, ja_tem=(), liberados=(), gratuitas=True, limite=3, para_extra=None):
    """Aceita id ou nome; devolve (até 3 ids válidos, avisos). Respeita o clã (a não ser que o Mestre
    tenha liberado) e se a aptidão pode ser gratuita. O que a ficha já tinha (ex.: criada pelo Mestre) fica."""
    apts, avisos = [], []
    for a in lista or []:
        a = sem_prefixo(a)
        aid = a if (a in IDS_APTIDOES or a in ja_tem) else ID_POR_NOME_APTIDAO.get(sem_acento(a))
        if not aid or aid in apts:
            continue
        info = APTIDOES.get(aid)
        if info:
            if not livre and aid not in liberados and not combina_cla(info.get('cla'), clas_ficha):
                avisos.append(f'{info["nome"]} é do clã {" ou ".join(info["cla"])}; tirei da sugestão (o Mestre pode liberar na ficha).')
                continue
            if gratuitas and info.get('gratuita') is False:
                movidas_cla = sum(1 for x in (para_extra or []) if x not in ja_tem)
                if para_extra is not None and (aid in ja_tem or (info.get('cla') and movidas_cla == 0)):
                    para_extra.append(aid)  # já era do jogador, ou é a marca do clã (ex.: Sharingan): vira aptidão extra em vez de sumir
                    avisos.append(f'{info["nome"]} não pode ser aptidão gratuita; passei para aptidão extra (2 pontos de poder).')
                else:
                    avisos.append(f'{info["nome"]} não pode ser aptidão gratuita; tirei da sugestão.')
                continue
        apts.append(aid)
    return apts[:limite], avisos


def conferir_dependencias(gratuitas, extras, livre=False):
    """Aptidão que exige outra (Kikaichuu Nv 2 exige Kikaichuu) e que não combina com outra (Rinkaichuu x Kidaichuu).
    Devolve (gratuitas, extras, avisos) já sem as que não podem ficar."""
    avisos = []
    if livre:
        return gratuitas, extras, avisos
    def nomes(lista):
        return {sem_acento(NOMES_APTIDOES.get(a, a)) for a in lista}
    for _ in range(3):  # tirar uma pode quebrar outra que dependia dela
        todas = gratuitas + extras
        tirar = set()
        for a in todas:
            info = APTIDOES.get(a) or {}
            if info.get('requer') and sem_acento(info['requer']) not in nomes(todas):
                tirar.add(a)
                avisos.append(f'{info["nome"]} exige a aptidão {info["requer"]}; tirei da sugestão.')
        for i, a in enumerate(todas):
            info = APTIDOES.get(a) or {}
            if info.get('exclui') and sem_acento(info['exclui']) in nomes(todas[:i]):
                tirar.add(a)
                avisos.append(f'{info["nome"]} não combina com {info["exclui"]}; tirei da sugestão.')
        if not tirar:
            break
        gratuitas = [a for a in gratuitas if a not in tirar]
        extras = [a for a in extras if a not in tirar]
    return gratuitas, extras, avisos


def validar_poderes(lista, cla, livre, pontos, liberados=(), atributos=None, aptidoes=None, nc=4, nomes_atuais=None, personagem='', efeitos_atuais=None):
    """Aceita id ou nome e confere com as regras da ficha do site:
    clã (a não ser que o Mestre tenha liberado), atributos e aptidões exigidos, nível máximo (NC ÷ 2),
    1 elemento básico (2 com Espírito 10) e os pontos. Sobrou ponto: sobe o nível dos escolhidos.
    atributos: {forca: 2, ...} finais da ficha; aptidoes: ids das aptidões da ficha."""
    avisos, poderes, gastos, vistos = [], [], 0, set()
    nivel_max = max(1, nc // 2)
    nomes_apts = {sem_acento(NOMES_APTIDOES.get(a, a)) for a in (aptidoes or [])}
    elementos_max = 2 if int((atributos or {}).get('espirito', 0) or 0) >= 10 else 1
    elementos = 0
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
        if not livre and pid not in liberados and not combina_cla(info.get('cla'), cla):
            clas_txt = ' ou '.join([info['cla']] if isinstance(info['cla'], str) else info['cla'])
            avisos.append(f'{info["nome"]} é do clã {clas_txt}; tirei da sugestão (o Mestre pode liberar na ficha).')
            continue
        if atributos is not None and not livre:
            falta = [f'{NOMES_ATRIBUTOS.get(k, k)} {v}' for k, v in (info.get('atributos_min') or {}).items()
                     if int(atributos.get(k, 0) or 0) < int(v)]
            if falta:
                avisos.append(f'{info["nome"]} exige {" e ".join(falta)}; tirei da sugestão.')
                continue
        if aptidoes is not None and not livre:
            falta = [a for a in info.get('aptidoes_req') or [] if sem_acento(a) not in nomes_apts]
            if falta:
                avisos.append(f'{info["nome"]} exige a aptidão {" e ".join(falta)}; tirei da sugestão.')
                continue
        if info.get('tipo') == 'elemento':
            if elementos >= elementos_max and not livre:
                avisos.append(f'{info["nome"]}: só dá para ter {elementos_max} elemento(s) básico(s); tirei da sugestão.')
                continue
            elementos += 1
        nivel = min(max(1, int(item.get('nivel', 1) or 1)), nivel_max, pontos - gastos)
        if nivel < 1:
            avisos.append(f'{info["nome"]} ficou de fora: acabaram os {pontos} pontos de poder.')
            continue
        gastos += nivel
        novo = {'id': pid, 'nome': info['nome'], 'nivel': nivel}
        if info.get('precisa_nome'):
            # Nome do Ninpou: o que a ficha já tinha > o que a IA deu > provisório (a ficha não salva sem nome).
            ja = str((nomes_atuais or {}).get(pid) or '').strip()
            da_ia = str(item.get('nome') or item.get('nome_proprio') or '').strip()
            if da_ia and sem_acento(da_ia) == sem_acento(info['nome']):
                da_ia = ''
            if ja or da_ia:
                novo['nome_proprio'] = (ja or da_ia)[:60]
            elif nomes_atuais is not None:
                primeiro = str(personagem or '').split(' — ')[0].split(' - ')[0].strip().split(' ')[0]
                base = info['nome'].split(' (')[0]
                novo['nome_proprio'] = f'{base}: Arte de {primeiro}' if primeiro else f'{base}: Estilo Próprio'
                avisos.append(f'Dei ao {base} o nome provisório "{novo["nome_proprio"]}" (troque na ficha se quiser).')
        else:
            # Nome que o jogador deu ao poder (ex.: "Hari Juizo") fica, mesmo quando o poder não exige nome.
            ja = str((nomes_atuais or {}).get(pid) or '').strip()
            if ja and sem_acento(ja) != sem_acento(info['nome']):
                novo['nome_proprio'] = ja[:60]
        poderes.append(novo)
    # Kekkei genkai de elemento limita os outros elementos (ex.: Mokuton só com Doton e Suiton).
    if not livre:
        for k in [p for p in poderes if PODERES[p['id']].get('elementos_permitidos')]:
            permitidos = PODERES[k['id']]['elementos_permitidos']
            for e in [p for p in poderes if PODERES[p['id']].get('tipo') == 'elemento' and p['id'] not in permitidos and p['id'] not in liberados]:
                poderes.remove(e)
                gastos -= e['nivel']
                avisos.append(f'{k["nome"]} só aceita os elementos {" e ".join(NOMES_ITENS.get(x, x) for x in permitidos)}; tirei {e["nome"]}.')
    # Sobrou ponto: sobe o nível dos poderes escolhidos (na ordem da IA), até o máximo do NC.
    for p in poderes:
        while gastos < pontos and p['nivel'] < nivel_max:
            p['nivel'] += 1
            gastos += 1
    if gastos < pontos:
        avisos.append(f'Sobraram {pontos - gastos} de {pontos} pontos de poder; escolha outro poder ou uma aptidão extra.')
    # Efeito de cada nível: o que a IA pediu > o que a ficha já tinha > completa.
    pedidos_ia = {}
    for item in lista or []:
        if isinstance(item, dict) and isinstance(item.get('efeitos'), list):
            pid_i = sem_prefixo(item.get('id') or '')
            pedidos_ia[pid_i if pid_i in PODERES else ID_POR_NOME_PODER.get(sem_acento(pid_i), pid_i)] = item['efeitos']
    for p in poderes:
        if not PODERES[p['id']].get('efeitos'):
            continue
        pedidos = pedidos_ia.get(p['id']) or (efeitos_atuais or {}).get(p['id']) or []
        efs, completou = escolher_efeitos(p['id'], p['nivel'], pedidos)
        p['efeitos'] = efs
        if completou and efeitos_atuais is not None:
            nomes_ef = {e['id']: e['nome'] for e in PODERES[p['id']]['efeitos']}
            avisos.append(f'Efeitos de {p["nome"]}: ' + ', '.join(f'Nv {i + 1} {nomes_ef.get(e, e)}' for i, e in enumerate(efs))
                          + ' (completei o que faltava; troque na ficha se quiser).')
    for p in poderes:
        if PODERES[p['id']].get('precisa_nome') and not p.get('nome_proprio'):
            avisos.append(f'{p["nome"]}: dê um nome a ele na ficha (ex.: Ninpou: Hari Jizou).')
    return poderes, avisos


PALAVRAS_ATRIBUTO = {
    'forca': ('corpo a corpo', 'desarmado', 'golpe', 'soco', ' cc', 'forca', 'taijutsu'),
    'destreza': ('distancia', 'arremess', 'mira', ' cd', 'projetil', 'destreza'),
    'agilidade': ('esquiva', 'deslocamento', 'iniciativa', 'velocidade', 'movimento', 'agilidade'),
    'percepcao': ('percep', 'ler movimento', 'sentido', 'rastre', 'animais'),
    'inteligencia': ('conhecimento', 'inteligencia', 'pericia', 'selo'),
    'vigor': ('vitalidade', 'resist', 'vigor', 'dureza'),
    'espirito': ('chakra', 'espirito', 'jutsu', 'genjutsu', 'ninjutsu'),
}


def afinidade(info, atributos):
    """Quanto o item combina com os atributos altos da ficha (para escolher quando a IA não consegue)."""
    texto = ' ' + sem_acento(f"{info.get('nome', '')} {info.get('resumo', '')}") + ' '
    return sum(int(atributos.get(a, 0) or 0) for a, palavras in PALAVRAS_ATRIBUTO.items() if any(p in texto for p in palavras))


def poderes_possiveis(cla, livre, liberados, atributos, aptidoes, escolhidos):
    """Poderes que esta ficha pode ter agora (clã, exigências, elementos), do que mais combina para o que menos."""
    nomes_apts = {sem_acento(NOMES_APTIDOES.get(a, a)) for a in aptidoes}
    tem_elemento = any(PODERES.get(e, {}).get('tipo') == 'elemento' for e in escolhidos)
    permitidos = [x for e in escolhidos for x in (PODERES.get(e, {}).get('elementos_permitidos') or [])]
    saida = []
    for pid, info in PODERES.items():
        if pid in escolhidos:
            continue
        if not livre and pid not in liberados and not combina_cla(info.get('cla'), cla):
            continue
        if any(int(atributos.get(k, 0) or 0) < int(v) for k, v in (info.get('atributos_min') or {}).items()):
            continue
        if any(sem_acento(a) not in nomes_apts for a in info.get('aptidoes_req') or []):
            continue
        if info.get('tipo') == 'elemento' and (tem_elemento or (permitidos and pid not in permitidos)):
            continue
        saida.append(pid)
    # Do clã primeiro (é a cara do personagem), depois o que combina com os atributos altos.
    # Do clã primeiro (é a cara do personagem), depois o que combina com os atributos altos; Ninpou (precisa de nome) por último.
    return sorted(saida, key=lambda i: (bool(PODERES[i].get('precisa_nome')), not PODERES[i].get('cla'), -afinidade(PODERES[i], atributos)))


def aptidoes_possiveis(cla, livre, liberados, atributos, ja_tem, ctx=None):
    """Aptidões que podem ser gratuitas nesta ficha, do que mais combina para o que menos."""
    nomes = {sem_acento(NOMES_APTIDOES.get(a, a)) for a in ja_tem}
    saida = []
    for aid, info in APTIDOES.items():
        if aid in ja_tem or not info.get('gratuita', True):
            continue
        if not livre and aid not in liberados and not combina_cla(info.get('cla'), cla):
            continue
        if info.get('requer') and sem_acento(info['requer']) not in nomes:
            continue
        if info.get('exclui') and sem_acento(info['exclui']) in nomes:
            continue
        if ctx is not None and not livre and prereqs_faltando(aid, {**ctx, 'aptidoes': [NOMES_APTIDOES.get(a, a) for a in ja_tem]}):
            continue
        saida.append(aid)
    return sorted(saida, key=lambda i: (not APTIDOES[i].get('cla'), -afinidade(APTIDOES[i], atributos)))


COMBATE_ATRIBUTO = {'cc': 'forca', 'cd': 'destreza', 'esq': 'agilidade', 'lm': 'percepcao'}
NOMES_COMBATE = {'cc': 'Combate Corporal', 'cd': 'Combate à Distância', 'esq': 'Esquiva', 'lm': 'Ler Movimento'}


def descrever_condicao(c):
    tipo, chave, *resto = c.split(':')
    valor = resto[0] if resto else ''
    if tipo in ('apt', 'cla'):
        return chave
    nome = NOMES_ATRIBUTOS.get(chave) or NOMES_COMBATE.get(chave) or NOMES_ITENS.get(chave) or chave.replace('_', ' ')
    return f'{nome} {valor}'


def prereq_texto(info):
    return ' e '.join(' ou '.join(descrever_condicao(c) for c in grupo) for grupo in info.get('prereq') or [])


def prereqs_faltando(aid, ctx):
    """Condições (págs. 56–70) que a ficha ainda não cumpre para a aptidão. ctx: atributos, pericias (pontos gastos),
    combate_base, poderes {id: nível}, aptidoes (nomes), cla, usa (perícia → atributo). Mesma conta da ficha do site."""
    info = APTIDOES.get(aid) or {}
    attrs = ctx.get('atributos') or {}
    def ok(c):
        tipo, chave, *resto = c.split(':')
        v = int(resto[0]) if resto and resto[0].isdigit() else 0
        if tipo == 'atr':
            return int(attrs.get(chave, 0) or 0) >= v
        if tipo == 'per':
            gasto = int((ctx.get('pericias') or {}).get(chave, 0) or 0)
            total = -(-int(attrs.get((ctx.get('usa') or {}).get(chave, ''), 0) or 0) // 2) + gasto
            return total >= v
        if tipo == 'cmb':
            return int(attrs.get(COMBATE_ATRIBUTO.get(chave, ''), 0) or 0) + int((ctx.get('combate_base') or {}).get(chave, 3) or 3) >= v
        if tipo == 'pod':
            return max([n for i, n in (ctx.get('poderes') or {}).items() if sem_acento(chave) in sem_acento(i)] or [0]) >= v
        if tipo == 'apt':
            return sem_acento(chave) in {sem_acento(x) for x in ctx.get('aptidoes') or []}
        if tipo == 'cla':
            return sem_acento(chave) in sem_acento(ctx.get('cla') or '')
        return True
    return [' ou '.join(descrever_condicao(c) for c in grupo) for grupo in info.get('prereq') or [] if not any(ok(c) for c in grupo)]


# ---------- efeitos de cada nível (pág. 94) ----------
def escolher_efeitos(pid, nivel, pedidos=()):
    """Efeito de cada nível do poder: usa os pedidos (da IA ou da ficha) que valem e completa o resto.
    Regras da ficha: o efeito tem nível mínimo; repetir = evoluir (só se houver evolução daquele nível);
    alguns exigem outro antes; alguns poderes têm efeito obrigatório. Devolve (lista, completou?)."""
    info = PODERES.get(pid) or {}
    lista = info.get('efeitos') or []
    if not lista:
        return [], False
    por_id = {e['id']: e for e in lista}
    por_nome = {sem_acento(e['nome']): e['id'] for e in lista}
    def pode(eid, nv, antes):
        e = por_id.get(eid)
        if not e or e['nivel'] > nv:
            return False
        vezes = antes.count(eid)
        if vezes:
            evo = (e.get('evolucoes') or [])[vezes - 1] if vezes - 1 < len(e.get('evolucoes') or []) else None
            if evo is None or evo > nv:
                return False
        return not e.get('prereq') or e['prereq'] in antes
    escolhidos, completou = [], False
    obrig = info.get('efeito_obrigatorio')
    for i in range(nivel):
        nv = i + 1
        pedido = pedidos[i] if i < len(pedidos) else None
        if isinstance(pedido, str):
            pedido = pedido if pedido in por_id else por_nome.get(sem_acento(pedido))
        if obrig and obrig not in escolhidos and por_id.get(obrig, {}).get('nivel', 99) <= nv and pode(obrig, nv, escolhidos) \
                and (nv == nivel or pedido != obrig and not pode(pedido or '', nv, escolhidos)):
            escolhidos.append(obrig)  # o obrigatório entra assim que pode (ou no último nível)
            completou = completou or pedido != obrig
            continue
        if pedido and pode(pedido, nv, escolhidos):
            escolhidos.append(pedido)
            continue
        # Completa: efeito novo do maior nível possível (variedade); senão evolui o primeiro que der.
        novos = [e for e in lista if e['id'] not in escolhidos and pode(e['id'], nv, escolhidos)]
        if novos:
            escolhidos.append(max(novos, key=lambda e: (e['nivel'], -lista.index(e)))['id'])
        else:
            evolui = next((e['id'] for e in lista if pode(e['id'], nv, escolhidos)), None)
            if evolui is None:
                break
            escolhidos.append(evolui)
        completou = True
    return escolhidos, completou


def requisitos_do_poder(info):
    """Texto curto dos pré-requisitos (ex.: "Espírito 8 · aptidão Ninja Médico")."""
    partes = [f"{NOMES_ATRIBUTOS.get(k, k)} {v}" for k, v in (info.get('atributos_min') or {}).items()]
    partes += [f'aptidão {a}' for a in info.get('aptidoes_req') or []]
    if info.get('elementos_permitidos'):
        partes.append('elementos só ' + ' e '.join(info['elementos_permitidos']))
    return ' · '.join(partes)


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
    poderes, av = validar_poderes(s.get('poderes'), cla, livre, pontos_poder(nc), atributos=attrs, aptidoes=apts, nc=nc)
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
    'sociais': ('social', 'sociais', 'carisma', 'manipul'),
    'aptidoes_gratuitas': ('aptid',),
    'poderes': ('poder', 'jutsu', 'ninjutsu', 'taijutsu', 'genjutsu', 'ninpou', 'hijutsu'),
    'historia': ('histori', 'passado', 'origem', 'background'),
    'conceito': ('conceito', 'personalidade', 'ideia do personagem'),
    'nome': ('nome',),
    'cla': ('cla ', 'cla?', 'cla,', 'cla.', 'clan'),
    'vila': ('vila', 'aldeia'),
    'segundo_cla': ('segundo cla', '2 cla', '2o cla', '2º cla', 'outro cla', 'segundo hijutsu'),
    'equipamento': ('equip', 'arma ', 'armas', 'item', 'itens', 'mochila', 'compra', 'ryo'),
    'combate_base': ('base de combate', 'bases de combate', 'habilidades de combate', 'combate corporal', 'combate a distancia',
                     'esquiva', 'ler movimento', ' cc ', ' cd ', ' lm '),
}
BASES = ('cc', 'cd', 'esq', 'lm')


def preco_arma(a):
    """Arremesso "3 Ryos cada": a ficha compra o pacote de unidades da tabela (ex.: Kunai ×3)."""
    return int(a.get('preco') or 0) * (int(a.get('unidades') or 1) if a.get('cada') else 1)


def opcoes_equipamento():
    armas = '; '.join(f"{a['id']} ({a['categoria']}, {a['grupo']}, dano +{a['dano']}, {preco_arma(a)} Ryos"
                      + (f" por {a['unidades']}" if a.get('cada') and a.get('unidades') else '') + ')' for a in ARMAS.values())
    itens = '; '.join(f"{i['id']} ({i['preco']} Ryos)" for i in ITENS.values())
    return f'ARMAS: {armas}\nITENS: {itens}'


def conferir_equipamento(pedido_ia, atual, aptidoes, complementos):
    """Compras sugeridas pela IA: só o que existe, cabendo nos Ryos; arma marcial só com Usar Arma dela."""
    eq = atual.get('equipamento') or {}
    ryo = int(eq.get('ryo', 100) or 0)
    ja_tem = set(eq.get('armas') or [])
    usar_arma = sem_acento(str(complementos.get('usar_arma') or '')) if 'usar_arma' in aptidoes else ''
    armas, itens, custo, avisos = [], {}, 0, []
    for x in pedido_ia.get('armas') or []:
        a = ARMAS.get(sem_prefixo(x.get('id') if isinstance(x, dict) else x)) or next(
            (v for v in ARMAS.values() if sem_acento(v['nome']) == sem_acento(str(x))), None)
        if not a or a['id'] in armas or (a['id'] in ja_tem and not a.get('cada')):
            continue
        if a['categoria'] == 'marcial' and not (usar_arma and (usar_arma in sem_acento(a['nome']) or sem_acento(a['nome']).split(' (')[0] in usar_arma)):
            avisos.append(f'{a["nome"]} é arma marcial: precisa da aptidão Usar Arma ({a["nome"]}), senão é −3. Não comprei.')
            continue
        if custo + preco_arma(a) > ryo:
            avisos.append(f'{a["nome"]} ({preco_arma(a)} Ryos) não coube nos {ryo} Ryos.')
            continue
        armas.append(a['id'])
        custo += preco_arma(a)
    pedidos_itens = pedido_ia.get('itens') or {}
    if isinstance(pedidos_itens, list):
        pedidos_itens = {(x.get('id') if isinstance(x, dict) else x): (x.get('quantidade', 1) if isinstance(x, dict) else 1) for x in pedidos_itens}
    for k, qtd in pedidos_itens.items():
        i = ITENS.get(sem_prefixo(k)) or next((v for v in ITENS.values() if sem_acento(v['nome']) == sem_acento(str(k))), None)
        try:
            qtd = max(1, min(10, int(qtd or 1)))
        except (TypeError, ValueError):
            qtd = 1
        if not i:
            continue
        while qtd and custo + i['preco'] * qtd > ryo:
            qtd -= 1
        if not qtd:
            avisos.append(f'{i["nome"]} ({i["preco"]} Ryos) não coube nos Ryos que sobraram.')
            continue
        itens[i['id']] = itens.get(i['id'], 0) + qtd
        custo += i['preco'] * qtd
    if armas or itens:
        avisos.append(f'Compras: {custo} Ryos (você tem {ryo}; sobram {ryo - custo}).')
        nomes = {**{x: ARMAS[x]['nome'] for x in armas}, **{x: ITENS[x]['nome'] for x in itens}}
        return {'armas': armas, 'itens': itens, 'custo': custo, 'ryo_antes': ryo, 'nomes': nomes}, avisos
    return None, avisos  # Combate Corporal, à Distância, Esquiva, Ler Movimento


def ajustar_bases(pedidas):
    """Bases de combate: cada uma começa em 3 e dá para mover até 2 pontos entre elas (a soma fica 12, mínimo 1).
    Mantém a ideia da IA: sobe primeiro as que ela mais quis subir e tira das que ela mais quis baixar."""
    quer = {k: int((pedidas or {}).get(k, 3) or 3) for k in BASES}
    bases = dict.fromkeys(BASES, 3)
    movidos = 0
    for k in sorted(BASES, key=lambda k: -quer[k]):
        while movidos < 2 and bases[k] < min(5, quer[k]):
            bases[k] += 1
            movidos += 1
    outras = sorted([k for k in BASES if bases[k] <= 3], key=lambda k: quer[k])
    for k in outras:  # primeiro tira até o valor que a IA quis
        while movidos and bases[k] > max(1, quer[k]):
            bases[k] -= 1
            movidos -= 1
    while movidos and any(bases[k] > 1 for k in outras):  # faltou: tira 1 de cada, em rodízio
        for k in outras:
            if movidos and bases[k] > 1:
                bases[k] -= 1
                movidos -= 1
    return bases
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


def _texto_busca(texto):
    return ' ' + re.sub(r'[^a-z0-9 ]', ' ', sem_acento(texto)) + ' '


def nome_citado(nome, t):
    """O nome (ou um pedaço dele, ex.: "Satetsu" de "Jiton: Satetsu (Areia de Ferro)") aparece no texto t?"""
    base = sem_acento(nome)
    partes = [base.split('(')[0]] + re.findall(r'\(([^)]*)\)', base) + [x for x in re.split(r'[:(),]', base)]
    for x in partes:
        x = re.sub(r'[^a-z0-9 ]', ' ', x).strip()
        if x in CLAS_SEM_ACENTO:  # "Aburame" ou "Jiton" sozinhos são o clã, não o item
            continue
        if len(x) >= 5 and f' {x} ' in t:
            return True
    return False


def citados_no_pedido(pedido):
    """Aptidões e poderes que o jogador citou pelo nome (ex.: "Kikaichuu", "Satetsu"): {'aptidoes': [...], 'poderes': [...]}."""
    t = _texto_busca(pedido)
    def citado(nome):
        return nome_citado(nome, t)
    apts = [a['id'] for a in OPCOES['aptidoes'] if citado(a['nome']) and a.get('gratuita', True)]
    # "Kikaichuu" também casa com "Kikaichuu Nv 2": fica só o nome mais curto (a aptidão básica).
    apts = [a for a in apts if not any(b != a and NOMES_APTIDOES[a].startswith(NOMES_APTIDOES[b].split(' (')[0]) and len(NOMES_APTIDOES[b]) < len(NOMES_APTIDOES[a]) for b in apts)]
    pods = [p['id'] for p in OPCOES['poderes'] if citado(p['nome'])]
    return {'aptidoes': apts, 'poderes': pods}


def conferir_ajuda(s, atual, lim: Limites, livre, pedido='', liberados=(), nc=4, completar=False):
    """Confere só as partes que a IA mudou (e que o pedido deixa mudar). Devolve {mudancas, explicacao, avisos}."""
    avisos, m = [], {}
    s = normalizar_sugestao(s)
    # Para saber quais atributos importam, conta também o que a IA sugeriu (ex.: Sharingan → Agilidade).
    ficha_prio = {**atual,
                  'aptidoes_gratuitas': list(atual.get('aptidoes_gratuitas') or []) + [sem_prefixo(a) for a in (s.get('aptidoes_gratuitas') or []) + (s.get('aptidoes_extra') or []) if isinstance(a, str)],
                  'poderes': list(atual.get('poderes') or []) + [x for x in (s.get('poderes') or []) if isinstance(x, dict)]}
    pode = partes_pedidas(pedido)
    # A IA às vezes põe aptidão na lista de poderes (ex.: Sharingan) ou poder na de aptidões (ex.: Fuuinjutsu):
    # muda de lista em vez de jogar fora. Aptidão vinda dos poderes vira aptidão extra.
    def _id_de(x):
        return sem_prefixo(x.get('id') or x.get('nome') or '') if isinstance(x, dict) else sem_prefixo(x)
    def _apt(i):
        return i if i in IDS_APTIDOES else ID_POR_NOME_APTIDAO.get(sem_acento(i))
    def _pod(i):
        return i if i in PODERES else ID_POR_NOME_PODER.get(sem_acento(i))
    comps_ia = dict(s.get('complementos') or {}) if isinstance(s.get('complementos'), dict) else {}
    for chave_apt in ('aptidoes_gratuitas', 'aptidoes_extra'):
        if isinstance(s.get(chave_apt), list):
            for x in s[chave_apt]:
                if isinstance(x, dict) and x.get('complemento'):
                    comps_ia[_id_de(x)] = x['complemento']
            s[chave_apt] = [_id_de(x) for x in s[chave_apt]]
    if isinstance(s.get('poderes'), list):
        trocadas = [_apt(_id_de(x)) for x in s['poderes'] if not _pod(_id_de(x)) and _apt(_id_de(x))]
        if trocadas:
            s['poderes'] = [x for x in s['poderes'] if _pod(_id_de(x)) or not _apt(_id_de(x))]
            ja_listadas = {_apt(sem_prefixo(a)) for a in (s.get('aptidoes_gratuitas') or []) + (s.get('aptidoes_extra') or []) if isinstance(a, str)}
            s['aptidoes_extra'] = list(s.get('aptidoes_extra') or []) + [t for t in trocadas if t not in ja_listadas]
    for chave_apt in ('aptidoes_gratuitas', 'aptidoes_extra'):
        if isinstance(s.get(chave_apt), list):
            trocados = [_pod(_id_de(x)) for x in s[chave_apt] if not _apt(_id_de(x)) and _pod(_id_de(x))]
            if trocados:
                s[chave_apt] = [x for x in s[chave_apt] if _apt(_id_de(x)) or not _pod(_id_de(x))]
                tem = {_pod(_id_de(x)) for x in s.get('poderes') or []}
                s['poderes'] = list(s.get('poderes') or []) + [{'id': t, 'nivel': 1} for t in trocados if t not in tem]
    s = {k: v for k, v in s.items() if k == 'explicacao' or k in pode or (k == 'aptidoes_extra' and 'aptidoes_gratuitas' in pode)}
    comps_ia = {(k if k in IDS_APTIDOES else ID_POR_NOME_APTIDAO.get(sem_acento(k), k)): v for k, v in comps_ia.items()}
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
    if isinstance(s.get('segundo_cla'), str) and s['segundo_cla'].strip():
        seg = s['segundo_cla'].strip()
        seg = next((c for c in OPCOES['clas'] if sem_acento(c) == sem_acento(seg)), None)
        if not livre:
            avisos.append('Segundo clã só com liberação do Mestre (ele marca "Liberar regras" na sua ficha); não mudei.')
        elif not seg:
            avisos.append(f'Clã "{s["segundo_cla"]}" não existe na lista; não mudei o segundo clã.')
        elif seg in (m.get('cla'), atual.get('cla')):
            avisos.append(f'{seg} já é o seu clã principal; não coloquei como segundo clã.')
        elif seg != atual.get('segundo_cla'):
            m['segundo_cla'] = seg
    if isinstance(s.get('combate_base'), dict) and s['combate_base']:
        pedidas = {chave(k).replace('esquiva', 'esq').replace('ler_movimento', 'lm').replace('combate_corporal', 'cc')
                   .replace('combate_a_distancia', 'cd'): v for k, v in s['combate_base'].items()}
        try:
            bases = ajustar_bases(pedidas)
        except (TypeError, ValueError):
            bases = None
        if bases and bases != {k: int((atual.get('combate_base') or {}).get(k, 3) or 3) for k in BASES}:
            m['combate_base'] = bases
    cla = ' / '.join(x for x in [m.get('cla', atual.get('cla') or ''), m.get('segundo_cla', atual.get('segundo_cla') or '')] if x)

    if isinstance(s.get('atributos'), dict) and s['atributos']:
        base = {**(atual.get('atributos') or {}), **s['atributos']}
        importantes = [a for a, _ in prioridades(ficha_prio, lim)[:3]]
        attrs = ajustar_atributos(base, lim.atributos, lim.min_atributo, lim.max_atributo, importantes)
        # Os 2 atributos mais importantes para os poderes/aptidões ficam pelo menos em (máximo - 1):
        # tira dos que não importam, do maior para o menor.
        alvo = max(lim.min_atributo, lim.max_atributo - 1)
        for imp in importantes[:2]:
            while attrs[imp] < alvo:
                doadores = [k for k in ATRIBUTOS if k not in importantes and attrs[k] > lim.min_atributo]
                if not doadores:
                    break
                d = max(doadores, key=lambda k: attrs[k])
                attrs[d] -= 1
                attrs[imp] += 1
        if attrs != {k: int((atual.get('atributos') or {}).get(k, 0) or 0) for k in ATRIBUTOS}:
            m['atributos'] = attrs
    if 'atributos' in m:
        for attr, motivos in prioridades(ficha_prio, lim)[:2]:
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
    if isinstance(s.get('sociais'), dict) and s['sociais']:
        soc = {k: max(0, min(lim.max_social, int(s['sociais'].get(k, 0) or 0))) for k in ('carisma', 'manipulacao')}
        atual_soc = {k: int((atual.get('sociais') or {}).get(k, 0) or 0) for k in soc}
        if sum(soc.values()) < lim.sociais and sum(atual_soc.values()) == lim.sociais:
            soc = atual_soc  # a IA deixou faltando e a ficha já estava certa: fica como estava
        while sum(soc.values()) > lim.sociais:
            soc[max(soc, key=soc.get)] -= 1
        for k in sorted(soc, key=lambda k: -soc[k]):  # faltou ponto: completa
            while sum(soc.values()) < lim.sociais and soc[k] < lim.max_social:
                soc[k] += 1
        if soc != {k: int((atual.get('sociais') or {}).get(k, 0) or 0) for k in soc}:
            m['sociais'] = soc
    ja_tem = set(atual.get('aptidoes_gratuitas') or []) | set(atual.get('aptidoes_extra') or [])
    gratuitas = list(atual.get('aptidoes_gratuitas') or [])
    extras_lista = list(atual.get('aptidoes_extra') or [])
    mexeu_apts = False
    # Ficha sem clã, mas com aptidões/poderes de um clã só (ex.: Sharingan → Uchiha): se o pedido deixa mudar o clã, põe.
    if 'cla' in pode and not (m.get('cla') or atual.get('cla')):
        ids = [sem_prefixo(a) for a in [*(s.get('aptidoes_gratuitas') or []), *(s.get('aptidoes_extra') or []), *(atual.get('aptidoes_gratuitas') or [])]]
        ids += [sem_prefixo(x.get('id')) for x in [*(s.get('poderes') or []), *(atual.get('poderes') or [])] if isinstance(x, dict)]
        clas = {}
        for i in ids:
            info = APTIDOES.get(i) or PODERES.get(i) or {}
            lista = [info['cla']] if isinstance(info.get('cla'), str) else (info.get('cla') or [])
            if len(lista) == 1 and lista[0] in OPCOES['clas']:
                clas[lista[0]] = clas.get(lista[0], 0) + 1
        if clas:
            m['cla'] = max(clas, key=clas.get)
            cla = ' / '.join(x for x in [m['cla'], atual.get('segundo_cla') or ''] if x)
            avisos.append(f'Coloquei o clã {m["cla"]}, que é o das aptidões/poderes da ficha.')
    movidas = []
    if isinstance(s.get('aptidoes_gratuitas'), list) and s['aptidoes_gratuitas']:
        gratuitas, av = validar_aptidoes(s['aptidoes_gratuitas'], cla, livre, ja_tem=ja_tem, liberados=set(liberados), para_extra=movidas)
        avisos += av
        mexeu_apts = True
    if 'aptidoes_gratuitas' in pode and isinstance(s.get('aptidoes_extra'), list):
        extras_lista, av = validar_aptidoes(s['aptidoes_extra'], cla, livre, ja_tem=ja_tem, liberados=set(liberados), gratuitas=False, limite=lim.poder // 2)
        extras_lista = [a for a in extras_lista if a not in gratuitas]
        avisos += av
        mexeu_apts = True
    for a in movidas:  # aptidão movida para extra não pode comer os pontos de poder todos (sobram pelo menos 2)
        if a in extras_lista:
            continue
        if a in ja_tem or 2 * (len(extras_lista) + 1) <= lim.poder - 2:
            extras_lista.append(a)
        else:
            avisos[:] = [x for x in avisos if not (x.startswith(NOMES_APTIDOES.get(a, a)) and 'passei para aptidão extra' in x)]
            avisos.append(f'{NOMES_APTIDOES.get(a, a)} não pode ser aptidão gratuita e não cabe como extra; tirei da sugestão.')
    def contexto_ficha():
        """Como a ficha fica (para conferir pré-requisitos das aptidões)."""
        pods = {x.get('id'): int(x.get('nivel', 1) or 1) for x in atual.get('poderes') or [] if isinstance(x, dict)}
        pods.update({sem_prefixo(x.get('id') or ''): int(x.get('nivel', 1) or 1) for x in s.get('poderes') or [] if isinstance(x, dict)})
        return {'atributos': m.get('atributos') or atual.get('atributos') or {},
                'pericias': m.get('pericias', atual.get('pericias') or {}),
                'combate_base': atual.get('combate_base') or {}, 'poderes': pods,
                'aptidoes': [NOMES_APTIDOES.get(a, a) for a in gratuitas + extras_lista], 'cla': cla,
                'usa': lim.pericias_atributo or {}}
    if mexeu_apts:
        gratuitas, extras_lista, av = conferir_dependencias(gratuitas, extras_lista, livre)
        avisos += av
        if not livre:
            # Pré-requisitos (págs. 56–70): aptidão nova que a ficha ainda não pode ter sai; a que o jogador já tinha só avisa.
            for _ in range(2):
                ctx = contexto_ficha()
                fora = [a for a in gratuitas + extras_lista if a not in ja_tem and a not in liberados and prereqs_faltando(a, ctx)]
                for a in fora:
                    avisos.append(f'{NOMES_APTIDOES[a]} pede {" e ".join(prereqs_faltando(a, ctx))}; tirei da sugestão.')
                gratuitas = [a for a in gratuitas if a not in fora]
                extras_lista = [a for a in extras_lista if a not in fora]
                if not fora:
                    break
        # Aptidão de clã que o jogador já tinha (ex.: Sharingan) não some porque a IA esqueceu: fica como extra.
        for a in [x for x in (list(atual.get('aptidoes_gratuitas') or []) + list(atual.get('aptidoes_extra') or []))
                  if (APTIDOES.get(x) or {}).get('cla') and x not in gratuitas and x not in extras_lista]:
            info = APTIDOES[a]
            if not livre and a not in liberados and not combina_cla(info.get('cla'), cla):
                continue
            if any(NOMES_APTIDOES.get(a) in x for x in avisos):  # saiu por um motivo (regra): não volta
                continue
            if 2 * (len(extras_lista) + 1) <= lim.poder - 2:
                extras_lista.append(a)
                avisos.append(f'Mantive {info["nome"]} (aptidão do seu clã) como aptidão extra.')
        if len(gratuitas) < 3:
            avisos.append(f'Só {len(gratuitas)} de 3 aptidões gratuitas são válidas; escolha {3 - len(gratuitas)} na ficha.')
        if gratuitas and gratuitas != list(atual.get('aptidoes_gratuitas') or []):
            m['aptidoes_gratuitas'] = gratuitas
        if extras_lista != list(atual.get('aptidoes_extra') or []):
            m['aptidoes_extra'] = extras_lista
    # Complemento das aptidões genéricas (pág. 57): categoria, perícia ou atributo.
    comps_atuais = atual.get('complementos') or {}
    finais = list(m.get('aptidoes_gratuitas', atual.get('aptidoes_gratuitas') or [])) + list(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
    comps = {}
    pericias_finais = m.get('pericias', atual.get('pericias') or {})
    attrs_c = m.get('atributos') or atual.get('atributos') or {}
    for a in finais:
        info = APTIDOES.get(a) or {}
        tipo = info.get('complemento')
        if not tipo:
            continue
        valor = str(comps_ia.get(a) or comps_atuais.get(a) or '').strip()
        if tipo == 'pericia':
            disp = lim.pericias_disponiveis or list(lim.pericias_atributo or {})
            chave_p = next((k for k in disp if sem_acento(k) == sem_acento(valor).replace(' ', '_')), None)
            if not chave_p:  # a perícia em que a ficha mais investiu
                chave_p = max(disp, key=lambda k: int(pericias_finais.get(k, 0) or 0), default='') if disp else ''
            valor = chave_p
        elif tipo == 'atributo':
            chave_a = next((k for k in ATRIBUTOS if sem_acento(k) == sem_acento(valor) or sem_acento(NOMES_ATRIBUTOS[k]) == sem_acento(valor)), None)
            valor = chave_a or max(ATRIBUTOS, key=lambda k: int(attrs_c.get(k, 0) or 0))
        else:
            escolhas = (lim.complementos_escolhas or {}).get(a) or []
            if escolhas:
                valor = next((o for o in escolhas if sem_acento(o) == sem_acento(valor)), '') or next(
                    (o for o in escolhas if valor and sem_acento(valor) in sem_acento(o)), '')
                if not valor:  # escolhe pelo estilo: quem tem mais Destreza que Força, à distância
                    dist = int(attrs_c.get('destreza', 0) or 0) > int(attrs_c.get('forca', 0) or 0)
                    valor = next((o for o in escolhas if ('arremess' if dist else 'desarm') in sem_acento(o)), escolhas[0])
                    avisos.append(f'{info["nome"]}: escolhi "{valor}" (troque na ficha se quiser).')
            valor = valor[:40]
            if not valor:
                avisos.append(f'{info["nome"]}: escolha na ficha {(info.get("dica") or "o complemento").lower()}.')
        if valor and valor != comps_atuais.get(a):
            comps[a] = valor
    if comps:
        m['complementos'] = comps
    if isinstance(s.get('equipamento'), dict) and s['equipamento'] and (ARMAS or ITENS):
        apts_eq = set(m.get('aptidoes_gratuitas', atual.get('aptidoes_gratuitas') or [])) | set(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
        compras, av = conferir_equipamento(s['equipamento'], atual, apts_eq, {**(atual.get('complementos') or {}), **comps})
        avisos.extend(av)
        if compras:
            m['equipamento'] = compras
    # Poderes vêm antes das aptidões extras novas: se as extras comerem os pontos dos poderes sugeridos,
    # as extras novas saem (as que o jogador já tinha ficam).
    if isinstance(s.get('poderes'), list) and s['poderes'] and m.get('aptidoes_extra'):
        attrs_tmp = m.get('atributos') or atual.get('atributos') or {}
        apts_tmp = list(m.get('aptidoes_gratuitas') or atual.get('aptidoes_gratuitas') or []) + list(m['aptidoes_extra'])
        desejados, _ = validar_poderes(s['poderes'], cla, livre, lim.poder, liberados=set(liberados), atributos=attrs_tmp, aptidoes=apts_tmp, nc=nc)
        custo = sum(x['nivel'] for x in desejados)
        while desejados and 2 * len(m['aptidoes_extra']) + custo > lim.poder:
            novas = [a for a in m['aptidoes_extra'] if a not in ja_tem]
            if not novas:
                break
            tirada = novas[-1]
            m['aptidoes_extra'].remove(tirada)
            avisos.append(f'{NOMES_APTIDOES.get(tirada, tirada)} (aptidão extra) tiraria os pontos dos poderes; tirei da sugestão.')
        if m['aptidoes_extra'] == list(atual.get('aptidoes_extra') or []):
            del m['aptidoes_extra']
    if isinstance(s.get('poderes'), list) and s['poderes']:
        extras = len(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
        attrs_finais = m.get('atributos') or atual.get('atributos') or {}
        apts_finais = list(m.get('aptidoes_gratuitas') or atual.get('aptidoes_gratuitas') or []) + list(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
        nomes_atuais = {x.get('id'): x.get('nome') for x in atual.get('poderes') or [] if isinstance(x, dict)}
        efeitos_atuais = {x.get('id'): x.get('efeitos') or [] for x in atual.get('poderes') or [] if isinstance(x, dict)}
        poderes, av = validar_poderes(s['poderes'], cla, livre, max(0, lim.poder - 2 * extras), liberados=set(liberados),
                                      atributos=attrs_finais, aptidoes=apts_finais, nc=nc,
                                      nomes_atuais=nomes_atuais, personagem=m.get('nome') or atual.get('nome') or '',
                                      efeitos_atuais=efeitos_atuais)
        avisos += av
        if poderes:
            m['poderes'] = poderes
    # Faltou aptidão gratuita ou sobrou ponto de poder: completa com o que mais combina (o jogador troca se quiser).
    if completar:
        attrs_finais = m.get('atributos') or atual.get('atributos') or {}
        if 'aptidoes_gratuitas' in pode and 'aptidoes_gratuitas' in m and len(m['aptidoes_gratuitas']) < 3:
            ja = list(m['aptidoes_gratuitas']) + list(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
            for aid in aptidoes_possiveis(cla, livre, set(liberados), attrs_finais, ja, ctx=contexto_ficha())[:3 - len(m['aptidoes_gratuitas'])]:
                m['aptidoes_gratuitas'].append(aid)
                avisos.append(f'Completei as aptidões gratuitas com {NOMES_APTIDOES[aid]} (troque na ficha se quiser).')
            avisos[:] = [x for x in avisos if 'aptidões gratuitas são válidas' not in x]
        if 'poderes' in pode and 'poderes' in m:
            extras_n = len(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
            sobra = max(0, lim.poder - 2 * extras_n) - sum(x['nivel'] for x in m['poderes'])
            apts_todas = list(m.get('aptidoes_gratuitas') or atual.get('aptidoes_gratuitas') or []) + list(m.get('aptidoes_extra', atual.get('aptidoes_extra') or []))
            for x in m['poderes']:  # primeiro sobe o nível do que já tem
                while sobra > 0 and x['nivel'] < max(1, nc // 2):
                    x['nivel'] += 1
                    sobra -= 1
                if PODERES[x['id']].get('efeitos'):
                    x['efeitos'] = escolher_efeitos(x['id'], x['nivel'], x.get('efeitos') or [])[0]
            while sobra > 0:
                opcoes = poderes_possiveis(cla, livre, set(liberados), attrs_finais, apts_todas, [x['id'] for x in m['poderes']])
                if not opcoes:
                    break
                pid = opcoes[0]
                nivel = min(sobra, max(1, nc // 2))
                novo = {'id': pid, 'nome': PODERES[pid]['nome'], 'nivel': nivel}
                if PODERES[pid].get('efeitos'):
                    novo['efeitos'] = escolher_efeitos(pid, nivel)[0]
                if PODERES[pid].get('precisa_nome'):
                    # Nome provisório (a ficha não salva sem nome); o jogador troca quando quiser.
                    primeiro = str(m.get('nome') or atual.get('nome') or '').split(' — ')[0].split(' - ')[0].strip().split(' ')[0]
                    novo['nome_proprio'] = f"{PODERES[pid]['nome'].split(' (')[0]}: Arte de {primeiro}" if primeiro else f"{PODERES[pid]['nome'].split(' (')[0]}: Estilo Próprio"
                m['poderes'].append(novo)
                sobra -= nivel
                avisos.append(f'Completei os pontos de poder com {PODERES[pid]["nome"]} nível {nivel}'
                              + (f' com o nome provisório "{novo["nome_proprio"]}"' if novo.get('nome_proprio') else '') + ' (troque na ficha se quiser).')
            if sobra <= 0:
                avisos[:] = [x for x in avisos if not x.startswith('Sobraram')]
    # Partes iguais ao que a ficha já tem não aparecem no "antes → depois".
    if 'pericias' in m and {k: v for k, v in m['pericias'].items() if v} == {k: int(v) for k, v in (atual.get('pericias') or {}).items() if v}:
        del m['pericias']
    if 'poderes' in m:
        como_esta = sorted((x.get('id'), int(x.get('nivel', 1) or 1), str(x.get('nome') or ''), tuple(x.get('efeitos') or [])) for x in atual.get('poderes') or [] if isinstance(x, dict))
        como_fica = sorted((x['id'], x['nivel'], x.get('nome_proprio', ''), tuple(x.get('efeitos') or [])) for x in m['poderes'])
        if como_esta == como_fica:
            del m['poderes']
    rotulos = {'equipamento': 'equipamento', 'combate_base': 'bases de combate', 'segundo_cla': 'segundo clã', 'atributos': 'atributos', 'pericias': 'perícias', 'sociais': 'pontos sociais', 'aptidoes_gratuitas': 'aptidões', 'poderes': 'poderes', 'historia': 'história', 'conceito': 'conceito'}
    pedidas = [rotulos[p] for p in pode if p in rotulos and p not in m]
    if not m and 'atributos' in s and 'atributos' in pode:
        avisos.append('A IA achou que seus atributos já estão bons para o personagem e não mudou nada.')
    elif not m:
        avisos.append('A IA não sugeriu nenhuma mudança. Tente pedir de outro jeito.')
    elif len(pode) < len(PARTES) and pedidas:
        avisos.append(f'A IA não mudou: {", ".join(pedidas)}. Se quiser, peça de novo.')
    # Nomes das aptidões/poderes (de antes e de depois) para o site mostrar "antes → depois".
    ids = set(m.get('aptidoes_gratuitas', [])) | set(atual.get('aptidoes_gratuitas') or []) | set(m.get('aptidoes_extra', [])) | set(atual.get('aptidoes_extra') or [])
    ids |= {x['id'] for x in m.get('poderes', [])} | {x.get('id') for x in atual.get('poderes') or [] if isinstance(x, dict)}
    nomes_ficha = dict(atual.get('nomes') or {})
    for x in m.get('poderes', []):
        nomes_ficha.update({e['id']: e['nome'] for e in PODERES.get(x['id'], {}).get('efeitos') or []})
    ids |= {e for x in m.get('poderes', []) for e in x.get('efeitos') or []}
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
        f"Pontos sociais: carisma {(f.get('sociais') or {}).get('carisma', 0)}, manipulacao {(f.get('sociais') or {}).get('manipulacao', 0)} (soma de {lim.sociais})",
        'Bases de combate: ' + ', '.join(f"{k} {(f.get('combate_base') or {}).get(k, 3)}" for k in BASES) + ' (CC+Força, CD+Destreza, ESQ+Agilidade, LM+Percepção)',
        'Equipamento: armas ' + (', '.join(ARMAS.get(x, {}).get('nome', x) for x in (f.get('equipamento') or {}).get('armas') or []) or 'nenhuma')
        + '; itens ' + (', '.join(f"{ITENS.get(k, {}).get('nome', k)} x{q}" for k, q in ((f.get('equipamento') or {}).get('itens') or {}).items()) or 'nenhum')
        + f"; Ryos {(f.get('equipamento') or {}).get('ryo', 100)}",
        'Aptidões gratuitas: ' + (', '.join(apts) or 'nenhuma'),
        'Aptidões extras (2 pontos de poder cada): ' + (', '.join(extras) or 'nenhuma'),
        'Poderes: ' + (', '.join(pods) or 'nenhum'),
        *(['O que os poderes e aptidões fazem:', *resumos] if resumos else []),
        *([f'Atributo que cada perícia usa: {usa}'] if usa else []),
        *[f"Efeitos do {nome(x.get('id'))} (id e nível mínimo; 1 por nível do poder, repetir = evoluir): "
          + ', '.join(f"{e['id']}({e['nivel']})" for e in PODERES[x['id']]['efeitos'])
          for x in f.get('poderes') or [] if isinstance(x, dict) and PODERES.get(x.get('id'), {}).get('efeitos')],
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
    # Clãs dos itens que a ficha já tem (ex.: Sharingan na ficha sem clã → as opções do Uchiha entram na lista).
    for i in [*(p.ficha.get('aptidoes_gratuitas') or []), *(p.ficha.get('aptidoes_extra') or []),
              *[x.get('id') for x in p.ficha.get('poderes') or [] if isinstance(x, dict)]]:
        info = APTIDOES.get(i) or PODERES.get(i) or {}
        clas += [info['cla']] if isinstance(info.get('cla'), str) else list(info.get('cla') or [])
    return ' / '.join(c for c in clas if c)


async def trechos_da_ficha(p, partes):
    """Trechos do livro sobre o clã e os poderes/aptidões da ficha, para a IA entender o que eles fazem
    (combos, estilo, história do clã). Poucos e curtos: o modelo pequeno tem pouca memória."""
    if not INDICE.pronto or not ({'poderes', 'aptidoes_gratuitas', 'conceito', 'historia', 'atributos'} & set(partes)):
        return ''
    f = p.ficha
    itens = [NOMES_ITENS.get(x.get('id') if isinstance(x, dict) else x, '') for x in
             list(f.get('poderes') or []) + list(f.get('aptidoes_gratuitas') or []) + list(f.get('aptidoes_extra') or [])]
    cla = ' e '.join(c for c in (f.get('cla'), f.get('segundo_cla')) if c)
    busca = ' '.join(x for x in [f'Clã {cla}.' if cla else '', ', '.join(i for i in itens if i)[:300], p.pedido[:200]] if x)
    try:
        trechos = (await INDICE.buscar(busca, quantos=3))[:Config.TRECHOS_FICHA]
    except Exception as e:  # noqa: BLE001  (sem livro a ajuda continua funcionando)
        print(f'[ficha/ajudar] não consegui buscar no livro: {e}', flush=True)
        return ''
    if not trechos:
        return ''
    texto = '\n\n'.join(f"[{t['livro']}, pág. {t['pagina']}]\n{t['texto'][:Config.TAMANHO_TRECHO_FICHA]}" for t in trechos)
    return ('TRECHOS DO LIVRO sobre o clã e os poderes desta ficha (use para entender o estilo e os combos; '
            f'os ids e as regras de pontos continuam valendo):\n{texto}\n\n')


@app.post('/ficha/ajudar')
async def ajudar_ficha(p: AjudaFicha):
    """Ajuda aos poucos: recebe a ficha atual + o pedido e devolve só o que mudaria."""
    conferir_tamanho(p.pedido)
    nc = max(4, min(20, p.nc))
    lim = p.limites

    async def tarefa():
        sistema = Prompts.AJUDA_FICHA.format(
            nc=nc, pontos_atributos=lim.atributos, min_atributo=lim.min_atributo, max_atributo=lim.max_atributo,
            pontos_pericias=lim.pericias, max_pericia=lim.max_pericia, pontos_sociais=lim.sociais, max_social=lim.max_social, pericias=', '.join(lim.pericias_disponiveis) or '(todas)',
            pontos_poder=lim.poder, restricao_cla=(Prompts.RESTRICAO_LIVRE if p.livre else Prompts.RESTRICAO_NORMAL) + (
                f"\nO Mestre LIBEROU para esta ficha, mesmo sendo de outro clã: {', '.join(NOMES_ITENS.get(i, i) for i in p.liberados)}."
                if p.liberados and not p.livre else ''),
            opcoes=opcoes_compactas(clas_do_contexto(p), p.livre, set(p.liberados)))
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
        if 'poderes' in partes:
            extras = len(p.ficha.get('aptidoes_extra') or [])
            attrs = p.ficha.get('atributos') or {}
            so += (f'\nPoderes: gaste EXATAMENTE {max(0, lim.poder - 2 * extras)} pontos (cada nível custa 1); nível máximo de cada poder: {max(1, nc // 2)}. '
                   'Só escolha poderes cujas exigências a ficha cumpre (atributos atuais: '
                   + ', '.join(f'{k} {attrs.get(k, 0)}' for k in ATRIBUTOS) + '). No máximo 1 elemento básico (Katon, Suiton, Doton, Fuuton, Raiton).')
        if 'aptidoes_gratuitas' in partes or 'poderes' in partes:
            so += ('\nUse os ids exatamente como na lista (sem "id_"). Aptidões vão em "aptidoes_gratuitas", '
                   'poderes em "poderes" (não misture).')
        if 'equipamento' in partes and (ARMAS or ITENS):
            ryo = int((p.ficha.get('equipamento') or {}).get('ryo', 100) or 0)
            so += (f'\nEquipamento: sugira o que COMPRAR agora (só coisas novas) em "equipamento", gastando no máximo {ryo} Ryos. '
                   'Armas marciais só se a ficha tiver a aptidão Usar Arma daquela arma. Combine com o estilo de luta e os poderes.\n'
                   + opcoes_equipamento())
        so += '\nSempre preencha "explicacao".'
        livro = await trechos_da_ficha(p, partes)
        usuario = f'FICHA ATUAL:\n{ficha_para_ia(p.ficha, lim)}\n\n{livro}PEDIDO: {p.pedido}{so}'
        mensagens = [{'role': 'system', 'content': sistema}, {'role': 'user', 'content': usuario}]
        resultado = None

        def lista_curta(r, sug):
            """Opções já conferidas para esta ficha (o modelo pequeno acerta melhor numa lista curta)."""
            mud = r['mudancas']
            attrs = mud.get('atributos') or p.ficha.get('atributos') or {}
            cla_f = ' / '.join(x for x in [mud.get('cla') or p.ficha.get('cla') or '', p.ficha.get('segundo_cla') or ''] if x)
            apts = list(mud.get('aptidoes_gratuitas', p.ficha.get('aptidoes_gratuitas') or [])) + list(mud.get('aptidoes_extra', p.ficha.get('aptidoes_extra') or []))
            pods = poderes_possiveis(cla_f, p.livre, set(p.liberados), attrs, apts, [x['id'] for x in mud.get('poderes', [])])[:12]
            ctx = {'atributos': attrs, 'pericias': mud.get('pericias', p.ficha.get('pericias') or {}), 'combate_base': p.ficha.get('combate_base') or {},
                   'poderes': {x['id']: x['nivel'] for x in mud.get('poderes', [])}, 'cla': cla_f, 'usa': lim.pericias_atributo or {}}
            ap = aptidoes_possiveis(cla_f, p.livre, set(p.liberados), attrs, apts, ctx=ctx)[:15]
            return (f' PODERES que esta ficha pode ter: {", ".join(pods) or "nenhum"} (já válidos: {", ".join(x["id"] for x in mud.get("poderes", [])) or "nenhum"}).'
                    f' APTIDÕES GRATUITAS que pode ter: {", ".join(ap)} (já válidas: {", ".join(mud.get("aptidoes_gratuitas", [])) or "nenhuma"}).')
        for tentativa in (1, 2):
            bruto = await Ollama.conversar(mensagens, formato='json')
            print(f'[ficha/ajudar] tentativa {tentativa} | pedido: {p.pedido[:80]!r}\n  IA respondeu: {bruto[:600]}', flush=True)
            try:
                sugestao = json.loads(bruto)
            except json.JSONDecodeError:
                continue
            novo = conferir_ajuda(sugestao, p.ficha, lim, p.livre, p.pedido, p.liberados, nc, completar=tentativa == 2)
            # Na 2ª tentativa, fica com a melhor das duas (menos problemas nos poderes).
            # Ficha incompleta (faltando aptidão, sobrando ponto) pesa mais que um item trocado.
            problemas = lambda r: sum(10 if ('Sobraram' in x or 'são válidas' in x) else 1 for x in r['avisos'] if 'tirei' in x or 'Sobraram' in x or 'são válidas' in x)  # noqa: E731
            if resultado is None or (novo['mudancas'] and problemas(novo) <= problemas(resultado)):
                resultado = novo
            ruins = [x for x in novo['avisos'] if 'tirei' in x or 'Sobraram' in x or 'são válidas' in x]
            if ('poderes' in partes or 'aptidoes_gratuitas' in partes) and tentativa == 1 and ruins:
                # Poder inválido ou ponto sobrando: conta para a IA o que deu errado e pede de novo.
                mensagens = mensagens + [
                    {'role': 'assistant', 'content': bruto},
                    {'role': 'user', 'content': 'Problemas na sugestão: ' + ' '.join(ruins) + lista_curta(novo, sugestao) +
                     ' Corrija usando SÓ essas opções, com 3 aptidões gratuitas e gastando todos os pontos de poder. Responda só com o JSON completo.'},
                ]
                continue
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


class RegraTexto(BaseModel):
    texto: str = Field(min_length=3)
    personagens: list[dict] = []   # [{"id": "...", "nome": "..."}] da mesa
    papel: str = 'mestre'


def itens_de_cla_citados(texto):
    """Poderes/aptidões restritos a clã citados pelo nome no texto do Mestre."""
    t = _texto_busca(texto)
    itens = [x for x in [*OPCOES['poderes'], *OPCOES['aptidoes']] if x.get('cla') and nome_citado(x['nome'], t)]
    # "Kikaichuu" também casa com "Kikaichuu Nv 2": fica o nome mais curto.
    nomes = {x['id']: x['nome'] for x in itens}
    return [x['id'] for x in itens if not any(o != x['id'] and x['nome'].startswith(nomes[o].split(' (')[0])
                                              and len(nomes[o]) < len(x['nome']) for o in nomes)]


def personagem_citado(texto, personagens):
    t = _texto_busca(texto)
    for p in personagens:
        primeiro = sem_acento(str(p.get('nome', ''))).split(' — ')[0].split(' - ')[0].strip()
        if len(primeiro) >= 3 and f' {re.sub(r"[^a-z0-9 ]", " ", primeiro).strip()} ' in t:
            return p.get('id')
    return None


@app.post('/regras/interpretar')
async def interpretar_regra(p: RegraTexto):
    """Regras da mesa: o Mestre escreve do jeito dele; volta a regra arrumada para ele conferir e salvar.
    Poderes/aptidões e personagem são achados pelo nome (sem a IA errar o id); a IA só escreve o texto
    e diz se é uma liberação. O site salva (o servidor da IA não escreve no banco)."""
    conferir_tamanho(p.texto)
    itens = itens_de_cla_citados(p.texto)
    alvo = personagem_citado(p.texto, p.personagens)

    async def tarefa():
        dica = ''
        if itens:
            dica = '\nPoderes/aptidões citados: ' + ', '.join(NOMES_ITENS[i] for i in itens) + '.'
        bruto = await Ollama.conversar([
            {'role': 'system', 'content': Prompts.REGRA_DO_MESTRE},
            {'role': 'user', 'content': f'O MESTRE ESCREVEU: {p.texto}{dica}'},
        ], formato='json')
        print(f'[regras/interpretar] {p.texto[:80]!r}\n  IA respondeu: {bruto[:400]}', flush=True)
        try:
            r = normalizar_sugestao(json.loads(bruto)) if bruto.strip().startswith('{') else {}
        except json.JSONDecodeError:
            r = {}
        texto = str(r.get('texto') or r.get('regra') or p.texto).strip()[:1500]
        liberar = bool(itens) and str(r.get('tipo', 'liberar' if itens else 'livre')).lower().startswith('liber')
        return {
            'texto': texto,
            'tipo': 'liberar' if liberar else 'livre',
            'itens': [{'id': i, 'nome': NOMES_ITENS[i]} for i in itens] if liberar else [],
            'personagem_id': alvo if liberar else None,
            'explicacao': str(r.get('explicacao', ''))[:300],
        }

    return com_folego(na_fila('mestre', tarefa))


def limpar_resposta(texto):
    # Alguns modelos devolvem o "pensamento" entre <think>...</think>: não mostra para o jogador.
    return re.sub(r'<think>.*?</think>', '', texto, flags=re.S).strip()
