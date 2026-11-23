"""Gera mapas no estilo padrão do Sessão Zero pelo ComfyUI (PLANEJAMENTO, Fase 7, decidido em 21/11).

Modelo: FLUX.2 [klein] 4B distilled fp8 (4 passos). Estilo: visão 3/4 de JRPG (chão visto de cima,
árvores e postes um pouco de frente), sem pessoas, chão de ponta a ponta.

Uso (o GERAR-MAPA.bat pergunta tudo):
  python Gerar.py "forest clearing with a small river" --qtd 3
  python Gerar.py --livre "texto completo do pedido, sem o estilo padrão"
  python Gerar.py "the river continues into a dense forest" --continuar mapa.png --lado direita

Continuar (outpainting): pega a borda do mapa (BORDA px) do lado pedido, pinta um pedaço novo de 1024 px a
partir dela e salva o mapa JUNTO (o original + o pedaço novo). Dá para continuar o JUNTO de novo.
As imagens ficam em ComfyUI\\ComfyUI\\output\\SessaoZero\\. "Continuar" precisa do Pillow (vem no Python do
ComfyUI, que o GERAR-MAPA.bat usa).
"""
import argparse
import io
import os
import json
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

COMFY = 'http://127.0.0.1:8188'
MODELO = 'flux-2-klein-4b-fp8.safetensors'
TEXTO = 'qwen_3_4b.safetensors'
VAE = 'flux2-vae.safetensors'
BORDA = 384      # px do mapa antigo que o pedaço novo usa para continuar (≈ 1/3)
FAIXA = 160      # px onde o mapa antigo e o pedaço novo se misturam (some a emenda)

# Texto base aprovado pelo Gabriel (21/11). Só o [LUGAR] muda.
ESTILO = ('top-down battle map in 3/4 view style like classic JRPG maps, the ground seen from above, '
          'trees and posts drawn slightly from the front so their trunks and sides are visible, '
          'no horizon, no sky, no vanishing point, the ground fills the entire image edge to edge, '
          '{lugar}, no people, no characters, painted fantasy style, soft lighting, no grid, no text')


def fluxo(texto, largura, altura, semente, prefixo):
    """O mesmo fluxo do modelo "Flux.2 Klein 4B Distilled" do ComfyUI, no formato da API."""
    return {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': MODELO, 'weight_dtype': 'default'}},
        '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': TEXTO, 'type': 'flux2', 'device': 'default'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE}},
        '4': {'class_type': 'CLIPTextEncode', 'inputs': {'text': texto, 'clip': ['2', 0]}},
        '5': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['4', 0]}},
        '6': {'class_type': 'CFGGuider', 'inputs': {'model': ['1', 0], 'positive': ['4', 0], 'negative': ['5', 0], 'cfg': 1}},
        '7': {'class_type': 'RandomNoise', 'inputs': {'noise_seed': semente}},
        '8': {'class_type': 'KSamplerSelect', 'inputs': {'sampler_name': 'euler'}},
        '9': {'class_type': 'Flux2Scheduler', 'inputs': {'steps': 4, 'width': largura, 'height': altura}},
        '10': {'class_type': 'EmptyFlux2LatentImage', 'inputs': {'width': largura, 'height': altura, 'batch_size': 1}},
        '11': {'class_type': 'SamplerCustomAdvanced', 'inputs': {
            'noise': ['7', 0], 'guider': ['6', 0], 'sampler': ['8', 0], 'sigmas': ['9', 0], 'latent_image': ['10', 0]}},
        '12': {'class_type': 'VAEDecode', 'inputs': {'samples': ['11', 0], 'vae': ['3', 0]}},
        '13': {'class_type': 'SaveImage', 'inputs': {'images': ['12', 0], 'filename_prefix': prefixo}},
    }


def fluxo_continuar(texto, imagem_ref, semente, prefixo, tam=1024):
    """Estender (igual ao modelo oficial "Klein image extend" do ComfyUI): a imagem de referência tem a borda do
    mapa e o resto pintado de VERDE; o modelo vê tudo (ReferenceLatent) e redesenha trocando o verde pela continuação."""
    g = fluxo(texto, tam, tam, semente, prefixo)
    g['20'] = {'class_type': 'LoadImage', 'inputs': {'image': imagem_ref}}
    g['22'] = {'class_type': 'VAEEncode', 'inputs': {'pixels': ['20', 0], 'vae': ['3', 0]}}
    g['24'] = {'class_type': 'ReferenceLatent', 'inputs': {'conditioning': ['4', 0], 'latent': ['22', 0]}}
    g['25'] = {'class_type': 'ReferenceLatent', 'inputs': {'conditioning': ['5', 0], 'latent': ['22', 0]}}
    g['6']['inputs']['positive'] = ['24', 0]
    g['6']['inputs']['negative'] = ['25', 0]
    return g


def texto_continuar(lugar):
    return (f'remove the green part and continue the map there seamlessly: {lugar}. Keep exactly the same art style, '
            'colors, lighting, scale and 3/4 top-down camera angle as the rest of the image, no visible seam, '
            'no people, no characters, no text')


def enviar_imagem(dados_png, nome):
    """Sobe uma imagem para a pasta input do ComfyUI (POST /upload/image, multipart feito à mão)."""
    fronteira = uuid.uuid4().hex
    corpo = (f'--{fronteira}\r\nContent-Disposition: form-data; name="image"; filename="{nome}"\r\n'
             'Content-Type: image/png\r\n\r\n').encode() + dados_png + (
        f'\r\n--{fronteira}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{fronteira}--\r\n').encode()
    req = urllib.request.Request(f'{COMFY}/upload/image', data=corpo,
                                 headers={'Content-Type': f'multipart/form-data; boundary={fronteira}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())['name']


def baixar_imagem(caminho_saida):
    sub, _, nome = caminho_saida.replace('\\', '/').rpartition('/')
    q = urllib.parse.urlencode({'filename': nome, 'subfolder': sub, 'type': 'output'})
    with urllib.request.urlopen(f'{COMFY}/view?{q}', timeout=60) as r:
        return r.read()


def igualar_cores(novo, ref_novo, ref_antigo):
    """Ajusta brilho/contraste de cada cor do pedaço novo para bater com a borda do mapa antigo."""
    from PIL import ImageStat
    a, b = ImageStat.Stat(ref_antigo), ImageStat.Stat(ref_novo)
    canais = []
    for c, banda in enumerate(novo.split()):
        k = (a.stddev[c] or 1) / (b.stddev[c] or 1)
        k = max(0.8, min(1.25, k))  # sem exagero
        canais.append(banda.point(lambda v, k=k, c=c: max(0, min(255, round((v - b.mean[c]) * k + a.mean[c])))))
    from PIL import Image
    return Image.merge('RGB', canais)


def degrade(largura, altura, horizontal, sobe):
    """Máscara de mistura: 0 = mapa antigo, 255 = pedaço novo."""
    from PIL import Image
    m = Image.new('L', (largura, altura))
    n = largura if horizontal else altura
    for i in range(n):
        v = round(255 * (i / max(1, n - 1)))
        v = v if sobe else 255 - v
        m.paste(v, (i, 0, i + 1, altura) if horizontal else (0, i, largura, i + 1))
    return m


def continuar(arquivo, lado, lugar, semente, pasta_saida):
    """Monta a referência (borda + verde), pinta o pedaço novo e devolve (caminho do JUNTO, segundos)."""
    from PIL import Image
    antigo = Image.open(arquivo).convert('RGB')
    w, h = antigo.size
    horizontal = lado in ('direita', 'esquerda')
    if horizontal and h != 1024 or not horizontal and w != 1024:
        raise ValueError(f'Para continuar para {lado}, o mapa precisa ter 1024 px de '
                         f'{"altura" if horizontal else "largura"} (este tem {w}×{h}).')
    T, B, F = 1024, BORDA, FAIXA
    falta = T - B
    # Onde fica a borda: no mapa antigo (caixa_a) e no pedaço novo (caixa_n).
    caixa_a = {'direita': (w - B, 0, w, h), 'esquerda': (0, 0, B, h), 'baixo': (0, h - B, w, h), 'cima': (0, 0, w, B)}[lado]
    caixa_n = {'direita': (0, 0, B, T), 'esquerda': (falta, 0, T, T), 'baixo': (0, 0, T, B), 'cima': (0, falta, T, T)}[lado]
    borda = antigo.crop(caixa_a)
    ref = Image.new('RGB', (T, T), (0, 255, 0))
    ref.paste(borda, caixa_n[:2])
    buf = io.BytesIO()
    ref.save(buf, 'PNG')
    nome = enviar_imagem(buf.getvalue(), f'estender_{uuid.uuid4().hex[:8]}.png')
    base = os.path.splitext(os.path.basename(arquivo))[0]
    arquivos, seg = executar(fluxo_continuar(texto_continuar(lugar), nome, semente, f'SessaoZero/{base}_pedaco-{lado}'))
    novo = Image.open(io.BytesIO(baixar_imagem(arquivos[0]))).convert('RGB').resize((T, T))
    novo = igualar_cores(novo, novo.crop(caixa_n), borda)

    # Junta: mapa antigo intacto + parte nova; na faixa de F px antes da emenda os dois se misturam.
    if lado == 'direita':
        junto = Image.new('RGB', (w + falta, h)); junto.paste(antigo, (0, 0)); junto.paste(novo.crop((B, 0, T, T)), (w, 0))
        mistura = Image.composite(novo.crop((B - F, 0, B, T)), antigo.crop((w - F, 0, w, h)), degrade(F, h, True, True))
        junto.paste(mistura, (w - F, 0))
    elif lado == 'esquerda':
        junto = Image.new('RGB', (w + falta, h)); junto.paste(novo.crop((0, 0, falta, T)), (0, 0)); junto.paste(antigo, (falta, 0))
        mistura = Image.composite(novo.crop((falta, 0, falta + F, T)), antigo.crop((0, 0, F, h)), degrade(F, h, True, False))
        junto.paste(mistura, (falta, 0))
    elif lado == 'baixo':
        junto = Image.new('RGB', (w, h + falta)); junto.paste(antigo, (0, 0)); junto.paste(novo.crop((0, B, T, T)), (0, h))
        mistura = Image.composite(novo.crop((0, B - F, T, B)), antigo.crop((0, h - F, w, h)), degrade(w, F, False, True))
        junto.paste(mistura, (0, h - F))
    else:
        junto = Image.new('RGB', (w, h + falta)); junto.paste(novo.crop((0, 0, T, falta)), (0, 0)); junto.paste(antigo, (0, falta))
        mistura = Image.composite(novo.crop((0, falta, T, falta + F)), antigo.crop((0, 0, w, F)), degrade(w, F, False, False))
        junto.paste(mistura, (0, falta))
    os.makedirs(pasta_saida, exist_ok=True)
    destino = os.path.join(pasta_saida, f'{base.split("_JUNTO")[0]}_JUNTO-{lado}-{time.strftime("%Hh%M%S")}-{uuid.uuid4().hex[:4]}.png')
    junto.save(destino)
    return destino, seg


def esperar_comfy():
    """Espera o ComfyUI abrir (o .bat abre ele se estiver fechado; leva uns 30–60 s)."""
    for tentativa in range(90):
        try:
            pedir('/system_stats', tempo=5)
            return
        except (urllib.error.URLError, OSError):
            if tentativa == 0:
                print('Esperando o ComfyUI abrir...')
            time.sleep(2)
    print('O ComfyUI não abriu. Abra o run_nvidia_gpu.bat (pasta ComfyUI) e tente de novo.')
    sys.exit(1)


def pedir(caminho, dados=None, tempo=30):
    req = urllib.request.Request(f'{COMFY}{caminho}', data=json.dumps(dados).encode() if dados is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=tempo) as r:
        return json.loads(r.read() or b'{}')


def nome_curto(texto):
    t = unicodedata.normalize('NFD', texto.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:40] or 'mapa'


def gerar_uma(texto, largura, altura, semente, prefixo):
    return executar(fluxo(texto, largura, altura, semente, prefixo))


def executar(grafo):
    cliente = str(uuid.uuid4())
    resposta = pedir('/prompt', {'prompt': grafo, 'client_id': cliente})
    if resposta.get('error') or resposta.get('node_errors'):
        raise RuntimeError(json.dumps(resposta.get('error') or resposta.get('node_errors'), ensure_ascii=False)[:500])
    pid = resposta['prompt_id']
    inicio = time.time()
    while time.time() - inicio < 600:
        hist = pedir(f'/history/{pid}')
        if pid in hist:
            item = hist[pid]
            status = item.get('status', {})
            if status.get('status_str') == 'error':
                raise RuntimeError(json.dumps(status.get('messages', []), ensure_ascii=False)[:500])
            arquivos = [img for saida in item.get('outputs', {}).values() for img in saida.get('images', [])]
            if arquivos:
                return [f"{a.get('subfolder', '')}\\{a['filename']}".strip('\\') for a in arquivos], time.time() - inicio
        time.sleep(1)
    raise TimeoutError('O ComfyUI demorou mais de 10 minutos.')


def main():
    p = argparse.ArgumentParser(description='Gera mapas no estilo padrão do Sessão Zero.')
    p.add_argument('lugar', nargs='?', help='o que tem no mapa (em inglês funciona melhor)')
    p.add_argument('--livre', help='texto completo, sem o estilo padrão')
    p.add_argument('--qtd', type=int, default=1, help='quantas variações (padrão 1)')
    p.add_argument('--tamanho', default='1024x1024', help='largura x altura (padrão 1024x1024)')
    p.add_argument('--semente', type=int, help='mesma semente = mesma imagem')
    p.add_argument('--continuar', help='mapa (.png) para continuar para um lado')
    p.add_argument('--lado', default='direita', choices=['direita', 'esquerda', 'baixo', 'cima'])
    a = p.parse_args()
    if not a.lugar and not a.livre:
        p.error('diga o lugar (ou use --livre).')
    largura, altura = (int(x) for x in a.tamanho.lower().split('x'))
    texto = a.livre or ESTILO.format(lugar=a.lugar.strip().rstrip(','))

    esperar_comfy()

    if a.continuar:
        arquivo = a.continuar.strip().strip('"')
        if not os.path.isfile(arquivo):
            print(f'Não achei o arquivo: {arquivo}')
            sys.exit(1)
        pasta = os.path.dirname(os.path.abspath(arquivo))
        print(f'Continuando para {a.lado}: {arquivo}\nPedido: {texto_continuar(a.lugar or a.livre)}\n')
        for n in range(1, max(1, a.qtd) + 1):
            semente = a.semente if a.semente is not None and n == 1 else random.randint(1, 2**48)
            try:
                destino, seg = continuar(arquivo, a.lado, a.lugar or a.livre, semente, pasta)
            except Exception as e:  # noqa: BLE001
                print(f'[{n}/{a.qtd}] Erro: {e}')
                continue
            print(f'[{n}/{a.qtd}] Pronto em {seg:.0f} s (semente {semente}): {destino}')
        print('\nPara continuar de novo, use o arquivo _JUNTO como mapa.')
        return

    prefixo = f'SessaoZero/{time.strftime("%Y-%m-%d_%Hh%M")}_{nome_curto(a.lugar or a.livre)}'
    print(f'Pedido: {texto}\n')
    for n in range(1, max(1, a.qtd) + 1):
        semente = a.semente if a.semente is not None and n == 1 else random.randint(1, 2**48)
        try:
            arquivos, seg = gerar_uma(texto, largura, altura, semente, prefixo)
        except Exception as e:  # noqa: BLE001
            print(f'[{n}/{a.qtd}] Erro: {e}')
            continue
        print(f'[{n}/{a.qtd}] Pronto em {seg:.0f} s (semente {semente}): ComfyUI\\output\\{arquivos[0]}')
    print('\nAs imagens estão em ComfyUI\\ComfyUI\\output\\SessaoZero\\')


if __name__ == '__main__':
    main()
