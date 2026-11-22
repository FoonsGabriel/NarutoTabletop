"""Avaliação da IA (PLANEJAMENTO-IA, fase F5): roda as perguntas de Avaliacao/Perguntas.json e
confere as respostas sozinho. Não precisa do site nem do túnel; usa o Ollama do PC.

Rodar: dois cliques em AVALIAR.bat (pode deixar o INICIAR.bat aberto ou fechado).
Resultado: Avaliacao/Resultado-AAAA-MM-DD_HHhMM.md (resumo) e .json (tudo, para o Claude analisar).

As Regras da mesa dos testes M01–M06 são de mentira (não lê nem grava nada no Supabase).
"""
import asyncio
import json
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

import Regras  # noqa: E402
import Servidor  # noqa: E402
from Busca import INDICE  # noqa: E402
from Fila import FILA  # noqa: E402

PASTA_AVAL = PASTA / 'Avaliacao'


def norm(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


async def corpo(resposta):
    """Lê a resposta do servidor (que manda espaços enquanto pensa e o JSON no fim)."""
    texto = ''
    async for pedaco in resposta.body_iterator:
        texto += pedaco.decode() if isinstance(pedaco, bytes) else pedaco
    return json.loads(texto.strip())


# ---------------------------------------------------------------- Regras da mesa de mentira
REGRAS_TESTE = {'regras': [], 'personagens': {}, 'meus': []}


async def da_mesa_teste(room_id):
    return REGRAS_TESTE['regras'] if room_id == 'teste' else []


async def personagens_teste(_regras, _jogador):
    return REGRAS_TESTE['personagens'], REGRAS_TESTE['meus']


Regras.da_mesa = da_mesa_teste
Regras.personagens = personagens_teste


# ---------------------------------------------------------------- Conferências
def conferir_texto(texto, c):
    t = norm(texto)
    problemas = []
    for grupo in c.get('contem', []):
        if not any(norm(x) in t for x in grupo):
            problemas.append(f'faltou: {" / ".join(grupo)}')
    for x in c.get('nao_contem', []):
        if norm(x) in t:
            problemas.append(f'não devia dizer: {x}')
    if c.get('comeca_com'):
        inicio = re.sub(r'^[^a-z0-9]+', '', t)
        if not any(inicio.startswith(norm(x)) for x in c['comeca_com']):
            problemas.append(f'devia começar com: {" / ".join(c["comeca_com"])}')
    return problemas


def conferir_ficha(r, c, ficha):
    m = r.get('mudancas') or {}
    problemas = []
    partes = set(m) - {'explicacao'}
    if c.get('so_partes') and partes - set(c['so_partes']):
        problemas.append(f'mudou o que não foi pedido: {", ".join(sorted(partes - set(c["so_partes"])))}')
    for p in c.get('tem_partes', []) + c.get('so_partes', []):
        if p not in m:
            problemas.append(f'não mudou: {p}')
    if 'soma_atributos' in c and 'atributos' in m:
        s = sum(int(v or 0) for v in m['atributos'].values())
        if s != c['soma_atributos']:
            problemas.append(f'atributos somam {s} (devia {c["soma_atributos"]})')
    if 'soma_pericias' in c and 'pericias' in m:
        s = sum(int(v or 0) for v in m['pericias'].values())
        if s != c['soma_pericias']:
            problemas.append(f'perícias somam {s} (devia {c["soma_pericias"]})')
        if c.get('max_pericia') and any(int(v or 0) > c['max_pericia'] for v in m['pericias'].values()):
            problemas.append(f'perícia acima de {c["max_pericia"]}')
    if c.get('sem_avisos_ruins'):
        ruins = [a for a in r.get('avisos', []) if 'tirei' in a or 'Sobraram' in a or 'são válidas' in a]
        if ruins:
            problemas.append('servidor teve que corrigir: ' + ' | '.join(ruins)[:300])
    if 'so_do_cla' in c:
        cla = norm(c['so_do_cla'])
        for pid in [x['id'] for x in m.get('poderes', [])] + list(m.get('aptidoes_gratuitas', [])):
            item = Servidor.PODERES.get(pid) or Servidor.APTIDOES.get(pid) or {}
            clas = item.get('cla') or []
            clas = [clas] if isinstance(clas, str) else clas
            if clas and not any(norm(x) in cla for x in clas if x):
                problemas.append(f'{pid} é de outro clã ({", ".join(clas)})')
    if c.get('bases_validas') and 'combate_base' in m:
        b = m['combate_base']
        movidos = sum(max(0, int(v) - 3) for v in b.values())
        if sum(int(v) for v in b.values()) != 12 or movidos > 2 or min(int(v) for v in b.values()) < 1:
            problemas.append(f'bases fora da regra: {b}')
    if 'max_ryo' in c and m.get('equipamento'):
        custo = m['equipamento'].get('custo', 0)
        if custo > c['max_ryo']:
            problemas.append(f'gastou {custo} Ryos (tem {c["max_ryo"]})')
    if c.get('texto_minimo') and len(str(m.get('historia', ''))) < c['texto_minimo']:
        problemas.append(f'história curta ({len(str(m.get("historia", "")))} letras)')
    if c.get('tem_poder') and c['tem_poder'] not in [x['id'] for x in m.get('poderes', [])]:
        problemas.append(f'não colocou o poder {c["tem_poder"]}')
    return problemas


# ---------------------------------------------------------------- Execução
async def pergunta_regra(t, papel='geral', room_id=None):
    trechos = await INDICE.buscar(t['pergunta'])
    achados = sorted({(x['livro'], x['pagina']) for x in trechos})
    p = Servidor.Pergunta(pergunta=t['pergunta'], papel=papel, room_id=room_id, jogador_id='jogador-teste' if room_id else None)
    r = await corpo(await Servidor.perguntar(p))
    return r, achados


async def rodar_um(t, tipo):
    inicio = time.monotonic()
    res = {'id': t['id'], 'tipo': tipo}
    try:
        if tipo == 'regra':
            r, achados = await pergunta_regra(t)
            res.update(pergunta=t['pergunta'], resposta=r.get('resposta', r.get('erro', '')), fontes=r.get('fontes', []),
                       busca=[f'{l} p{p}' for l, p in achados])
            prob = conferir_texto(res['resposta'], t)
            # Páginas aceitas: a principal + outras que trazem a mesma regra ("tambem").
            aceitas = {(t['livro'], p) for p in t['paginas']} | {(x['livro'], p) for x in t.get('tambem', []) for p in x['paginas']}
            citou = {(f['livro'], f['pagina']) for f in res['fontes']}
            if not citou & aceitas:
                prob.append(f'não citou a pág. {"/".join(str(p) for _, p in sorted(aceitas))}'
                            + ('' if set(achados) & aceitas else ' (a busca nem achou essa página)'))
            res['problemas'] = prob
        elif tipo == 'mesa' and t.get('tipo') != 'ficha':
            REGRAS_TESTE.update(regras=t['regras'], personagens=t['personagens'], meus=t['meus'])
            r, _ = await pergunta_regra(t, papel=t['papel'], room_id='teste')
            res.update(pergunta=t['pergunta'], papel=t['papel'], resposta=r.get('resposta', r.get('erro', '')))
            res['problemas'] = conferir_texto(res['resposta'], t['conferir'])
        else:
            a = Servidor.AjudaFicha(pedido=t['pedido'], ficha=t['ficha'], liberados=t.get('liberados', []), limites=Servidor.Limites(
                pericias_disponiveis=['acrobacia', 'arte', 'atletismo', 'ciencias_naturais', 'concentracao', 'cultura', 'disfarces', 'escapar',
                                      'furtividade', 'lidar_animais', 'mecanismos', 'medicina', 'ocultismo', 'prestidigitacao', 'procurar',
                                      'prontidao', 'rastrear'],
                pericias_atributo={'acrobacia': 'agilidade', 'arte': 'inteligencia', 'atletismo': 'forca', 'ciencias_naturais': 'inteligencia',
                                   'concentracao': 'inteligencia', 'cultura': 'inteligencia', 'disfarces': 'percepcao', 'escapar': 'destreza',
                                   'furtividade': 'agilidade', 'lidar_animais': 'percepcao', 'mecanismos': 'inteligencia', 'medicina': 'inteligencia',
                                   'ocultismo': 'inteligencia', 'prestidigitacao': 'destreza', 'procurar': 'percepcao', 'prontidao': 'percepcao',
                                   'rastrear': 'percepcao'}))
            r = await corpo(await Servidor.ajudar_ficha(a))
            res.update(pedido=t['pedido'], resultado=r)
            res['problemas'] = [r['erro']] if 'erro' in r else conferir_ficha(r, t['conferir'], t['ficha'])
    except Exception as e:  # noqa: BLE001
        res['problemas'] = [f'ERRO: {type(e).__name__}: {e}']
    res['segundos'] = round(time.monotonic() - inicio, 1)
    res['ok'] = not res['problemas']
    return res


def resumo_md(resultados, quando):
    ok = sum(r['ok'] for r in resultados)
    linhas = [f'# Avaliação da IA — {quando}', '', f'**{ok} de {len(resultados)} certos.**', '']
    for tipo, nome in (('regra', 'Dúvidas de regras'), ('ficha', 'Ajuda na ficha'), ('mesa', 'Regras da mesa')):
        rs = [r for r in resultados if r['tipo'] == tipo]
        if not rs:
            continue
        linhas += [f'## {nome}: {sum(r["ok"] for r in rs)}/{len(rs)}', '', '| Teste | Certo? | Tempo | Problemas |', '|---|---|---|---|']
        for r in rs:
            linhas.append(f"| {r['id']} | {'✅' if r['ok'] else '❌'} | {r['segundos']} s | {'; '.join(r['problemas']) or '—'} |")
        linhas.append('')
    return '\n'.join(linhas)


async def main():
    if not INDICE.carregar():
        print('Os livros ainda não foram lidos (pasta indice vazia).')
        return
    FILA.iniciar()
    testes = json.loads((PASTA_AVAL / 'Perguntas.json').read_text(encoding='utf-8'))
    lista = [(t, 'regra') for t in testes['regras']] + [(t, 'ficha') for t in testes['ficha']] + [(t, 'mesa') for t in testes['mesa']]
    print(f'Avaliando {len(lista)} testes (uns 10–15 minutos). Pode deixar rodando.\n', flush=True)
    resultados = []
    for i, (t, tipo) in enumerate(lista, 1):
        r = await rodar_um(t, tipo)
        resultados.append(r)
        print(f"[{i}/{len(lista)}] {r['id']} {'OK ' if r['ok'] else 'ERRO'} ({r['segundos']} s) {'; '.join(r['problemas'])[:150]}", flush=True)
    quando = datetime.now().strftime('%Y-%m-%d_%Hh%M')
    (PASTA_AVAL / f'Resultado-{quando}.json').write_text(json.dumps(resultados, ensure_ascii=False, indent=1), encoding='utf-8')
    (PASTA_AVAL / f'Resultado-{quando}.md').write_text(resumo_md(resultados, quando), encoding='utf-8')
    print(f"\nPronto! {sum(r['ok'] for r in resultados)} de {len(resultados)} certos.")
    print(f'Resultado em: Avaliacao\\Resultado-{quando}.md (e .json para o Claude)')


if __name__ == '__main__':
    asyncio.run(main())
