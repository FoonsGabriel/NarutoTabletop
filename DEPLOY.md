# Publicar o Shinobi VTT para o Mestre testar

Passo a passo para colocar no ar na Vercel e mandar o link. Leva uns 15 minutos.

---

## 1. Conferir o banco (Supabase)

Abra o Supabase → seu projeto → **SQL Editor** → **New query**, cole e rode **Run**.
Este SQL **só cria o que estiver faltando** (pode rodar mais de uma vez sem apagar nada):

```sql
-- Colunas que o VTT usa (cria só se não existir)
alter table rooms      add column if not exists map_layout     jsonb;
alter table rooms      add column if not exists scene_env      jsonb default '{}'::jsonb;
alter table rooms      add column if not exists hud_settings   jsonb default '{}'::jsonb;
alter table rooms      add column if not exists grid_size      integer default 64;
alter table rooms      add column if not exists combat_active  boolean default false;
alter table rooms      add column if not exists combat_turn    text;
alter table rooms      add column if not exists combat_round   integer default 0;
alter table rooms      add column if not exists combat_strict  boolean default true;

alter table characters add column if not exists overrides      jsonb default '{}'::jsonb;
alter table characters add column if not exists active_modes   jsonb default '[]'::jsonb;
alter table characters add column if not exists xp             numeric default 0;
alter table characters add column if not exists ryo            integer default 100;

alter table map_tokens add column if not exists sprite         jsonb default '{}'::jsonb;

alter table room_combat add column if not exists actions       jsonb;
alter table room_combat add column if not exists init_bonus    integer default 0;
alter table room_combat add column if not exists tiebreak      numeric default 0;
```

Depois rode este, que mostra **quais tabelas ainda não estão no tempo real** (o resultado precisa vir vazio):

```sql
select t from unnest(array['rooms','characters','map_tokens','room_combat','room_messages','room_rolls','room_catalog']) as t
where t not in (select tablename from pg_publication_tables where pubname = 'supabase_realtime');
```

Se aparecer alguma tabela, ative: **Database → Replication → supabase_realtime** → marque a tabela.

### Imagens (Storage)
- **Storage** → precisa existir o bucket **`game-assets`** marcado como **Public**.
- Em **Policies** do bucket: permitir `insert` e `select` para quem está logado (é onde vão mapas, personagens e itens).

---

## 2. Subir o código para o GitHub
No terminal, dentro de `E:\TabletopVirtual\NarutoTabletop`:

```bash
git add .
git commit -m "Shinobi VTT: primeira versão para testes"
git push
```

> O arquivo `.env.local` (com as chaves) **não sobe** — o `.gitignore` já protege. As chaves vão direto na Vercel (passo 3).

---

## 3. Vercel
1. Entre em **vercel.com** → **Add New… → Project** → escolha o repositório.
2. Framework: **Vite** (ela detecta sozinha). Build: `npm run build` · Saída: `dist`.
3. **Environment Variables** — copie os dois valores do seu `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**. No fim aparece o link (ex.: `shinobi-vtt.vercel.app`).

O arquivo `vercel.json` (na raiz) faz o link da sala funcionar mesmo recarregando a página (`/room/...`).
*Ele precisa ter esse nome exato em minúsculas — é a única exceção à regra dos nomes em maiúscula, porque a Vercel só reconhece assim.*

---

## 4. No Supabase: liberar o endereço novo
**Authentication → URL Configuration**:
- **Site URL**: o link da Vercel
- **Redirect URLs**: adicione `https://SEU-LINK.vercel.app/**`

---

## 5. Teste rápido antes de mandar (2 aparelhos)
- [ ] PC (Mestre): criar sala, subir um mapa, colocar NPC pelo ⚡ Gerador rápido
- [ ] Celular (jogador): entrar na sala, abrir a ficha, criar personagem
- [ ] Iniciar combate: barra de iniciativa aparece; atacar; o defensor escolhe a defesa
- [ ] Jutsu com animação e som; ↩ Desfazer no PC do Mestre
- [ ] Névoa ligada: o jogador só vê perto do personagem
- [ ] 📍 Marcar: ping aparece nos dois aparelhos
- [ ] Recarregar a página dentro da sala (não pode dar 404)

---

## 6. Mandar para o Mestre
Mande o link + o arquivo **GUIA-DO-MESTRE.md**.

## Se algo der errado
- **Tela branca / "Invalid API key"** → conferir as 2 variáveis na Vercel e fazer **Redeploy**.
- **404 ao recarregar na sala** → o `vercel.json` não subiu.
- **Imagem não sobe** → bucket `game-assets` público + policies de insert.
- **Nada atualiza ao vivo** → tabela fora do Realtime (SQL do passo 1).
