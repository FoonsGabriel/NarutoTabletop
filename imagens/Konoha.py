"""Mapão de Konoha em pedaços, a partir de uma planta (imagens\\Konoha\\Planta.jpg). PLANEJAMENTO, Fase 7 (22/11).

Fase 1 — mapa geral: a planta é cortada numa grade N×N com sobra entre vizinhos; cada pedaço da planta vai como
REFERÊNCIA para o FLUX.2 klein (mesmo jeito do "estender"), que desenha a vila no estilo 3/4 mantendo ruas, rio e
muralha no lugar. Os pedaços se misturam na sobra (sem emenda) e viram Konoha-geral.png.

Uso (o KONOHA.bat chama isto):
  python Konoha.py geral                 gera todos os pedaços que ainda não existem e monta o mapa geral
  python Konoha.py geral --refazer 2,3   refaz só o pedaço da coluna 2, linha 3 (contando do 0) e monta de novo
  python Konoha.py montar                só monta de novo com os pedaços que existem

Precisa do Python do ComfyUI (Pillow e numpy). Os pedaços ficam em imagens\\Konoha\\geral\\ (fora do Git).
"""
import argparse
import io
import os
import random
import sys
import time

# O Python do ComfyUI não procura módulos na pasta do script: o Gerar.py está aqui do lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Gerar  # noqa: E402

PASTA = os.path.dirname(os.path.abspath(__file__))
KONOHA = os.path.join(PASTA, 'Konoha')
PLANTA = os.path.join(KONOHA, 'Planta.jpg')
GERAL = os.path.join(KONOHA, 'geral3')  # v3 (22/11): pedido por pedaço; a v2 ficou em 'geral2'
SIMPLES = os.path.join(KONOHA, 'Planta-simples.png')

T = 1024          # tamanho de cada pedaço gerado
SOBRA = 256       # px que cada pedaço divide com o vizinho (onde eles se misturam)
LEGENDA = 128     # px do alto da planta que são a legenda (não entram)
SEMENTE = 20261122  # fixa: refazer o mesmo pedaço dá o mesmo resultado (a não ser com --semente)

# v3 (22/11): o pedido é montado para CADA pedaço com só o que existe nele (a v2 desenhava muralha em volta de
# cada pedaço do meio, punha água onde não tinha e transformava o penhasco cinza em água).
LEGENDA_CORES = {
    'rua': 'the light sandy lines are dirt streets',
    'cidade': ('every brown block is a dense neighborhood completely packed with many traditional Japanese ninja village '
               'houses with dark tiled roofs, wooden walls and small yards, no empty lots'),
    'floresta': 'dark green is dense forest with tree canopies',
    'campo': 'light green is open grass fields and parks',
    'agua': 'blue is rivers, ponds and lakes with stone banks (water ONLY where it is blue)',
    'pedra': 'the dark grey-brown area is a huge rocky mountain cliff (solid rock, NOT water)',
    'muro': 'the thick dark curved band is the tall wooden outer wall of the village (only there)',
}


def pedido_para(ref):
    """Monta o pedido só com o que aparece neste pedaço da planta simplificada."""
    import numpy as np
    a = np.asarray(ref.resize((128, 128)), np.int32)
    cores = np.array(list(CORES.values()), np.int32)
    perto = ((a[:, :, None, :] - cores[None, None]) ** 2).sum(-1).argmin(-1)
    nomes = list(CORES)
    tem = {nomes[k] for k in np.unique(perto) if (perto == k).mean() > 0.005}
    partes = [LEGENDA_CORES[n] for n in ('rua', 'cidade', 'floresta', 'campo', 'agua', 'pedra', 'muro') if n in tem]
    extra = []
    if 'agua' not in tem:
        extra.append('There is NO water anywhere in this piece')
    if 'muro' not in tem:
        extra.append('there is NO wall in this piece')
    return (
        'Turn this color-coded plan into a detailed painted fantasy RPG map in 3/4 top-down view like classic JRPG '
        'maps. This image is only ONE PIECE of a much larger village map: everything continues past the edges, so '
        'never draw frames, borders, fences or walls along the edges of the image. Keep every street and area exactly '
        'where it is in the plan, same shapes and positions. Color code: ' + '; '.join(partes) + '. '
        + ('. '.join(extra) + '. ' if extra else '')
        + 'No numbers, text, icons or symbols. No people, no characters, painted fantasy style, soft lighting, '
        'the ground fills the entire image edge to edge.'
    )



CORES = {'cidade': (196, 152, 92), 'rua': (232, 212, 165), 'floresta': (28, 112, 48), 'campo': (152, 188, 98),
         'agua': (86, 150, 214), 'pedra': (112, 104, 96), 'muro': (34, 26, 20)}  # pedra escura: cinza claro virava água
PROTOS = [
    ('campo', (168, 186, 113)), ('campo', (169, 189, 114)), ('campo', (176, 194, 120)),
    ('floresta', (15, 117, 53)), ('floresta', (5, 129, 58)), ('floresta', (3, 135, 61)), ('floresta', (40, 129, 68)), ('floresta', (14, 30, 16)),
    ('agua', (130, 167, 194)), ('agua', (150, 190, 225)), ('agua', (110, 160, 215)),
    ('pedra', (178, 172, 163)), ('pedra', (205, 198, 188)), ('pedra', (185, 160, 138)), ('pedra', (195, 170, 142)),
    ('pedra', (228, 156, 54)),
    ('rua', (128, 114, 77)), ('rua', (124, 92, 67)),
] + [('cidade', c) for c in [(165, 132, 87), (182, 145, 78), (185, 146, 83), (176, 142, 89), (186, 145, 77), (179, 145, 88),
                             (184, 142, 82), (189, 146, 83), (184, 150, 86), (188, 176, 113), (168, 157, 100), (239, 205, 56),
                             (198, 119, 61), (163, 113, 90), (124, 132, 111), (149, 156, 117), (153, 184, 141), (124, 162, 139),
                             (178, 163, 108), (167, 136, 89), (220, 120, 60), (120, 100, 95)]]

def simplificar(planta):  # noqa: C901
    import numpy as np
    from PIL import Image, ImageFilter
    """Planta colorida → planta só com 7 cores claras (sem números, símbolos nem cores de clã)."""
    lisa = planta.filter(ImageFilter.MedianFilter(5))  # some com números e símbolos pequenos
    a = np.asarray(lisa, np.int32)
    nomes = [n for n, _ in PROTOS]
    p = np.array([c for _, c in PROTOS], np.int32)
    d = ((a[:, :, None, :] - p[None, None, :, :]) ** 2).sum(-1)
    classe = np.array(nomes)[d.argmin(-1)]
    classe = np.where(classe == 'rua', 'cidade', classe)
    # Ruas: os traços finos escuros da planta ORIGINAL (o filtro acima apaga), engrossados e pintados de terra clara.
    o = np.asarray(planta, np.int32)
    lum = o.mean(-1)
    traco = (lum < 120) & (o[..., 0] >= o[..., 1] - 5) & (o[..., 2] < o[..., 0] + 10)
    escuro = o.max(-1) < 70
    mask_e = Image.fromarray((escuro * 255).astype(np.uint8))
    grosso = np.asarray(mask_e.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(11))) > 0  # anel = muralha
    fino = traco & ~grosso
    fino = np.asarray(Image.fromarray((fino * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    dentro = np.isin(classe, ['cidade', 'campo', 'pedra'])  # rua só onde há chão (não no meio da floresta ou da água)
    classe = np.where(fino & dentro, 'rua', classe)
    classe = np.where(grosso & escuro, 'muro', classe)
    out = np.zeros(a.shape, np.uint8)
    for n, c in CORES.items():
        out[classe == n] = c
    return Image.fromarray(out)

def grade(n):
    passo = T - SOBRA
    return passo, passo * (n - 1) + T  # passo entre pedaços, lado do mapa geral


def caminho_pedaco(i, j):
    return os.path.join(GERAL, f'pedaco_{i}_{j}.png')


def gerar_pedaco(planta, n, i, j, semente):
    from PIL import Image
    passo, lado = grade(n)
    kx, ky = planta.width / lado, planta.height / lado
    caixa = (round(i * passo * kx), round(j * passo * ky), round((i * passo + T) * kx), round((j * passo + T) * ky))
    ref = planta.crop(caixa).resize((T, T), Image.LANCZOS)
    buf = io.BytesIO()
    ref.save(buf, 'PNG')
    nome = Gerar.enviar_imagem(buf.getvalue(), f'konoha_planta_{i}_{j}.png')
    arquivos, seg = Gerar.executar(Gerar.fluxo_continuar(pedido_para(ref), nome, semente, f'SessaoZero/Konoha/geral_{i}_{j}'))
    img = Image.open(io.BytesIO(Gerar.baixar_imagem(arquivos[0]))).convert('RGB').resize((T, T))
    img.save(caminho_pedaco(i, j))
    return seg


def peso(i, j, n):
    """Peso de cada pixel do pedaço: cai suave para 0 na sobra com o vizinho (bordas do mapa ficam 1)."""
    import numpy as np
    # Mistura só no meio da sobra (128 px): faixa larga demais deixava "fantasmas" (casas meio transparentes).
    rampa = np.clip((np.arange(SOBRA, dtype=np.float32) - SOBRA / 4) / (SOBRA / 2), 0, 1)
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


def montar(n):
    import numpy as np
    from PIL import Image
    passo, lado = grade(n)
    soma = np.zeros((lado, lado, 3), np.float32)
    pesos = np.zeros((lado, lado), np.float32)
    faltam = []
    for j in range(n):
        for i in range(n):
            arq = caminho_pedaco(i, j)
            if not os.path.isfile(arq):
                faltam.append((i, j))
                continue
            p = np.asarray(Image.open(arq).convert('RGB'), np.float32)
            w = peso(i, j, n)
            x, y = i * passo, j * passo
            soma[y:y + T, x:x + T] += p * w[..., None]
            pesos[y:y + T, x:x + T] += w
    img = (soma / np.maximum(pesos, 1e-6)[..., None]).clip(0, 255).astype(np.uint8)
    destino = os.path.join(KONOHA, 'Konoha-geral.png')
    Image.fromarray(img).save(destino)
    Image.fromarray(img).resize((lado // 4, lado // 4), Image.LANCZOS).save(os.path.join(KONOHA, 'Konoha-geral-previa.jpg'), quality=88)
    return destino, faltam


def main():
    p = argparse.ArgumentParser(description='Mapão de Konoha em pedaços.')
    p.add_argument('acao', choices=['geral', 'montar'])
    p.add_argument('--n', type=int, default=4, help='grade N×N do mapa geral (padrão 4)')
    p.add_argument('--refazer', help='"coluna,linha" de um pedaço para refazer (ex.: 2,3)')
    p.add_argument('--semente', type=int, help='outra semente para o pedaço refeito')
    a = p.parse_args()
    try:
        from PIL import Image
        import numpy  # noqa: F401
    except ImportError:
        print('Precisa do Python do ComfyUI (Pillow e numpy). Rode pelo KONOHA.bat.')
        sys.exit(1)
    if not os.path.isfile(PLANTA):
        print(f'Não achei a planta: {PLANTA}')
        sys.exit(1)
    os.makedirs(GERAL, exist_ok=True)

    if a.acao == 'geral':
        Gerar.esperar_comfy()
        planta = Image.open(PLANTA).convert('RGB')
        planta = simplificar(planta.crop((0, LEGENDA, planta.width, planta.height)))
        planta.save(SIMPLES)
        print(f'Planta simplificada (o que a IA recebe): {SIMPLES}')
        lista = [(i, j) for j in range(a.n) for i in range(a.n)]
        if a.refazer:
            i, j = (int(x) for x in a.refazer.split(','))
            lista = [(i, j)]
        else:
            lista = [(i, j) for i, j in lista if not os.path.isfile(caminho_pedaco(i, j))]
        print(f'Mapa geral {a.n}x{a.n}: {len(lista)} pedaço(s) para gerar.\n')
        for k, (i, j) in enumerate(lista, 1):
            semente = a.semente if (a.refazer and a.semente is not None) else SEMENTE + i * 100 + j
            if a.refazer and a.semente is None:
                semente = random.randint(1, 2**48)  # refazer = outra tentativa
            try:
                seg = gerar_pedaco(planta, a.n, i, j, semente)
                print(f'[{k}/{len(lista)}] pedaço {i},{j} pronto em {seg:.0f} s')
            except Exception as e:  # noqa: BLE001
                print(f'[{k}/{len(lista)}] pedaço {i},{j}: erro: {e}')
    destino, faltam = montar(a.n)
    print(f'\nMapa geral montado: {destino}')
    print('Prévia pequena: imagens\\Konoha\\Konoha-geral-previa.jpg')
    if faltam:
        print(f'Faltam {len(faltam)} pedaço(s) (rode de novo para completar): {faltam}')


if __name__ == '__main__':
    main()
