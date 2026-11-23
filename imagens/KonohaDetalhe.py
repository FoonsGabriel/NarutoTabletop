"""Mapão de Konoha — fase 2: níveis de detalhe (PLANEJAMENTO, Fase 7, 22/11).

Cada nível tem o DOBRO (ou 4×) de pedaços do anterior. Cada pedaço novo recebe como REFERÊNCIA o mesmo lugar do
nível anterior ampliado (mantém ruas, cores e prédios no lugar) e um pedido com o estilo de Konoha, só com o que
existe ali (pela planta simplificada) e com os lugares importantes que caem nele.

  nível 4  (mapa geral, Konoha.py)  → ~300 m por pedaço
  nível 16                           → ~80 m por pedaço  (Konoha de ~500 m com ~50 px por bloco de 2 m)
  nível 32                           → ~40 m por pedaço  (Konoha de 1 km)
  nível 64                           → ~20 m por pedaço  (Konoha de 2 km)

Uso (o KONOHA.bat chama isto):
  python KonohaDetalhe.py noite          gera o nível 16 e depois o 32 (o que faltar), exporta e faz a prévia
  python KonohaDetalhe.py nivel 16       só um nível (o anterior precisa estar completo)
  python KonohaDetalhe.py exportar 32    pedaços sem sobra (1024 px, .webp) para o site + manifesto
  python KonohaDetalhe.py previa 32      imagem pequena do nível inteiro
Pode parar e rodar de novo: continua de onde parou.
"""
import argparse
import io
import json
import math
import os
import sys
import subprocess
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Gerar  # noqa: E402
import Konoha  # noqa: E402
from Konoha import KONOHA, SOBRA, T, grade  # noqa: E402

FONTE = {16: 4, 32: 16, 64: 32}
METROS = {16: 80, 32: 40, 64: 20}
SEMENTE = 777


VERSAO = 'v2'  # 22/11 noite: pedidos corrigidos (a v1 ficou em nivel16 / nivel32)


def pasta(n):
    return Konoha.GERAL if n == 4 else os.path.join(KONOHA, f'nivel{n}{VERSAO}')


def peso(i, j, n):
    """Como o Konoha.peso, mas mistura numa faixa mais estreita (64 px): a de 128 deixava partes embaçadas."""
    import numpy as np
    rampa = np.clip((np.arange(SOBRA, dtype=np.float32) - SOBRA * 3 / 8) / (SOBRA / 4), 0, 1)
    wx = np.ones(T, np.float32)
    wy = np.ones(T, np.float32)
    if i > 0:
        wx[:SOBRA] = rampa
    if i < n - 1:
        wx[-SOBRA:] = rampa[::-1]
    if j > 0:
        wy[:SOBRA] = rampa
    if j < n - 1:
        wy[-SOBRA:] = rampa[::-1]
    return np.maximum(wy[:, None] * wx[None, :], 1e-4)


def arq(n, i, j):
    return os.path.join(pasta(n), f'pedaco_{i}_{j}.png')


def caixa_norm(n, i, j):
    passo, lado = grade(n)
    return (i * passo / lado, j * passo / lado, (i * passo + T) / lado, (j * passo + T) / lado)


_CACHE = {}


def _pedaco(n, i, j):
    from PIL import Image
    import numpy as np
    k = (n, i, j)
    if k not in _CACHE:
        if len(_CACHE) > 48:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[k] = np.asarray(Image.open(arq(n, i, j)).convert('RGB'), np.float32)
    return _CACHE[k]


def recorte(n, caixa, tam):
    """Imagem (tam×tam ou (w,h)) do trecho `caixa` (0–1) do nível n, misturando os pedaços que cobrem o trecho."""
    import numpy as np
    from PIL import Image
    passo, lado = grade(n)
    X0, Y0 = int(math.floor(caixa[0] * lado)), int(math.floor(caixa[1] * lado))
    X1, Y1 = int(math.ceil(caixa[2] * lado)), int(math.ceil(caixa[3] * lado))
    X1, Y1 = min(X1, lado), min(Y1, lado)
    W, H = X1 - X0, Y1 - Y0
    soma = np.zeros((H, W, 3), np.float32)
    pesos = np.zeros((H, W), np.float32)
    for j in range(max(0, (Y0 - T) // passo), min(n, Y1 // passo + 1)):
        for i in range(max(0, (X0 - T) // passo), min(n, X1 // passo + 1)):
            tx, ty = i * passo, j * passo
            ax0, ay0, ax1, ay1 = max(X0, tx), max(Y0, ty), min(X1, tx + T), min(Y1, ty + T)
            if ax0 >= ax1 or ay0 >= ay1:
                continue
            if not os.path.isfile(arq(n, i, j)):
                raise FileNotFoundError(f'falta o pedaço {i},{j} do nível {n}')
            p = _pedaco(n, i, j)[ay0 - ty:ay1 - ty, ax0 - tx:ax1 - tx]
            w = peso(i, j, n)[ay0 - ty:ay1 - ty, ax0 - tx:ax1 - tx]
            soma[ay0 - Y0:ay1 - Y0, ax0 - X0:ax1 - X0] += p * w[..., None]
            pesos[ay0 - Y0:ay1 - Y0, ax0 - X0:ax1 - X0] += w
    img = Image.fromarray((soma / np.maximum(pesos, 1e-6)[..., None]).clip(0, 255).astype(np.uint8))
    return img.resize(tam if isinstance(tam, tuple) else (tam, tam), Image.LANCZOS)


# ------------------------------------------------------------------ estilo de Konoha (das imagens do Gabriel, 22/11)
ESTILO = {
    'rua': 'pale packed-earth streets and small stone-paved plazas',
    'cidade': ('town blocks packed with Konoha-style ninja village buildings: two- and three-story houses and shops with '
               'plaster walls in warm pastel colors (cream, beige, pink, mint green), small tiled roofs in red, green, '
               'blue or orange, flat rooftops with round metal water tanks and pipes, cloth awnings, paper lanterns, '
               'wooden utility poles with wires, small yards with round trees'),
    'floresta': 'dense forest of lush round bright-green tree canopies',
    'campo': 'open grass fields and parks with a few round trees and dirt paths',
    'agua': 'rivers and ponds with stone banks (water ONLY where the reference shows water)',
    'pedra': 'a huge rocky mountain cliff of solid tan-grey rock',
    'muro': ('the tall village wall: a thick tan plaster wall with a tiled roof cap on top and large metal pipes '
             'running along it'),
}

# Lugares importantes (planta sem legenda, 1200×1214, conferidos com a legenda da planta em 22/11).
# UNICOS: só o pedaço mais perto recebe (antes vários pedaços desenhavam o mesmo estádio/rostos).
UNICOS = [
    (1172, 612, 'the main village gate: ONE huge pair of green wooden gate doors set in the tall tan plaster wall, '
                'with a small tiled roof over the gate and a wide dirt road going through it'),
    (45, 520, 'the Hokage Monument: ONE tall rocky mountain cliff with four giant carved stone faces of past leaders '
              'side by side on its front, seen from slightly above'),
    (150, 612, 'the Hokage building: ONE large round cylindrical red-orange building with a wide round tiled roof, '
               'next to a small stone plaza at the end of the main avenue'),
    (200, 564, 'the ninja academy: ONE long school building with a schoolyard and a big tree with a rope swing'),
    (575, 780, 'ONE large round stone arena stadium with tiered seats around an open sand field'),
    (600, 710, 'ONE large white multi-story hospital building with a flat roof'),
    (756, 426, 'a small quiet cemetery with rows of stone graves among trees'),
    (90, 250, 'a small round stone memorial plaza with a memorial stone in a clearing'),
]
# AREAS: todo pedaço dentro do raio recebe (texturas de bairro).
AREAS = [
    (730, 1086, 90, 'the hot spring district: steaming hot spring pools, wooden bathhouses with tiled roofs, stone paths '
                    'and red arched wooden bridges with red railings'),
    (720, 880, 70, 'a walled clan compound: traditional houses with dark tiled roofs inside a white plaster wall'),
    (350, 840, 80, 'a large walled traditional clan estate with courtyards, gardens and koi ponds'),
    (830, 160, 150, 'a dense dark old forest with huge ancient trees and tangled roots'),
] + [(x, 612, 45, 'the main avenue: a wide busy shopping street lined with small shops and food stands with colorful '
                  'awnings, hanging red paper lanterns and street stalls') for x in range(250, 1160, 80)]


def dono(n, x, y, pw, ph):
    passo, lado = grade(n)
    gx, gy = x / pw * lado, y / ph * lado
    return (min(n - 1, max(0, round((gx - T / 2) / passo))), min(n - 1, max(0, round((gy - T / 2) / passo))))


def classes_em(ref):
    import numpy as np
    a = np.asarray(ref.resize((128, 128), 0), np.int32)  # 0 = NEAREST: sem cores misturadas
    cores = np.array(list(Konoha.CORES.values()), np.int32)
    perto = ((a[:, :, None, :] - cores[None, None]) ** 2).sum(-1).argmin(-1)
    nomes = list(Konoha.CORES)
    minimo = {'cidade': 0.08}  # a planta tem pontinhos cor de cidade fora da muralha
    return {nomes[k] for k in np.unique(perto) if (perto == k).mean() > minimo.get(nomes[k], 0.02)}


def lugares_em(n, i, j, caixa, planta_wh):
    pw, ph = planta_wh
    unicos = [t for x, y, t in UNICOS if dono(n, x, y, pw, ph) == (i, j)]
    areas = []
    for x, y, r, texto in AREAS:
        nx, ny, rx, ry = x / pw, y / ph, r / pw, r / ph
        if caixa[0] - rx <= nx <= caixa[2] + rx and caixa[1] - ry <= ny <= caixa[3] + ry and texto not in areas:
            areas.append(texto)
    return unicos, areas


def pedido_detalhe(n, tem, unicos, areas):
    partes = [ESTILO[c] for c in ('rua', 'cidade', 'floresta', 'campo', 'agua', 'pedra', 'muro') if c in tem]
    extra = []
    if 'cidade' not in tem:
        extra.append('This piece is OUTSIDE the village: there are NO buildings, NO houses, NO roofs and NO streets here, '
                     'only nature (trees, grass, dirt paths)')
    if 'agua' not in tem:
        extra.append('There is NO water anywhere in this piece')
    if 'muro' not in tem:
        extra.append('there is NO village wall and NO long walls in this piece')
    if 'pedra' not in tem:
        extra.append('there are NO rock cliffs, NO mountains, NO boulders and NO dark rocks in this piece: where the '
                     'reference shows grey or dark smudges, draw the ground, streets or houses around them instead')
    texto_unicos = ' '.join(unicos)
    if not any('stone faces' in u for u in unicos):
        extra.append('NO carved stone faces and NO statues anywhere')
    if not any('arena' in u for u in unicos):
        extra.append('NO round arenas or stadiums')
    lugares = unicos + areas
    return (
        'Redraw this piece of a ninja village map as a much more detailed close-up RPG battle map in 3/4 top-down view '
        'like classic JRPG maps (the ground seen from above; buildings, trees and posts drawn slightly from the front so '
        'their walls and trunks are visible). The reference image is a blurry zoomed-in piece of the same map: keep '
        'the same layout, positions and shapes of streets, buildings, water and trees, but redraw it with crisp clean '
        f'detail. This image shows an area about {METROS[n]} meters across. It is only ONE PIECE of a much larger map: '
        'everything continues past the edges, so never draw frames, borders, fences or walls along the edges of the '
        'image. What is here: ' + '; '.join(partes) + '. '
        + ('Landmarks in this piece: ' + '; '.join(lugares) + '. ' if lugares else '')
        + ('. '.join(extra) + '. ' if extra else '')
        + 'No text, letters, writing on signs, numbers, logos or symbols. No people, no characters. Bright sunny anime '
        'colors, painted cel-shaded style with clean lines and soft shadows, the ground fills the entire image edge to edge.'
    ), texto_unicos


def limpar_referencia(ref, plano):
    """Pinta por cima das manchas cinzentas (pedra/sombra das emendas do mapa geral) onde a planta NÃO tem pedra."""
    import numpy as np
    from PIL import Image, ImageFilter
    a = np.asarray(ref, np.float32)
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    azul = a[..., 2] > a[..., 0] + 6  # telhados escuros são azulados; pedra é cinza neutro/amarronzado
    cinza = (sat < 0.14) & (mx < 175) & (mx > 35) & ~azul
    # só manchas GRANDES (as faixas das emendas): abre a máscara para sumir com telhado, sombra e muro pequeno
    g = Image.fromarray((cinza * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(31)).filter(ImageFilter.MaxFilter(31))
    cinza = np.asarray(g) > 0
    p = np.asarray(plano.resize(ref.size, Image.NEAREST), np.int32)
    cores = np.array(list(Konoha.CORES.values()), np.int32)
    perto = ((p[:, :, None, :] - cores[None, None]) ** 2).sum(-1).argmin(-1)
    nomes = list(Konoha.CORES)
    pode = ~np.isin(perto, [nomes.index('pedra'), nomes.index('muro')])
    m = cinza & pode
    if m.mean() < 0.002:
        return ref
    mascara = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(6))
    pinta = Image.fromarray(cores[perto].astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    return Image.composite(pinta, ref, mascara)


QUENTE, FRIO = 83, 70  # °C da placa de vídeo: passou de QUENTE, espera esfriar até FRIO


def temperatura():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'],
                           capture_output=True, text=True, timeout=10)
        return max(int(x) for x in r.stdout.split())
    except Exception:  # noqa: BLE001
        return None


def esfriar():
    t = temperatura()
    if t is None or t < QUENTE:
        return
    print(f'Placa de vídeo a {t} °C: pausando até esfriar ({FRIO} °C)...', flush=True)
    while t is not None and t > FRIO:
        time.sleep(30)
        t = temperatura()
    print(f'Esfriou ({t} °C). Continuando.', flush=True)


def recuperar_geral():
    """Se a pasta dos 16 pedaços do mapa geral sumiu, recorta eles de novo do Konoha-geral.png montado."""
    from PIL import Image
    if all(os.path.isfile(arq(4, i, j)) for j in range(4) for i in range(4)):
        return
    montado = os.path.join(KONOHA, 'Konoha-geral.png')
    passo, lado = grade(4)
    if not os.path.isfile(montado):
        return
    img = Image.open(montado).convert('RGB')
    if img.size != (lado, lado):
        print(f'Konoha-geral.png tem {img.size}, esperava {lado}x{lado}: não dá para recortar.')
        return
    os.makedirs(pasta(4), exist_ok=True)
    for j in range(4):
        for i in range(4):
            if not os.path.isfile(arq(4, i, j)):
                img.crop((i * passo, j * passo, i * passo + T, j * passo + T)).save(arq(4, i, j))
    print('Pedaços do mapa geral recortados de novo a partir do Konoha-geral.png.')


def gerar_nivel(n, planta_simples):
    from PIL import Image
    fonte = FONTE[n]
    if fonte == 4:
        recuperar_geral()
    os.makedirs(pasta(n), exist_ok=True)
    faltam_fonte = [(i, j) for j in range(fonte) for i in range(fonte) if not os.path.isfile(arq(fonte, i, j))]
    if faltam_fonte:
        print(f'O nível {fonte} ainda não está completo (faltam {len(faltam_fonte)} pedaços). Gere ele antes.')
        return False
    lista = [(i, j) for j in range(n) for i in range(n) if not os.path.isfile(arq(n, i, j))]
    total = n * n
    print(f'\nNível {n} ({n}x{n}, ~{METROS[n]} m por pedaço): faltam {len(lista)} de {total}.')
    inicio = time.time()
    pw, ph = planta_simples.size
    for k, (i, j) in enumerate(lista, 1):
        caixa = caixa_norm(n, i, j)
        esfriar()
        time.sleep(2)
        try:
            ref = recorte(fonte, caixa, T)
            plano = planta_simples.crop((round(caixa[0] * pw), round(caixa[1] * ph), round(caixa[2] * pw), round(caixa[3] * ph)))
            # limpar_referencia(ref, plano) ficou desligada: testada no mapa real, manchava mais do que limpava
            texto, especial = pedido_detalhe(n, classes_em(plano), *lugares_em(n, i, j, caixa, (pw, ph)))
            if especial:
                print(f'   pedaço {i},{j} tem lugar importante: {especial[:70]}...', flush=True)
            buf = io.BytesIO()
            ref.save(buf, 'PNG')
            nome = Gerar.enviar_imagem(buf.getvalue(), f'konoha_n{n}_{i}_{j}.png')
            arquivos, seg = Gerar.executar(Gerar.fluxo_continuar(texto, nome, SEMENTE + n * 10000 + j * 100 + i,
                                                                 f'SessaoZero/Konoha/n{n}_{i}_{j}'))
            img = Image.open(io.BytesIO(Gerar.baixar_imagem(arquivos[0]))).convert('RGB').resize((T, T))
            img.save(arq(n, i, j))
            passou = time.time() - inicio
            resta = passou / k * (len(lista) - k)
            print(f'[{k}/{len(lista)}] nível {n} pedaço {i},{j} pronto em {seg:.0f} s  (falta ~{resta / 60:.0f} min)', flush=True)
        except Exception as e:  # noqa: BLE001
            print(f'[{k}/{len(lista)}] nível {n} pedaço {i},{j}: erro: {e}', flush=True)
            time.sleep(3)
    return all(os.path.isfile(arq(n, i, j)) for j in range(n) for i in range(n))


def exportar(n, tam=1024):
    """Pedaços sem sobra para o site (.webp) + manifesto. Cada um é recortado do nível já misturado."""
    passo, lado = grade(n)
    destino = os.path.join(KONOHA, f'site{n}')
    os.makedirs(destino, exist_ok=True)
    cols = math.ceil(lado / tam)
    print(f'\nExportando nível {n}: {cols}x{cols} pedaços de {tam} px para {destino}')
    for cy in range(cols):
        for cx in range(cols):
            x0, y0 = cx * tam, cy * tam
            x1, y1 = min(lado, x0 + tam), min(lado, y0 + tam)
            img = recorte(n, (x0 / lado, y0 / lado, x1 / lado, y1 / lado), (x1 - x0, y1 - y0))
            img.save(os.path.join(destino, f'{cx}_{cy}.webp'), quality=85, method=6)
        print(f'  linha {cy + 1}/{cols}', flush=True)
    with open(os.path.join(destino, 'Manifesto.json'), 'w', encoding='utf-8') as f:
        json.dump({'nivel': n, 'lado_px': lado, 'pedaco_px': tam, 'colunas': cols, 'linhas': cols,
                   'metros_por_pedaco_gerado': METROS[n], 'arquivo': '{x}_{y}.webp'}, f, ensure_ascii=False, indent=1)
    return destino


def previa(n, lado_max=4096):
    import numpy as np
    from PIL import Image
    passo, lado = grade(n)
    f = min(1.0, lado_max / lado)
    L = round(lado * f)
    soma = np.zeros((L, L, 3), np.float32)
    pesos = np.zeros((L, L), np.float32)
    t = max(1, round(T * f))
    for j in range(n):
        for i in range(n):
            if not os.path.isfile(arq(n, i, j)):
                continue
            p = np.asarray(Image.open(arq(n, i, j)).convert('RGB').resize((t, t), Image.LANCZOS), np.float32)
            w = np.asarray(Image.fromarray((peso(i, j, n) * 255).astype(np.uint8)).resize((t, t)), np.float32) / 255 + 1e-4
            x, y = round(i * passo * f), round(j * passo * f)
            hx, hy = min(t, L - x), min(t, L - y)
            soma[y:y + hy, x:x + hx] += p[:hy, :hx] * w[:hy, :hx, None]
            pesos[y:y + hy, x:x + hx] += w[:hy, :hx]
    destino = os.path.join(KONOHA, f'Konoha-nivel{n}-previa.jpg')
    Image.fromarray((soma / np.maximum(pesos, 1e-6)[..., None]).clip(0, 255).astype(np.uint8)).save(destino, quality=88)
    return destino


def planta_simples():
    from PIL import Image
    if os.path.isfile(Konoha.SIMPLES):
        return Image.open(Konoha.SIMPLES).convert('RGB')
    p = Image.open(Konoha.PLANTA).convert('RGB')
    s = Konoha.simplificar(p.crop((0, Konoha.LEGENDA, p.width, p.height)))
    s.save(Konoha.SIMPLES)
    return s


def main():
    p = argparse.ArgumentParser(description='Mapão de Konoha: níveis de detalhe.')
    p.add_argument('acao', choices=['noite', 'nivel', 'exportar', 'previa'])
    p.add_argument('n', nargs='?', type=int, choices=[16, 32, 64])
    a = p.parse_args()
    if a.acao in ('nivel', 'exportar', 'previa') and not a.n:
        p.error('diga o nível: 16, 32 ou 64')
    if a.acao in ('noite', 'nivel'):
        if os.name == 'nt':  # não deixa o Windows dormir enquanto isto roda (volta ao normal quando fechar)
            import ctypes
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
        Gerar.esperar_comfy()
        plano = planta_simples()
        niveis = [16, 32] if a.acao == 'noite' else [a.n]  # 64 só à parte: ~50 h
        for n in niveis:
            completo = gerar_nivel(n, plano)
            print(f'Prévia do nível {n}: {previa(n)}')
            if not completo:
                print(f'O nível {n} ficou incompleto (algum erro acima). Rode de novo: ele continua de onde parou.')
                return
            if a.acao == 'noite' and n >= 32:
                print(f'Nível {n} pronto para o site: {exportar(n)}')
    elif a.acao == 'exportar':
        print(f'Pronto: {exportar(a.n)}')
    else:
        print(f'Prévia: {previa(a.n)}')


if __name__ == '__main__':
    main()
