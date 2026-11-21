"""Túnel automático (PLANEJAMENTO-IA): abre o túnel da Cloudflare e avisa o site do endereço novo.

O endereço rápido (https://….trycloudflare.com) muda toda vez que o túnel abre. Este script pega o
endereço que o cloudflared mostra e grava no Supabase (tabela ia_endereco) pela função protegida
definir_endereco_ia, que só aceita quem tem o segredo de dados/Segredo.txt. O site lê de lá sozinho:
não precisa mais publicar o site quando o PC reinicia.
"""
import re
import shutil
import subprocess
import sys

import httpx

import Config

ARQUIVO_SEGREDO = Config.PASTA / 'dados' / 'Segredo.txt'
PADRAO = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')


def avisar_site(url):
    if not (Config.SUPABASE_URL and Config.SUPABASE_CHAVE):
        print('[túnel] Não achei o Supabase no .env.local do site; não deu para avisar o endereço.', flush=True)
        return
    segredo = ARQUIVO_SEGREDO.read_text(encoding='utf-8').strip() if ARQUIVO_SEGREDO.exists() else ''
    if not segredo:
        print('[túnel] Falta o arquivo dados\\Segredo.txt (veja o DEPLOY.md, parte "IA: endereço automático").', flush=True)
        print(f'[túnel] Por enquanto, use este endereço no VITE_IA_URL: {url}', flush=True)
        return
    try:
        r = httpx.post(f'{Config.SUPABASE_URL}/rest/v1/rpc/definir_endereco_ia', timeout=15,
                       json={'p_url': url, 'p_segredo': segredo},
                       headers={'apikey': Config.SUPABASE_CHAVE, 'Authorization': f'Bearer {Config.SUPABASE_CHAVE}'})
        r.raise_for_status()
        if r.json() is True:
            print(f'[túnel] Pronto! O site já sabe o endereço novo da IA: {url}', flush=True)
        else:
            print('[túnel] O Supabase recusou: confira se o dados\\Segredo.txt é igual ao do banco.', flush=True)
    except (httpx.HTTPError, ValueError) as e:
        print(f'[túnel] Não consegui avisar o site ({e}). Rodou o SQL do DEPLOY.md?', flush=True)


def main():
    if not shutil.which('cloudflared'):
        print('Falta o cloudflared: winget install --id Cloudflare.cloudflared')
        return 1
    processo = subprocess.Popen(['cloudflared', 'tunnel', '--url', 'http://127.0.0.1:8000'],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding='utf-8', errors='replace')
    avisado = None
    try:
        for linha in processo.stdout:
            print(linha, end='', flush=True)
            achou = PADRAO.search(linha)
            if achou and achou.group(0) != avisado and not achou.group(0).startswith('https://api.'):
                avisado = achou.group(0)
                avisar_site(avisado)
    except KeyboardInterrupt:
        pass
    finally:
        processo.terminate()
    return processo.wait()


if __name__ == '__main__':
    sys.exit(main())
