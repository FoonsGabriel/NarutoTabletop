// =====================================================================
// Efeitos de Ninpou e dos Ninjutsus Elementais — Livro Básico 4.1b, págs. 91–113
// Conteúdo sob licença CC BY-NC-SA 2.5 / OGL — crédito: Diego "Fesant" Silva / Projeto D8.
//
// Regras gerais (págs. 86–94):
//  - Custo de chakra = nível usado do efeito (pago mesmo se falhar).
//  - Dano comum   = nível usado + Espírito ÷ 2 (arredondado para cima) + bônus do elemento.
//  - Dif padrão   = 9 + nível usado + Espírito ÷ 2 (arredondado para cima).
//  - Dureza comum = nível usado + Espírito ÷ 2 (arredondado para cima) (+2 no Doton).
//  - À distância: teste de CD; toque: teste de CC. O alvo tem direito a defesa.
//    Com inimigo colado (alcance corpo a corpo), o teste de CD tem −3.
//  - Ataque em área: um único teste de acerto; cada alvo se defende; não dá para Bloquear.
//  - Ataque que não é em área só pode ser Bloqueado com arma especial ou arma
//    do efeito Energizar / Criar Arma.
//  - Pode usar o efeito acima do nível dele, até o nível do poder (custa mais).
// =====================================================================

const meiaEsp = (esp) => Math.ceil(Number(esp || 0) / 2);

/**
 * Parâmetros de cada poder (págs. 91–113).
 * alcance: metros = base + porEsp × Espírito · tamanho: metros por nível de Espírito.
 */
export const ELEMENTOS = {
  ninpou: { nome: 'Ninpou', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0, permitidos: 'todos' },
  doton: { nome: 'Doton', alcance: { base: 5, porEsp: 1, rotulo: 'Curto' }, tamanho: 1, danoBonus: 0, durezaBonus: 2, permitidos: 'todos', exclusivos: ['imergir', 'tremor', 'pele_de_pedra'] },
  fuuton: {
    nome: 'Fuuton', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 2, durezaBonus: 0,
    permitidos: ['canhao', 'orbe', 'barreira', 'coluna', 'flechas', 'sopro', 'raio', 'nuvem', 'energizar', 'missil', 'onda_explosiva', 'ricochete', 'correnteza', 'inflamavel'],
    exclusivos: ['venenoso', 'afiar', 'lamina_de_vento'],
  },
  katon: {
    nome: 'Katon', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 2, danoBonus: 2, durezaBonus: 0,
    permitidos: ['canhao', 'orbe', 'flechas', 'coluna', 'sopro', 'raio', 'energizar', 'missil', 'onda_explosiva', 'ricochete'],
    exclusivos: ['inflamavel', 'meteoros'],
  },
  raiton: {
    nome: 'Raiton', alcance: { base: 15, porEsp: 3, rotulo: 'Longo' }, tamanho: 0.5, danoBonus: 1, durezaBonus: 0,
    permitidos: ['canhao', 'orbe', 'coluna', 'flechas', 'sopro', 'raio', 'energizar', 'missil', 'onda_explosiva', 'ricochete', 'meteoros'],
    exclusivos: ['lamina_de_raios', 'arma_eletrica', 'descarga'],
  },
  // ---------------- Restritos ----------------
  // Kikai Ninpou (Aburame, Livro Básico págs. 147–148): Lidar com Animais no lugar do Espírito.
  kikai_ninpou: {
    nome: 'Kikai Ninpou', chave: 'lidar_animais', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0,
    permitidos: ['canhao', 'orbe', 'raio', 'barreira', 'flechas', 'ricochete', 'coluna', 'nuvem', 'sopro', 'missil'],
    exclusivos: ['interferencia'],
    semBloqueio: true, // ataques com kikaichuu não podem ser Bloqueados (pág. 144)
    drena: true,       // drena 1 de chakra por nível usado ao acertar (efeitos com custo)
    nomesPadrao: { barreira: 'Mushi Kame no Jutsu', sopro: 'Mushidama' },
    nota: 'Usa 1 kikaichuu por nível do poder (vão e voltam como ação livre).',
  },
  // Ataque básico da aptidão Kikaichuu (pág. 143): até metade dos insetos, teste de CD, só drena chakra.
  kikaichuu: {
    nome: 'Kikaichuu', chave: 'lidar_animais', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0,
    permitidos: [], semBloqueio: true, interno: true,
  },
  // Hibon Ninpou (pág. 212): Ninpou próprio com 2 bonificações (item.hibon na ficha).
  hibon_ninpou: { nome: 'Hibon Ninpou', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0, permitidos: 'todos', hibon: true },
  // Hyouton (Clã Yuki, Hijutsus págs. 19–21): Ninpou + Imergir, dureza +2, Dif +1;
  // ganha 1 nível grátis em Fuuton e Suiton (Canhão de ambos no nível do Hyouton).
  hyouton: {
    nome: 'Hyouton', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, difBonus: 1, durezaBonus: 2,
    permitidos: 'todos', extras: ['imergir'], canhoesGratis: ['fuuton', 'suiton'],
    nota: 'Criações permanentes derretem em 1 h por nível usado. Só pode ter Hyouton, Suiton e Fuuton como elementos.',
  },
  // Nintaijutsu (Hijutsus pág. 61): Força como atributo-chave, só toque (CC), Dif 7 + comum.
  nintaijutsu: {
    nome: 'Nintaijutsu', chave: 'forca', alcance: { base: 0, porEsp: 0, rotulo: 'Toque' }, tamanho: 1, danoBonus: 0, difBonus: -2, durezaBonus: 0,
    permitidos: ['nt_forca_bruta', 'nt_elbow', 'nt_straight', 'nt_lariat', 'nt_hell_stab', 'nt_guillotine', 'nt_linger_bomb', 'nt_reverse_chop'], semMeta: true,
    nota: 'Avanço rápido: ação completa, no mínimo 10 m em linha reta (Ataque em Movimento). Aptidões de técnica não valem; só a Força Bruta aceita manobras.',
  },
  // Kami Ninpou (Hijutsus pág. 57): +1 de dano; Arte pode substituir o Espírito; desvantagem contra Katon.
  kami_ninpou: {
    nome: 'Kami Ninpou', chave: 'arte_ou_espirito', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 1, durezaBonus: 0,
    permitidos: ['canhao', 'criar_arma', 'raio', 'flechas', 'sopro', 'coluna', 'lanca', 'missil', 'ricochete', 'correnteza', 'algemar', 'orbe', 'barreira', 'prisao_de_agua'],
    nota: 'Algemar, Orbe, Barreira e Prisão de Água só com Shikigami no Mai (que também dá +1 de dano e +1 na Dif). Desvantagem elemental contra Katon (até Shikigami 2).',
  },
  // Senninka (Hijutsus pág. 80): efeitos de Ninpou a partir do Nv 5, dano comum 2 × nível.
  senninka: {
    nome: 'Senninka', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0, danoComumDobro: true,
    permitidos: ['canhao', 'criar_arma', 'orbe', 'raio', 'flechas', 'energizar', 'sopro', 'missil'],
    nota: 'Os efeitos só funcionam com o poder no Nv 5 ou mais. Sem selos de mão (precisa dos braços livres, menos o Canhão).',
  },
  // Dokujutsu (Livro Básico pág. 201): Ninpou de venenos com Inteligência no lugar do Espírito.
  dokujutsu: {
    nome: 'Dokujutsu', chave: 'inteligencia', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0,
    permitidos: ['canhao', 'orbe', 'raio', 'flechas', 'energizar', 'sopro', 'coluna', 'lanca', 'nuvem', 'missil', 'onda_explosiva', 'ricochete', 'correnteza'],
    veneno: true,
    nota: 'Pode aplicar um veneno junto do efeito (ao ferir, ou se for inalado/engolido); o veneno é gasto. Resistência: 8 + Venefício.',
  },
  // Mokuton (Clã Senju, Livro Básico págs. 175–180): +1 de dano, +1 na Dif de resistência.
  mokuton: {
    nome: 'Mokuton', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 1, difBonus: 1, durezaBonus: 0, permitidos: 'todos',
    extras: ['imergir'], exclusivos: ['transmissor', 'selar_chakra', 'golem'], canhoesGratis: ['doton', 'suiton'],
    nomesPadrao: { raio: 'Mokuton: Daijurin no Jutsu', barreira: 'Mokuton: Mokujōheki' },
  },
  // Jiton (Hijutsus 4.1b pág. 53): versão do Sabaku Hijutsu (pág. 31), só com a Areia Especial.
  jiton_satetsu: {
    nome: 'Satetsu', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 2, danoBonus: 0, durezaBonus: 2, permitidos: 'todos',
    exclusivos: ['areia_especial', 'prisao_de_areia', 'areia_suspensa', 'areia_selada', 'projetil_venenoso'],
    obrigatorio: 'areia_especial', canhoesGratis: ['fuuton', 'doton'],
  },
  jiton_sakin: {
    nome: 'Sakin', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 2, danoBonus: 0, durezaBonus: 2, permitidos: 'todos',
    extras: ['colisao_de_ondas'],
    exclusivos: ['areia_especial', 'terceiro_olho', 'prisao_de_areia', 'areia_selada'],
    obrigatorio: 'areia_especial', canhoesGratis: ['fuuton', 'doton'],
  },
  suiton: { nome: 'Suiton', alcance: { base: 10, porEsp: 2, rotulo: 'Médio' }, tamanho: 1, danoBonus: 0, durezaBonus: 0, permitidos: 'todos', extras: ['inflamavel', 'venenoso', 'imergir'], exclusivos: ['nevoa', 'prisao_de_agua', 'colisao_de_ondas'] },
};

/**
 * ataque: como o VTT resolve o efeito
 *   'alvo'   → 1 alvo, teste de acerto e dano
 *   'area'   → vários alvos, 1 teste, cada um se defende (sem Bloqueio)
 *   'cadeia' → Ricochete: alvo a alvo, para no primeiro que se defender
 *   null     → efeito sem teste de dano automático (o VTT gasta chakra/ação e mostra os valores)
 * dano: 'comum' | '2n' (2 por nível usado) | 'metade' (metade do comum) | número fixo de dano base
 * alcance: 'comum' | 'pessoal' | 'toque' | 'tamanho' (ao redor de si) | metros
 */
export const EFEITOS = [
  // ---------------- Ninpou (todos os elementos, conforme a lista de cada um) ----------------
  { id: 'canhao', nome: 'Canhão', nivel: 1, pagina: 95, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: '2n', tipo: 'projetil',
    resumo: 'Jato do seu elemento contra um alvo. A partir do Nv 2 do poder, pode usar sem chakra com metade do dano (sem somar outros benefícios).' },
  { id: 'criar_arma', nome: 'Criar Arma', nivel: 2, pagina: 95, acao: 'parcial', alcance: 'pessoal', ataque: null, custo: 1, selos: false,
    resumo: 'Cria armas simples/marciais (leves, longas, medianas ou de arremesso) com o dano normal da arma. Sólidas são permanentes; as outras, sustentadas. Permitem Bloquear projéteis.',
    evolucoes: [{ nivel: 6, texto: 'Cria armas pesadas e para tamanhos acima de médio.' }] },
  { id: 'orbe', nome: 'Orbe', nivel: 2, pagina: 96, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: 'comum', tipo: 'projetil',
    resumo: 'Esfera de 0,5 m disparada contra um alvo, com dano comum do poder.',
    evolucoes: [{ nivel: 7, texto: 'Em nível 7 ou mais custa metade do chakra (sem benefícios de outros efeitos/aptidões).' }] },
  { id: 'raio', nome: 'Raio', nivel: 2, pagina: 96, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: '2n', tipo: 'projetil', semBloqueio: true,
    resumo: 'Raio que não pode ser Bloqueado (exceto com arma especial que bloqueie técnicas).',
    evolucoes: [{ nivel: 5, texto: '1 Raio a cada 2 níveis do poder, um por alvo, alvos a até 4 m entre si.' }, { nivel: 8, texto: 'Ação completa: um Raio com +2 de dano base contra um alvo.' }] },
  { id: 'restringente', nome: 'Restringente', nivel: 2, pagina: 97, acao: 'padrao', alcance: 'comum', ataque: null, area: 'Círculo',
    resumo: 'Camada grudenta no chão: quem está na área fica lento (exceto com Voo). Vítima pode testar Escapar ou Força (ação livre) contra a Dif padrão.',
    evolucoes: [{ nivel: 6, texto: 'As vítimas ficam impedidas em vez de lentas.' }] },
  { id: 'barreira', nome: 'Barreira', nivel: 3, pagina: 97, acao: 'movimento', alcance: 'comum', ataque: null,
    resumo: 'Muro do elemento com dureza comum para se proteger. Como defesa: teste de LM com +2 (chakra pago antes). Não serve contra inimigo colado.',
    evolucoes: [{ nivel: 6, texto: 'Vira redoma ao seu redor; também pode enjaular (ação padrão, CD −2).' }, { nivel: 9, texto: 'Dureza +2.' }] },
  { id: 'flechas', nome: 'Flechas', nivel: 3, pagina: 98, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: '2n', tipo: 'projetil',
    resumo: '1 projétil por nível usado, 2 de dano base cada. No VTT todos vão no mesmo alvo (para dividir entre alvos, o Mestre ajusta). Bônus de dano conta uma vez por alvo.',
    evolucoes: [{ nivel: 6, texto: 'Contra um só alvo que Esquivou/Antecipou: refaz o teste com metade do dano.' }, { nivel: 9, texto: 'O teste refeito causa dano integral.' }] },
  { id: 'lanca', nome: 'Lança', nivel: 3, pagina: 99, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: 'comum', tipo: 'projetil',
    resumo: 'Espinho que surge a até 2 m e atravessa proteções (ignora 2 de dureza). Vários alvos dividem o dano (no VTT: 1 alvo).',
    evolucoes: [{ nivel: 6, texto: 'Surge embaixo do alvo: ignora cobertura e o bônus de defesa de alvo caído.' }, { nivel: 9, texto: 'O alvo testa Prontidão antes da defesa; falhando, fica desprevenido.' }] },
  { id: 'ricochete', nome: 'Ricochete', nivel: 3, pagina: 99, acao: 'padrao', alcance: 'comum', ataque: 'cadeia', dano: 'comum', tipo: 'projetil',
    resumo: 'Salta de alvo em alvo: +1 alvo a cada 2 níveis do poder, a até 10 m do alvo original. Para no primeiro que se defender.',
    evolucoes: [{ nivel: 9, texto: 'Cada novo alvo: +1 de dano base (máx. +5).' }] },
  { id: 'coluna', nome: 'Coluna', nivel: 4, pagina: 99, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: '2n', area: 'Cilindro',
    resumo: 'Explosão em cilindro vertical (diâmetro e altura comuns do poder).',
    evolucoes: [{ nivel: 7, texto: 'Divide em mini-colunas de 1 m e escolhe quem é atingido.' }, { nivel: 10, texto: 'Alvos testam Prontidão; falhando, defesa debilitada (−2).' }] },
  { id: 'energizar', nome: 'Energizar', nivel: 4, pagina: 100, acao: 'parcial', alcance: 'pessoal', ataque: null, custo: 3, selos: false,
    resumo: 'Energiza punho, arma ou um compartimento de projéteis: pode usar Espírito no lugar de Força/Destreza no dano. Permite Bloquear projéteis. Sustentado.' },
  { id: 'nuvem', nome: 'Nuvem', nivel: 4, pagina: 100, acao: 'padrao', alcance: 'comum', ataque: null, area: 'Círculo com o dobro do tamanho',
    resumo: 'Nuvem em concentração. No início de cada turno seu, quem está dentro testa Vigor (Dif padrão −2): falhando, 1 de dano fixo por nível usado e fica lento.',
    evolucoes: [{ nivel: 7, texto: 'Pode manter de forma sustentada.' }, { nivel: 10, texto: 'Dureza +3 e dano fixo dobrado.' }] },
  { id: 'sopro', nome: 'Sopro Destrutivo', nivel: 4, pagina: 101, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: 'comum', area: 'Cone',
    resumo: 'Sopro em cone com dano comum em todos na área.',
    evolucoes: [{ nivel: 7, texto: 'Quem Esquivou/Antecipou testa Acrobacia; falhando, sofre dano grau 1.' }, { nivel: 10, texto: 'Esse dano restante passa a grau 2 (se o ataque teve grau 2+).' }] },
  { id: 'correnteza', nome: 'Correnteza', nivel: 5, pagina: 101, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: 'comum', area: 'Onda',
    resumo: 'Onda de fluido: quem é pego testa Vigor (Dif padrão −2) ou é empurrado até o fim; batendo em obstáculo, +1 de dano.',
    evolucoes: [{ nivel: 8, texto: 'Quem falhar e bater em obstáculo fica atordoado até o fim do próximo turno dele.' }] },
  { id: 'missil', nome: 'Míssil', nivel: 5, pagina: 101, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: 'comum', area: 'Linha',
    resumo: 'Depois de acertar, rola o ataque mais uma vez (o alvo não refaz a defesa): se acertar de novo, +1 de dano base.',
    evolucoes: [{ nivel: 8, texto: 'Rola 2 vezes extras, +1 de dano por acerto.' }, { nivel: 10, texto: 'Rola 4 vezes extras.' }] },
  { id: 'onda_explosiva', nome: 'Onda Explosiva', nivel: 5, pagina: 102, acao: 'padrao', alcance: 'tamanho', ataque: 'area', dano: 'comum', area: 'Meia-esfera ao seu redor',
    resumo: 'Onda de choque ao seu redor. Atingidos testam Vigor (Dif padrão −2) ou são empurrados até o limite da área.',
    evolucoes: [{ nivel: 8, texto: 'Quem falhar no Vigor também fica caído.' }] },
  { id: 'algemar', nome: 'Algemar', nivel: 6, pagina: 102, acao: 'padrao', alcance: 'comum', ataque: null,
    resumo: 'Prende as pernas do alvo (teste de acerto): ele fica impedido. Livra-se destruindo (dureza comum) ou com Força/Escapar (ação padrão).',
    evolucoes: [{ nivel: 8, texto: 'Duração sustentada.' }, { nivel: 10, texto: 'Até 3 alvos a 5 m entre si; usar 2 vezes deixa indefeso.' }] },

  // ---------------- Doton ----------------
  { id: 'imergir', nome: 'Imergir', nivel: 2, pagina: 103, acao: 'completa', alcance: 'pessoal', ataque: null,
    resumo: 'Funde-se ao chão/parede: Perito em Furtividade, não se move, visão de 10 m. Sair é ação de movimento.',
    evolucoes: [{ nivel: 4, texto: 'Move-se dentro do meio com metade do deslocamento.' }] },
  { id: 'tremor', nome: 'Tremor', nivel: 2, pagina: 104, acao: 'padrao', alcance: 'comum', ataque: null, area: 'Círculo de 2 m',
    resumo: 'O chão treme: quem está na área faz defesa ou fica caído (pode gastar movimento para testar Acrobacia).',
    evolucoes: [{ nivel: 4, texto: 'Diâmetro comum do poder.' }] },
  { id: 'pele_de_pedra', nome: 'Pele de Pedra', nivel: 6, pagina: 104, acao: 'movimento', alcance: 'pessoal', ataque: null, selos: false,
    resumo: 'Dureza de corpo = dureza padrão (+2 do Doton) até o fim do turno; sustentado dá só 1 de dureza. Pode ser defesa (teste de LM).',
    evolucoes: [{ nivel: 9, texto: 'Sustentado passa a 2 de dureza.' }] },

  // ---------------- Fuuton ----------------
  { id: 'venenoso', nome: 'Venenoso', nivel: 5, pagina: 106, acao: 'padrao', alcance: 'comum', ataque: null, area: 'Cone',
    resumo: 'Névoa com um veneno (até nível II) feito com Venefício: não causa dano, mas garante o veneno. O veneno é gasto.' },
  { id: 'afiar', nome: 'Afiar', nivel: 6, pagina: 106, acao: 'parcial', alcance: 'pessoal', ataque: null, selos: false, prereq: 'energizar',
    resumo: 'Como Energizar numa arma real cortante/perfurante, e ainda: ignora 1 de dureza, crítico +1, lâmina estendida (−1 na defesa do alvo se vencer Espírito × Prontidão).' },
  { id: 'lamina_de_vento', nome: 'Lâmina de Vento', nivel: 7, pagina: 106, acao: 'completa', alcance: 5, ataque: null, selos: false, prereq: 'energizar',
    resumo: 'Lâminas quase invisíveis (1 por nível usado). Um teste de acerto, uma defesa; o alvo testa Prontidão antes ou fica fintado. Dano conforme o texto do livro.',
    evolucoes: [{ nivel: 10, texto: 'Quem falhar na Prontidão fica desprevenido.' }] },

  // ---------------- Katon ----------------
  { id: 'inflamavel', nome: 'Inflamável', nivel: 5, pagina: 108, acao: 'movimento', alcance: 'comum', ataque: null, area: 'Círculo', custoExtra: 3,
    resumo: 'Espalha líquido/gás inflamável. Depois, um Canhão Katon/Raiton (ação padrão) explode a área com o dano do Canhão +2.',
    evolucoes: [{ nivel: 8, texto: 'Qualquer efeito Katon/Raiton instantâneo de alcance comum serve para a combustão.' }] },
  { id: 'meteoros', nome: 'Meteoros', nivel: 9, pagina: 108, acao: 'completa', alcance: 'comum', ataque: null, area: '6 esferas de 5 m',
    resumo: 'Seis meteoros: cada um causa 1 de dano fixo por nível usado. Mirar em criaturas: −3 no acerto, mas sem Esquiva/Antecipar.' },

  // ---------------- Raiton ----------------
  { id: 'lamina_de_raios', nome: 'Lâmina de Raios', nivel: 2, pagina: 109, acaoUso: ['movimento', 'padrao'], alcance: 'toque', ataque: 'alvo', dano: 'comum', tipo: 'toque', prereqAtributo: { espirito: 8 },
    resumo: 'Prepara (ação de movimento) e ataca com toque (ação padrão, CC). Ignora 1 de dureza e destrói arma comum que bloqueie.',
    evolucoes: [{ nivel: 5, texto: 'Preparar vira ação parcial; Investida dá +2 de dano (+1 por nível seguinte).' }, { nivel: 7, texto: 'Ignora qualquer dureza (exceto Fuuton; metade do Raiton).' }, { nivel: 9, texto: 'Ganha Crítico Aprimorado.' }] },
  { id: 'arma_eletrica', nome: 'Arma Elétrica', nivel: 4, pagina: 110, acao: 'parcial', alcance: 'pessoal', ataque: null, selos: false, prereq: 'lamina_de_raios',
    resumo: 'Energizar só armas de corte/perfuração (3 chakra), criar projéteis elétricos (1 chakra) ou lâmina que se estende até 5 m (4 chakra).',
    evolucoes: [{ nivel: 8, texto: 'Arma comum que bloqueie ou seja bloqueada é destruída.' }] },
  { id: 'descarga', nome: 'Descarga', nivel: 6, pagina: 111, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: 'metade', area: 'Meia-esfera ou círculo',
    resumo: 'Corrente elétrica com metade do dano comum. Quem sofrer dano testa Vigor (Dif padrão −3) ou fica atordoado até o fim do próximo turno.' },

  // ---------------- Suiton ----------------
  { id: 'nevoa', nome: 'Névoa', nivel: 2, pagina: 112, acao: 'padrao', alcance: 1, ataque: null, area: 'Círculo de 30 m + 3 m por Espírito', prereqTexto: 'Lutar às Cegas ou sensor',
    resumo: 'Nevoeiro sustentado: além de 1 m, camuflagem parcial (25% de falha).',
    evolucoes: [{ nivel: 5, texto: 'Até 1 m camuflagem parcial; além disso, total (50%).' }] },
  { id: 'prisao_de_agua', nome: 'Prisão de Água', nivel: 3, pagina: 112, acao: 'padrao', alcance: 1, ataque: null,
    resumo: 'Teste de CD a 1 m (−3 pela proximidade): o alvo fica paralisado dentro da redoma (metade da dureza comum). Precisa manter contato e concentração.',
    evolucoes: [{ nivel: 9, texto: 'Prisão sufocante (testes com Dif padrão −2).' }] },
  { id: 'colisao_de_ondas', nome: 'Colisão de Ondas', nivel: 6, pagina: 113, acao: 'padrao', alcance: 'comum', ataque: 'area', dano: 10, area: 'Onda',
    resumo: 'Grande onda: 10 de dano base nos atingidos (construções sofrem o dobro). Mantida em concentração, captura quem falhar na defesa.' },

  // ---------------- Kikai Ninpou (Aburame) ----------------
  { id: 'interferencia', nome: 'Interferência', nivel: 3, pagina: 148, acao: 'padrao', alcance: 1, ataque: null, area: 'Círculo de 30 m + 3 m por Lidar com Animais',
    resumo: 'Espalha 1 kikaichuu pela área emitindo sinais de chakra: quem usar Sensor testa Rastrear (Dif comum) ou não distingue as assinaturas. Sustentado.' },
  { id: 'ataque_kikaichuu', nome: 'Ataque de Kikaichuu', nivel: 1, pagina: 143, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: null, custo: 0, drenaPorNivel: true, rotuloNivel: 'Kikaichuu usados',
    resumo: 'Até metade dos seus kikaichuu atacam (teste de CD): sem dano, drenam chakra igual ao número usado. Sem custo e não pode ser Bloqueado.' },

  // ---------------- Mokuton (Senju) ----------------
  { id: 'transmissor', nome: 'Transmissor', nivel: 2, pagina: 176, acao: 'parcial', alcance: 'toque', ataque: null, prereqTexto: 'Clone (Moku Bunshin)',
    resumo: 'O Moku Bunshin vira sementes rastreadoras: plante uma no alvo e você o detecta como com a aptidão Sensor (só quem carrega a semente). Técnica: Soushinki.' },
  { id: 'selar_chakra', nome: 'Selar Chakra', nivel: 6, pagina: 176, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: '2n', tipo: 'projetil', semBloqueio: true, prereq: 'raio', drenaMetade: true,
    resumo: 'Um Raio que também sela chakra: o alvo perde chakra igual à metade do nível usado. Também suprime o chakra bijuu de Jinchuuriki descontrolado (ação preparada, teste de Espírito Dif 7 + 2× nível Jinchuuriki).',
    evolucoes: [{ nivel: 9, texto: 'Sela Jinchuuriki de nível igual ao seu e quebra controle de Bijuu pelo toque (regras do Kai).' }] },
  { id: 'golem', nome: 'Golem', nivel: 7, pagina: 177, acao: 'padrao', alcance: 'pessoal', ataque: null,
    resumo: 'Golem de madeira imenso (Força = seu Espírito, metade da Vitalidade, suas Habilidades de Combate); golpe com dano comum. Exige concentração; usa seus Mokuton pelas ações dele. Técnica: Mokujin no Jutsu.',
    evolucoes: [{ nivel: 10, texto: 'Tamanho colossal; golpes comuns recebem Selar Chakra.' }] },

  // ---------------- Sabaku Hijutsu / Jiton ----------------
  { id: 'areia_especial', nome: 'Areia Especial', nivel: 2, pagina: 32, acao: 'livre', alcance: 'pessoal', ataque: null, custo: 0, livro: 'Hijutsus',
    resumo: '1 compartimento de areia/ferro por nível do poder, gasto 1 por nível usado (e reaproveitado). Defesa Rápida: reação que bloqueia golpes e projéteis com 1 compartimento e teste de LM, sem chakra. Barreira Rápida como reação.',
    evolucoes: [{ nivel: 8, texto: 'Barreira/Defesa Rápida mesmo fintado (exceto finta super acelerada) e contra Amaterasu.' }] },
  { id: 'terceiro_olho', nome: 'Terceiro Olho', nivel: 3, pagina: 33, acao: 'padrao', alcance: 'comum', ataque: null, livro: 'Hijutsus',
    resumo: 'Olho de areia flutuante para espiar à distância (concentração). Achar o olho: Prontidão ou Procurar contra a Dif comum.' },
  { id: 'prisao_de_areia', nome: 'Prisão de Areia', nivel: 5, pagina: 33, acao: 'padrao', alcance: 'comum', ataque: null, livro: 'Hijutsus',
    resumo: 'Como Prisão de Água, mas à distância e sem contato. Depois, pagando o chakra de novo: Funeral de Areia (golpe de misericórdia com metade do dano comum, ignora a dureza da prisão).',
    evolucoes: [{ nivel: 9, texto: 'Prisão sufocante; o Funeral passa a dano comum.' }] },
  { id: 'areia_suspensa', nome: 'Areia Suspensa', nivel: 5, pagina: 34, acao: 'movimento', alcance: 'pessoal', ataque: null, custo: 2, livro: 'Hijutsus',
    resumo: 'Atacar de cima (finta com Destreza), nuvem de transporte (Voo = Espírito, 10 m + 1 m por nível) e barreiras flutuantes. Sustentado.' },
  { id: 'areia_selada', nome: 'Areia Selada', nivel: 3, pagina: 53, acaoUso: ['completa'], alcance: 'toque', ataque: null, livro: 'Hijutsus', prereq: 'areia_especial', prereqAtributo: { inteligencia: 6 },
    resumo: 'Selo na pele que guarda toda a sua Areia Especial sem peso. Selar leva 1 rodada; liberar é ação livre (até antes da defesa).' },
  { id: 'projetil_venenoso', nome: 'Projétil Venenoso', nivel: 5, pagina: 54, acao: 'padrao', alcance: 'comum', ataque: 'alvo', dano: '2n', tipo: 'projetil', livro: 'Hijutsus', prereqTexto: 'Venefício 8',
    resumo: 'Como Flechas Nv 3, com projéteis de ferro envenenados (Armas Venenosas). O veneno entra com dano de grau 3 ou mais. Não serve para Fintar.' },
  // ---------------- Nintaijutsu (Hijutsus págs. 61–64): dano = nível + ½ Força; Dif = 7 + nível + ½ Força ----------------
  { id: 'nt_forca_bruta', nome: 'Força Bruta', nivel: 1, pagina: 62, acao: 'padrao', alcance: 'toque', ataque: null, custo: 0, livro: 'Hijutsus',
    resumo: 'Golpe com os benefícios do Punho de Ferro (use Atacar › desarmado; não usa o dano comum do poder). Aceita bônus de dano e aptidões de manobra.' },
  { id: 'nt_elbow', nome: 'Elbow', nivel: 2, pagina: 63, acao: 'padrao', alcance: 'toque', ataque: null, livro: 'Hijutsus',
    resumo: 'Cotovelada com Força Bruta (sem manobras): o alvo testa Vigor (Dif padrão + 2) ou é arremessado 5 m + 1 m por Força (não cai). Nv 5: mesmo passando, vai metade da distância.' },
  { id: 'nt_straight', nome: 'Straight', nivel: 3, pagina: 63, acao: 'completa', alcance: 'toque', ataque: 'alvo', dano: 'comum', tipo: 'toque', livro: 'Hijutsus',
    resumo: 'Avanço rápido (mín. 10 m em linha reta) e soco com o dano comum. O alvo testa Vigor ou é arremessado 10 m + 2 m por Força e cai. Nv 6: +2 de Agilidade na finta acelerada do avanço.' },
  { id: 'nt_lariat', nome: 'Lariat', nivel: 4, pagina: 63, acao: 'completa', alcance: 'toque', ataque: 'alvo', dano: 'comum_mais1', tipo: 'toque', livro: 'Hijutsus',
    resumo: 'Avanço rápido e golpe com o antebraço: dano comum +1; depois continua correndo pelo menos 5 m. Nv 8: +1 de dano a cada 5 m antes do golpe (máx. +3).' },
  { id: 'nt_hell_stab', nome: 'Hell Stab', nivel: 5, pagina: 63, acao: 'parcial', alcance: 'pessoal', ataque: null, livro: 'Hijutsus', prereqTexto: 'Armadura de Raios',
    resumo: 'Como Lâmina de Raios Nv 5, com a Força no dano (Nv 7 e Nv 9 seguem a Lâmina; Nv 9 dá Domínio do Raio).' },
  { id: 'nt_guillotine', nome: 'Guillotine Drop', nivel: 7, pagina: 64, acao: 'padrao', alcance: 'toque', ataque: 'alvo', dano: 'comum', tipo: 'toque', livro: 'Hijutsus',
    resumo: 'Chute de calcanhar depois de um salto: dano comum; o alvo testa Vigor ou fica atordoado e caído por 1 turno.' },
  { id: 'nt_linger_bomb', nome: 'Linger Bomb', nivel: 9, pagina: 64, acao: 'padrao', alcance: 'toque', ataque: 'alvo', dano: 'nivel_mais_forca', tipo: 'toque', livro: 'Hijutsus',
    resumo: 'Precisa vencer um Agarrar antes: joga o alvo no chão com dano = nível + Força inteira. Não recebe nenhum bônus de dano.' },
  { id: 'nt_reverse_chop', nome: 'Reverse Chop', nivel: 10, pagina: 64, acao: 'padrao', alcance: 'toque', ataque: 'alvo', dano: 'comum', tipo: 'toque', livro: 'Hijutsus',
    resumo: 'Como o Guillotine Drop, mas o dano nunca é menor que grau 3 (aplique o grau 3 se sair menos).' },
  // ---------------- Rasengan (pág. 121–122) — poder próprio, sem escolha de efeitos ----------------
  { id: 'rasengan_basico', nome: 'Rasengan', nivel: 1, pagina: 122, acao: 'completa', alcance: 'toque', ataque: 'alvo', dano: 'rasengan_basico', tipo: 'toque',
    semBloqueio: true, semMeta: true, interno: true,
    resumo: 'Ataque de CC por toque. Dano 2 + nível + metade do Espírito. Destrói arma comum usada para Bloquear (a defesa falha). O alvo é jogado 3 m e testa Vigor (Dif 7 + nível + ½ ESP) para não cair. Com ajuda de um Kage Bunshin, ataque com ação Padrão.' },
  { id: 'rasengan_completo', nome: 'Rasengan Completo', nivel: 6, pagina: 122, acao: 'padrao', alcance: 'toque', ataque: 'alvo', dano: 'rasengan_completo', tipo: 'toque',
    semBloqueio: true, semMeta: true, interno: true,
    resumo: 'Como o Rasengan, com ação Padrão e dano igual a nível + Espírito. Pré-requisito: Rasengan 6 e Espírito 14 (ou 12 + Chakra Expandido).' },
  { id: 'oodama_rasengan', nome: 'Oodama Rasengan', nivel: 7, pagina: 123, acao: 'completa', alcance: 'toque', ataque: 'alvo', dano: 'rasengan_completo', tipo: 'toque',
    semBloqueio: true, semMeta: true, interno: true, tecnicaPoderosa: true,
    resumo: 'Rasengan Completo com Técnica Poderosa (+0,5 no grau de dano). O teste para ficar de pé recebe +1 na dificuldade. Pré-requisito: Rasengan 7, Espírito 16 (ou 14 + Chakra Expandido) e Técnica Poderosa.' },

  { id: 'rasengan_elemental', nome: 'Rasengan Elemental', nivel: 9, pagina: 123, acao: 'completa', alcance: 'toque', ataque: 'alvo', dano: 'rasengan_completo', tipo: 'toque',
    semBloqueio: true, semMeta: true, interno: true, custoMais: 2, grauMinimo: 2, explosaoM: 10, colateral: true,
    resumo: 'Rasengan Completo com um elemento (Katon: Enka Rasengan · Raiton: Raiou Rasengan · Fuuton: Rasen Shuriken), sem o bônus de dano do elemento. Grau mínimo 2 no alvo direto; explode atingindo todos a até 10 m do alvo; você sofre o dano base com grau 1. Custo 2 + nível. Pré-requisito: Rasengan 9 e o elemento no nível 2.' },

  // ---------------- Iryou Ninjutsu (pág. 120) ----------------
  { id: 'cura_iryou', nome: 'Cura (Iryou Ninjutsu)', nivel: 1, pagina: 120, acao: 'padrao', alcance: 'toque', ataque: null, cura: true, interno: true,
    resumo: 'Toque com concentração (ação Padrão, os dois parados). No fim de cada turno de tratamento o paciente recupera nível + ½ Medicina (+1 com Perito: Medicina, +1 com Perícia Inata: Medicina). O primeiro turno cura sangramento. Em si mesmo cura a metade, até o nível 4.' },
];

const NINPOU_IDS = ['canhao', 'criar_arma', 'orbe', 'raio', 'restringente', 'barreira', 'flechas', 'lanca', 'ricochete', 'coluna', 'energizar', 'nuvem', 'sopro', 'correnteza', 'missil', 'onda_explosiva', 'algemar'];

const BY_ID = Object.fromEntries(EFEITOS.map((e) => [e.id, e]));

export const findEfeito = (id) => BY_ID[id] || null;

/** O poder usa efeitos? (Ninpou e elementos básicos) */
// ---------------------------------------------------------------------
// Versatilidade (Livro Básico págs. 241–242): dois poderes versáteis num só.
// item = { id: 'versatilidade', level, versateis: ['katon','suiton'],
//          nivel1: { katon: 'canhao', suiton: 'canhao' }, efeitos: ['', 'suiton:nevoa', ...] }
// ---------------------------------------------------------------------
export const PODERES_VERSATEIS = ['ninpou', 'suiton', 'katon', 'doton', 'fuuton', 'raiton'];

/** Expande a Versatilidade em dois "poderes virtuais" com efeitos por nível. */
export function expandirVersatilidade(item) {
  const level = Number(item.level || 1);
  const versateis = (Array.isArray(item.versateis) ? item.versateis : []).filter((p) => ELEMENTOS[p]).slice(0, 2);
  const slots = Array.isArray(item.efeitos) ? item.efeitos : [];
  return versateis.map((poder) => {
    const efeitos = Array.from({ length: level }, (_, i) => {
      if (i === 0) return item.nivel1?.[poder] || 'canhao';
      const [p, id] = String(slots[i] || '').split(':');
      return p === poder ? id : '';
    });
    return { id: poder, level, efeitos, versatil: true, jutsus: [] };
  });
}

/** Avisos da Versatilidade: no máximo 2 níveis seguidos para o mesmo poder (pág. 242). */
export function validarVersatilidade(item) {
  const problemas = [];
  const level = Number(item.level || 1);
  const versateis = Array.isArray(item.versateis) ? item.versateis : [];
  if (versateis.length < 2 || versateis[0] === versateis[1]) problemas.push('Escolha dois poderes versáteis diferentes.');
  const donos = Array.from({ length: level }, (_, i) => String((item.efeitos || [])[i] || '').split(':')[0]);
  for (let i = 3; i < level; i += 1) {
    if (donos[i] && donos[i] === donos[i - 1] && donos[i] === donos[i - 2]) problemas.push(`Nv ${i + 1}: depois de 2 níveis seguidos no mesmo poder, este precisa ser do outro.`);
  }
  expandirVersatilidade(item).forEach((v) => {
    validarEfeitos(v.id, v.efeitos, level).filter((p) => !p.startsWith('Escolha o efeito')).forEach((p) => problemas.push(`${ELEMENTOS[v.id].nome} versátil — ${p}`));
  });
  for (let i = 1; i < level; i += 1) if (!(item.efeitos || [])[i]) problemas.push(`Nv ${i + 1}: escolha o poder e o efeito.`);
  return problemas;
}

export const usaEfeitos = (poderId) => Boolean(ELEMENTOS[poderId] && !ELEMENTOS[poderId].interno);

/** Lista de efeitos que o poder pode escolher, em ordem de nível. */
export function efeitosDoPoder(poderId) {
  const el = ELEMENTOS[poderId];
  if (!el) return [];
  const base = EFEITOS.filter((e) => NINPOU_IDS.includes(e.id));
  const list = el.permitidos === 'todos' ? base : el.permitidos.map((id) => BY_ID[id]).filter(Boolean);
  const extra = [...(el.extras || []), ...(el.exclusivos || [])].map((id) => BY_ID[id]).filter(Boolean);
  const seen = new Set();
  return [...list, ...extra].filter((e) => (seen.has(e.id) ? false : seen.add(e.id))).sort((a, b) => a.nivel - b.nivel);
}

// ---------------------------------------------------------------------
// Escolha por nível (ficha): item.efeitos = ['canhao', 'orbe', 'orbe', ...]
//   posição i = efeito escolhido no nível i+1 do poder.
//   Escolher de novo um efeito = evoluir (pág. 94), em ordem, sem pular.
// ---------------------------------------------------------------------

/** Evoluções ganhas de cada efeito: { orbe: [{nivel:7,...}], ... } */
export function evolucoesGanhas(escolhas = []) {
  const ganhas = {};
  const vezes = {};
  escolhas.forEach((id, index) => {
    const efeito = BY_ID[id];
    if (!efeito) return;
    vezes[id] = (vezes[id] || 0) + 1;
    if (vezes[id] === 1) return;
    const proxima = (efeito.evolucoes || [])[vezes[id] - 2];
    if (proxima && proxima.nivel <= index + 1) (ganhas[id] ||= []).push(proxima);
  });
  return ganhas;
}

/** Problemas na escolha de efeitos (para avisar na ficha). */
export function validarEfeitos(poderId, escolhas = [], nivelPoder = 1) {
  const problemas = [];
  const disponiveis = new Set(efeitosDoPoder(poderId).map((e) => e.id));
  const vezes = {};
  escolhas.slice(0, nivelPoder).forEach((id, index) => {
    if (!id) return;
    const efeito = BY_ID[id];
    const nivel = index + 1;
    if (!efeito || !disponiveis.has(id)) { problemas.push(`Nv ${nivel}: efeito não disponível para este poder.`); return; }
    if (efeito.nivel > nivel) problemas.push(`Nv ${nivel}: ${efeito.nome} é de nível ${efeito.nivel}.`);
    vezes[id] = (vezes[id] || 0) + 1;
    if (vezes[id] > 1) {
      const evo = (efeito.evolucoes || [])[vezes[id] - 2];
      if (!evo) problemas.push(`Nv ${nivel}: ${efeito.nome} não tem mais evoluções.`);
      else if (evo.nivel > nivel) problemas.push(`Nv ${nivel}: a evolução de ${efeito.nome} é do nível ${evo.nivel}.`);
    }
    if (efeito.prereq && !escolhas.slice(0, index).includes(efeito.prereq)) problemas.push(`Nv ${nivel}: ${efeito.nome} exige ${BY_ID[efeito.prereq]?.nome}.`);
  });
  if (!escolhas[0] && nivelPoder >= 1) problemas.push('Escolha o efeito do nível 1.');
  const el = ELEMENTOS[poderId];
  if (el?.obrigatorio && nivelPoder >= (BY_ID[el.obrigatorio]?.nivel || 1) && !escolhas.slice(0, nivelPoder).includes(el.obrigatorio)) {
    problemas.push(`${BY_ID[el.obrigatorio].nome} é obrigatória neste poder.`);
  }
  return problemas;
}

// ---------------------------------------------------------------------
// Parâmetros calculados (págs. 92–94)
// ---------------------------------------------------------------------

export function alcanceMetros(poderId, esp) {
  const el = ELEMENTOS[poderId] || ELEMENTOS.ninpou;
  return el.alcance.base + el.alcance.porEsp * Number(esp || 0);
}

export function tamanhoMetros(poderId, esp) {
  const el = ELEMENTOS[poderId] || ELEMENTOS.ninpou;
  // Raiton: 0,5 m por Espírito, arredondado para cima (pág. 109).
  return Math.max(1, Math.ceil(el.tamanho * Number(esp || 0)));
}

/**
 * Tudo o que o efeito faz num nível usado.
 * opts: { esp, nivelPoder, evolucoes, semChakra (Canhão grátis) }
 */
export function parametros(poderId, efeito, nivelUsado, { esp = 0, int = 0, nivelPoder = nivelUsado, evolucoes = [], semChakra = false, hibon = null, capacidade = false, danoExtra = 0, vigor = 0 } = {}) {
  const base = ELEMENTOS[poderId] || ELEMENTOS.ninpou;
  // Hibon Ninpou: Dano Adicional (+1, pode 2×), Dureza Adicional (+2) ou Dificuldade (+1).
  const bon = Array.isArray(hibon) ? hibon : [];
  const el = base.hibon
    ? { ...base, danoBonus: bon.filter((b) => b === 'dano').length, durezaBonus: bon.includes('dureza') ? 2 : 0, difBonus: bon.includes('dificuldade') ? 1 : 0 }
    : base;
  const n = Number(nivelUsado);
  const comum = n + meiaEsp(esp);
  const evo = (nivel) => evolucoes.some((e) => e.nivel === nivel);

  let dano = null;
  if (efeito.dano === 'comum') dano = (el.danoComumDobro ? 2 * n : comum) + el.danoBonus;
  else if (efeito.dano === '2n') dano = 2 * n + el.danoBonus;
  else if (efeito.dano === 'metade') dano = Math.floor((comum + el.danoBonus) / 2);
  else if (typeof efeito.dano === 'number') dano = efeito.dano + el.danoBonus;
  else if (efeito.dano === 'rasengan_basico') dano = 2 + n + meiaEsp(esp); // pág. 122
  else if (efeito.dano === 'comum_mais1') dano = comum + 1 + el.danoBonus; // Lariat
  else if (efeito.dano === 'nivel_mais_forca') dano = n + Number(esp || 0); // Linger Bomb: Força inteira, sem bônus
  else if (efeito.dano === 'rasengan_completo') dano = n + Number(esp || 0); // pág. 122
  if (dano != null && capacidade && !efeito.tecnica) dano += 1;
  if (dano != null && danoExtra && !efeito.tecnica) dano += danoExtra;
  if (dano != null && semChakra) dano = Math.floor(dano / 2);

  let custo = efeito.custo ?? n;
  // Técnicas de clã (data/Clas.js): custo pelo nível usado, metade dele ou metade do Espírito.
  if (efeito.tecnica) {
    custo = efeito.custo === 'nivel' ? n : efeito.custo === 'dobroNivel' ? 2 * n : efeito.custo === 'bijuudama' ? Math.floor((3 * n) / 2) : efeito.custo === 'meioVigor' ? Math.ceil(Number(vigor || 0) / 2) : efeito.custo === 'meioNivel' ? Math.ceil(n / 2)
      : efeito.custo === 'meioEspirito' ? Math.ceil(Number(esp || 0) / 2) : Number(efeito.custo || 0);
  }
  if (efeito.custoExtra) custo = efeito.custoExtra;
  if (efeito.custoMais) custo = n + efeito.custoMais; // Rasengan Elemental: 2 + 1 por nível
  if (efeito.id === 'orbe' && n >= 7 && evo(7)) custo = Math.ceil(custo / 2);
  if (semChakra) custo = 0;

  const alcanceM = efeito.alcance === 'medio' ? 10 + 2 * Number(esp || 0)
    : efeito.alcance === 'sombra' ? 5 + 2 * n // Kagejutsu: 5 m + 2 m por nível (pág. 169)
    : efeito.alcance === 'curtoInt' ? 5 + Number(int || 0) // Magen: 5 m + 1 m por Inteligência (pág. 234)
    : efeito.alcance === 'comum' ? alcanceMetros(poderId, esp)
    : efeito.alcance === 'tamanho' ? tamanhoMetros(poderId, esp)
      : typeof efeito.alcance === 'number' ? efeito.alcance : 0;

  // Ricochete: +1 alvo a cada 2 níveis do poder. Míssil: testes extras.
  const alvosExtras = efeito.id === 'ricochete' ? Math.floor(Number(nivelPoder) / 2) : 0;
  const testesExtras = efeito.id === 'missil' ? (evo(10) ? 4 : evo(8) ? 2 : 1) : 0;

  return {
    dano,
    custo,
    dif: 9 + comum + (el.difBonus || 0),
    dureza: comum + el.durezaBonus,
    alcanceM,
    tamanhoM: tamanhoMetros(poderId, esp),
    alvosExtras,
    testesExtras,
    teste: efeito.alcance === 'toque' ? 'cc' : 'cd',
    // Kikai Ninpou: 1 de chakra por nível usado (só efeitos com custo). Ataque de Kikaichuu: 1 por inseto.
    drena: efeito.drenaPorNivel ? n : efeito.drenaMetade ? Math.floor(n / 2) : el.drena && custo > 0 ? n : 0,
  };
}

/** Ação(ões) que o efeito gasta no turno. */
export const acoesDoEfeito = (efeito) => efeito.acaoUso || [efeito.acao || 'padrao'];

// ---------------------------------------------------------------------
// Confronto de Elementos (Livro Básico, pág. 89)
// As setas do diagrama: Katon → Fuuton → Raiton → Doton → Suiton → Katon.
// Quando elementos rivais se confrontam, o de desvantagem tem a dureza e o
// dano cortados pela metade.
// ---------------------------------------------------------------------
export const VANTAGEM_ELEMENTAL = { katon: 'fuuton', fuuton: 'raiton', raiton: 'doton', doton: 'suiton', suiton: 'katon' };

const NOMES_ELEMENTOS = { katon: 'Katon', fuuton: 'Fuuton', raiton: 'Raiton', doton: 'Doton', suiton: 'Suiton' };

/** Elemento básico citado num texto (ex.: nome de um modo ativo "Barreira (Doton)"). */
export function elementoNoTexto(texto) {
  const t = String(texto || '').toLowerCase();
  return Object.keys(NOMES_ELEMENTOS).find((el) => t.includes(el)) || null;
}

/** Quem leva a desvantagem: { perde: 'doton', ganha: 'raiton', texto } ou null. */
export function confrontoElemental(ataque, defesa) {
  if (!ataque || !defesa || ataque === defesa) return null;
  if (VANTAGEM_ELEMENTAL[ataque] === defesa) {
    return { ganha: ataque, perde: defesa, texto: `${NOMES_ELEMENTOS[ataque]} vence ${NOMES_ELEMENTOS[defesa]}: a técnica de ${NOMES_ELEMENTOS[defesa]} do alvo tem dureza e dano pela metade (pág. 89)` };
  }
  if (VANTAGEM_ELEMENTAL[defesa] === ataque) {
    return { ganha: defesa, perde: ataque, texto: `${NOMES_ELEMENTOS[defesa]} do alvo vence ${NOMES_ELEMENTOS[ataque]}: o seu jutsu tem dureza e dano pela metade contra a técnica dele (pág. 89)` };
  }
  return null;
}
