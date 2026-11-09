// =====================================================================
// Clãs do Livro Básico 4.1b (págs. 142–200): aptidões restritas, poderes
// restritos e as técnicas de cada nível, prontas para usar no turno.
//
// Técnica (o que o menu de Jutsus mostra):
//   nivel   → nível do poder (ou da aptidão) a partir do qual pode usar
//   acao    → padrao | movimento | parcial | completa | livre
//   custo   → chakra (número) · 'nivel' = nível usado do poder · 'meioNivel'
//   custoVit / ganhoChakra → Controle de Caloria e Mil Clones
//   alcance → 'pessoal' | 'toque' | metros (número)
//   fica    → vira um modo ativo (contínua/sustentada); drenoTurno = chakra por turno
//   tamanho → muda o tamanho do personagem (Baika, Sotorou…); null volta ao normal
//   ataque/dano/aplica → técnicas com teste de acerto que causam condição no alvo
// Tudo o mais é narrado: o botão "Usar" paga a ação e o chakra e avisa no chat.
// =====================================================================

function slug(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const apt = (nome, cla, pagina, resumo, extra = {}) => ({ id: slug(nome), nome, categoria: 'cla', gratuita: false, resumo, cla, pagina, ...extra });
const tec = (nivel, nome, acao, custo, resumo, extra = {}) => ({ nivel, nome, acao, custo, resumo, ...extra });

// ---------------------------------------------------------------------
// Aptidões restritas dos clãs
// ---------------------------------------------------------------------
export const APTIDOES_CLAS = [
  // ---------- Livro de Hijutsus 4.1b: clãs (págs. 7–21) ----------
  apt('Demônio do Vento', ['Fuuma', 'Tensai'], 7,
    '[Clã Fuuma · especial do Tensai] Ganha Usar Arma (Fuuma Shuriken) e Especialista (Armas de Arremesso) quando cumprir os requisitos. O dano base de qualquer fuuma shuriken pode ser igual à sua Destreza (sem o cálculo de arremesso nem dano de arma).', { livro: 'Hijutsus' }),
  apt('Predador Aquático', 'Hoshigaki', 8,
    'Respira debaixo d\'água e nada com o dobro do deslocamento. Dureza de corpo 1 contra ataques armados e desarmados (Vigor 8: 2; Vigor 12: 3) — automático no combate.', { livro: 'Hijutsus' }),
  apt('Elemento Natural: Suiton', 'Hoshigaki', 9,
    'Requer Predador Aquático e Suiton 1. Todo efeito Suiton recebe +2 de dano base (bônus de elemento) — automático.', { livro: 'Hijutsus', bonusElemento: { suiton: 2 } }),
  apt('Reserva de Água', 'Hoshigaki', 9,
    'Requer Suiton 5, Espírito 9, Domínio da Água e Elemento Natural. O Domínio da Água acumula o dobro de pontos de água. Libera o efeito Prisão do Tubarão (Suiton Nv 10) no painel de jutsus.', { livro: 'Hijutsus' }),
  apt('Suika', 'Hozuki', 10,
    'Requer Suiton 4 e Espírito 9. Enquanto tiver chakra: Pontos Suika = 3 × Vigor (o dano pode sair deles antes da Vitalidade; recupera 5 + 2 × Vigor por noite). Imune a dano de Suiton e de afogamento; metade do dano base de Katon/fogo; dobro contra Raiton. Escapa de prisões físicas com uma ação padrão. Imergir Nv 2 grátis no Suiton. PS pagam chakra de técnicas Suiton (pagando tudo com PS: +2 de dano). Só pode usar Suiton como elemento.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Suika: Braço de Água', 'parcial', 1, '[Suiton Nv 5] Um braço fica maior e mais forte: usa Espírito no lugar da Força em testes, dificuldades e dano corporal (e pré-requisitos); Acuidade vale para qualquer arma pesada. Contínua.', { minSuiton: 5 }),
      tec(1, 'Suika: Afogar', 'movimento', 0, '[Suiton Nv 6] Num alvo agarrado (ou após bloqueio desarmado bem-sucedido): bolha de água na cabeça; sufocamento com dano fixo igual ao dano comum do Suiton. A bolha tem absorção 1 e dureza comum do poder.', { minSuiton: 6 }),
      tec(1, 'Suika: Monstro de Água', 'padrao', 0, '[Suiton Nv 7] Funde-se com muita água: fica Enorme e todos os golpes corporais ganham o Braço de Água com +3 de Espírito. Sustentada.', { minSuiton: 7 }),
      tec(1, 'Suika: Clone de Óleo', 'padrao', 0, '[Suiton Nv 8; Mizu Bunshin] Clone acelerado (Vit 3 × Esp, imune a ataques comuns) que cresce 1 categoria por rodada em que se moveu; ao chegar a Imenso explode (esfera do tamanho comum, dano comum + 2) e volta ao tamanho original. Concentração.', { minSuiton: 8 }),
    ] }),
  apt('Artesão de Ossos', 'Kaguya', 14,
    'Cria armas de osso (corte ou perfuração; o membro fica inutilizado até seu próximo turno; duram a cena): mesmas da tabela com dureza +2 e dano de arma +1; bloqueiam projéteis; proficiência automática. Arma-presa: arma leve que sai da palma, não pode ser desarmada.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Arma de osso leve', 'parcial', 0, 'Cria uma arma leve de osso (1 de Vitalidade).', { custoVit: 1 }),
      tec(1, 'Arma de osso mediana', 'parcial', 0, 'Cria uma arma mediana de osso (2 de Vitalidade).', { custoVit: 2 }),
      tec(1, 'Arma de osso longa ou pesada', 'movimento', 0, 'Cria uma arma longa ou pesada de osso (4 de Vitalidade; precisa cumprir Força/Destreza).', { custoVit: 4 }),
      tec(1, 'Teshi Sendan (projéteis dos dedos)', 'padrao', 0, 'Ataque à distância: alcance 20 m, dano base igual à sua Destreza. Custa 1 de Vitalidade.', { custoVit: 1 }),
    ] }),
  apt('Armadura Óssea', 'Kaguya', 15,
    'Dureza de corpo 1 contra todo dano (Vigor 10: 2; Vigor 14: 3) — automático. Ganha os benefícios de Duro de Matar e é imune a fraturas.', { livro: 'Hijutsus' }),
  apt('Karamatsu no Mai', 'Kaguya', 16,
    'Requer Vigor 6, Artesão de Ossos e Armadura Óssea. Defesa com técnica (ação parcial, ¼ do Vigor em chakra) usando CC no lugar de LM: se der certo, + Vigor de dureza de corpo até o fim do turno do atacante, e quem atacou desarmado sofre 1 de dano fixo por Vigor. +2 contra agarrar.', { livro: 'Hijutsus' }),
  apt('Yanagi no Mai', 'Kaguya', 16,
    'Requer Acrobacia 6 e Artesão de Ossos. De mãos livres ou com armas-presas: o ataque corporal ganha Ataque Giratório (com Ataque Múltiplo, todos giratórios). Armas de osso leves podem usar Destreza no dano.', { livro: 'Hijutsus' }),
  apt('Tsubaki no Mai', 'Kaguya', 16,
    'Requer Agilidade 8, Ataque em Movimento, Ataque Múltiplo e Artesão de Ossos. Só armas leves, a 3 m ou mais do alvo: 3 ataques no mesmo alvo (2º com −1 na defesa dele, 3º com −2). Ganha Retirada Rápida e Trespassar Nv 2 (+5 m para o próximo alvo).', { livro: 'Hijutsus' }),
  apt('Tessenka no Mai', 'Kaguya', 17,
    'Requer Vigor 12, Força ou Destreza 10, Artesão de Ossos e Ambidestria. Tsuru (vinha de ossos): arma pesada +4, alcance 4 m, derrubar/desarmar/agarrar sem penalidade, aceita Acuidade. Hana (flor de ossos): arma-presa pesada +6, alcance 2 m; com o alvo agarrado pela Tsuru, ganha um ataque extra com a Hana.', { livro: 'Hijutsus' }),
  apt('Sawarabi no Mai', 'Kaguya', 17,
    'Requer Vigor 16 e Tessenka no Mai. Como o efeito Lança Nv 6 (Nv 9 com Vigor 18): lanças de osso numa área de diâmetro = Vigor, dureza 2 × Vigor, dano base = Vigor, custo metade do Vigor, Dif 9 + Vigor; pode andar dentro delas (Imergir Nv 4).',
    { livro: 'Hijutsus', tecnicas: [tec(1, 'Sawarabi no Mai (Dança da Samambaia)', 'padrao', 'meioVigor', 'Lanças de osso sobem do chão ao seu redor (efeito Lança): dano base = Vigor, Dif 9 + Vigor, dureza 2 × Vigor.')] }),
  apt('Lâmina da Lua', ['Yotsuki', 'Tensai'], 18,
    '[Clã Yotsuki · especial do Tensai] Ganha Acuidade, Domínio do Raio e Usar Arma para todas as espadas marciais (ainda precisa da Força/Destreza das armas).', { livro: 'Hijutsus' }),
  apt('Selos Especiais', 'Yuki', 18,
    'Requer Destreza 8. Selos com uma mão só: sem o −3 de técnicas em combate próximo. Quando um Golpear for defendido, pode lançar uma técnica de ação padrão (CD, à distância, instantânea) como ação de movimento.', { livro: 'Hijutsus' }),
  apt('Congelamento', 'Yuki', 19,
    'Requer Hyouton 6. Ao causar dano com efeito Hyouton à distância (com teste de acerto), a vítima testa Vigor (Dif padrão − 2) ou fica impedida até o fim do próximo turno dela.', { livro: 'Hijutsus' }),
  // Magen (pág. 238)
  apt('Ilusão Fluida', 'Magen', 238,
    '[Meta] Na Dif de resistência dos seus genjutsus usa a Inteligência do alvo no lugar da sua (só se sua Int for pelo menos o dobro do nível do Magen). Requer Inteligência 12 e Magen 6. Automático no painel de jutsus.'),
  // Kagura Shingan (págs. 222–223)
  apt('Kagura Shingan', 'Kagura Shingan', 222,
    'Sensor de chakra: 20 m + 4 m por nível em Rastrear procurando ativamente (metade passivo). Não sofre ataque surpresa. Mede o poder (NC aproximado), lê emoções (mentiras, hostilidade), localiza outros sensores e identifica genjutsus no alcance (em si mesmo: Percepção com −2 de Dif). Rastrear 4: dobra o alcance com selos e concentração. Requer Rastrear 1.'),
  apt('Ryoushitsu Kagura Shingan', 'Kagura Shingan', 223,
    'Dobra os alcances do Kagura Shingan. Concentrado e imóvel 20 rodadas: 100 m por nível em Rastrear. Supressão de Chakra: fica indetectável a sensores de chakra (Rastrear Dif 9 + seu Rastrear), também para aliados em contato; não pode usar jutsus enquanto suprime. Requer Kagura Shingan e Rastrear 6.'),
  // Tensai (págs. 241–247): aptidões restritas e especiais (no máximo 2 especiais diferentes).
  apt('Aprendizagem Rápida', 'Tensai', 243,
    'Pode comprar a Versatilidade uma segunda vez, com dois novos poderes versáteis; os benefícios gerais (como Maestria) valem para eles. Pode ser comprada mais de uma vez. Requer Versatilidade 5.'),
  apt('Talento Natural', 'Tensai', 243,
    'Escolha um efeito (não exclusivo de elemento) para um poder versátil ou para o Hibon Ninpou: você o ganha com todas as evoluções de graça ao atingir o nível delas; não conta no limite de escolhas. Requer Inteligência ou Espírito 6.'),
  apt('Técnica Avançada', 'Tensai', 243,
    'Ganha duas aptidões de técnica à sua escolha (pág. 72), cumprindo os pré-requisitos delas.'),
  apt('Capacidade', 'Tensai', 243,
    '[Especial] +1 no dano base dos efeitos de Ninpou e elementos (inclusive Versatilidade e Hibon), menos os exclusivos de elemento — automático. Nível 2 (Espírito 12): meta-aptidões como ação parcial (não duas juntas nem em ação completa). Requer Espírito 8.'),
  apt('Controle Perfeito', 'Tensai', 244,
    '[Especial] Usa Inteligência no lugar do Espírito em todos os parâmetros dos seus poderes e aptidões (todos de uma vez; não afeta pré-requisitos). Nível 2 (Int 12): + Inteligência de chakra máximo. Requer Inteligência 8.'),
  apt('Instinto de Batalha', 'Tensai', 244,
    '[Especial] +1 no valor base de uma Habilidade de Combate (não se alguma estiver em 5, antes ou depois). Nível 2 (Des ou Agi 12): penalidade máxima de precisão num teste passa a −2. Requer Destreza ou Agilidade 8.'),
  apt('Deus do Trovão', 'Tensai', 244,
    '[Especial] Libera o Hiraishin (técnicas no painel de jutsus). Nível 2 (Int 18): Hiraishin: Dōrai. Requer Fuuinjutsu 8 e Inteligência 14.',
    { tecnicas: [
      tec(1, 'Hiraishin: Marcar Jutsu-Shiki', 'parcial', 1, 'Cria um selo de teleporte (no mínimo 10 × 10 cm) no que você toca; num inimigo, antes um toque desarmado (ação padrão + teste de CC). Numa tarja de selo avançado é permanente; em outra superfície dura até o fim da cena. Anular um selo: Fuuinjutsu 8, ação parcial e 1 chakra.'),
      tec(1, 'Hiraishin: Teletransporte', 'parcial', 2, 'Vai até um jutsu-shiki (pode ser ação de movimento no lugar da parcial), mesmo agarrado, impedido ou de armadura pesada. Levar o que toca custa mais: pequeno +1, médio +3, grande +5, enorme +7, imenso +9, colossal +11. Selo de Fuga (até 2 selos seguros): ação completa.'),
      tec(1, 'Hiraishin: Espalhar Kunais', 'parcial', 0, 'Com Saque Rápido: lança até 8 kunais marcadas pelo campo, numa área de 16 m de diâmetro.'),
      tec(1, 'Hiraishin: Desaparecer', 'livre', 2, 'Anuncie junto com Esquiva ou Antecipar: se o atacante acertar (sem crítico), ele rola o ataque de novo e fica com o pior. Se a defesa der certo, use a ação parcial ou de movimento para ir a um jutsu-shiki. Fica imune a Fintar (super acelerado conta como acelerado).'),
      tec(1, 'Hiraishin: Ni no Dan', 'parcial', 2, 'Requer Int 16, Saque Rápido e Ponto Cego. Kunai marcada lançada como finta (teste de CD contra a defesa): se acertar, teleporta e o ataque corporal ou de toque com a ação padrão é sucesso automático. Oponente marcado: ele já fica fintado, sem teste. Reaparecer: depois de Desaparecer, volta às costas dele e ataca como oponente marcado.'),
      tec(1, 'Hiraishin: Dōrai', 'completa', 0, 'Nível 2 do Deus do Trovão (Int 18). Barreira que suga um ataque à distância e o manda para um jutsu-shiki a 200 m ou mais. Custo = custo do jutsu defendido (objetos: tabela do Hiraishin). Sucesso automático, menos contra acerto crítico.'),
    ] }),
  // Juuinka (Hijutsus págs. 54–57). No complemento da aptidão, escreva os 2 bônus escolhidos
  // (ex.: "Força, Ataque"): Força (+4), Dano (+2), Ataque (+1), Defesa (+1), Dificuldade (+1), Dureza (+1).
  apt('Juuinka - Ichi', 'Juuinka', 56,
    'Requer Espírito ou Vigor 8 e ter sobrevivido ao Juuin Jutsu. Liberar o selo: ação parcial, 8 de Vitalidade, contínuo; dá os 2 bônus escolhidos na compra (escreva no complemento: Força +4, Dano +2, Ataque +1, Defesa +1, Dificuldade +1 ou Dureza +1). Ao desativar: fatigado por 30 minutos. Incompatível com Senninka e Senjutsu.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Liberar Selo Amaldiçoado (1º estágio)', 'parcial', 0, 'Ativa os bônus escolhidos no complemento da aptidão. Ao desativar (Fim de cena ou tirar o modo), fica fatigado por 30 minutos.', { custoVit: 8, fica: 'Juuinka: 1º estágio', juuinka: 1, tira: 'Juuinka:' }),
    ] }),
  apt('Juuinka - Ni', 'Juuinka', 56,
    'Requer Juuinka - Ichi, Espírito ou Vigor 10 e o Ritual da Névoa Negra. 2º estágio (ação parcial, 4 de Vitalidade, depois do 1º): mantém os bônus do 1º e ganha acelerado e Chakra +20 (1 vez por cena). Selo do Céu: asas (Voo 2, +3 m de deslocamento e salto; armas naturais medianas +3, bloqueiam). Selo da Terra: cauda (+1 em Agilidade, +3 m; arma natural pesada +5, Força 12).',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Liberar Selo Amaldiçoado (2º estágio)', 'parcial', 0, 'Precisa do 1º estágio ativo. Mantém os bônus e fica acelerado.', { custoVit: 4, fica: 'Juuinka: 2º estágio', juuinka: 2, modo: 'acelerado', requer: 'Juuinka: 1º', tira: 'Juuinka:' }),
      tec(1, 'Juuinka: Chakra +20', 'livre', 0, 'No 2º estágio: recupera 20 de chakra (1 vez por cena).', { ganhoChakra: 20, requer: 'Juuinka: 2º', umaPorCena: 'Juuinka: Chakra +20 usado' }),
    ] }),
  // Kamijutsu (Hijutsus pág. 60)
  apt('Shikigami no Mai', ['Kamijutsu', 'Kami'], 60,
    'Nível 1 (Kami Ninpou 4; Arte ou Espírito 9): vira papel. Pontos Kami = 3 × Espírito (ou Arte): o dano pode sair deles antes da Vitalidade (fogo/Katon dobrado). Recupera 3 PK por 1 chakra (ação padrão). Escapa de prisões físicas com ação padrão. Kami Ninpou ganha Algemar, Orbe, Barreira e Prisão de Água, +1 de dano e +1 na Dif. Nível 2 (Kami Ninpou 6): sem desvantagem contra Katon e novas técnicas.', { livro: 'Hijutsus' }),
  // Nintaijutsu (Hijutsus págs. 64–65)
  apt('Armadura de Raios', 'Nintaijutsu', 64,
    'Nível 1 (Nintaijutsu 5, Esp 6): 4 chakra e ação parcial — dureza de corpo 1, +5 m, acelerado, golpes corporais como Energizar de Raiton; sustentada. Defesa Ativa (2 chakra, ação de movimento): defende com CC e ganha dureza extra = Espírito até o fim do turno do atacante. Nível 2 (Nintai 6, Esp 9): 6 chakra, dureza 2, +10 m, +1 de dano nos efeitos, contínua. Nível 3 (Nintai 8, Esp 14): 8 chakra, dureza 3, +15 m, +2 de dano, Defesa Ativa como ação livre.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Armadura de Raios', 'parcial', 4, 'Nível 1: dureza de corpo 1, +5 m de deslocamento, acelerado; golpes corporais com Energizar de Raiton. Sustentada.', { fica: 'Armadura de Raios', durezaCorpo: 1, modo: 'acelerado', tira: 'Armadura de Raios' }),
      tec(1, 'Armadura de Raios: Defesa Ativa', 'movimento', 2, 'Ao ser atacado: defende com CC no lugar de LM; se der certo, dureza extra igual ao Espírito até o fim do turno do atacante.'),
    ] }),
  // Rinnegan (Hijutsus págs. 65–75)
  apt('Rinnegan', 'Rinnegan', 65,
    'Doujutsu sempre ativo: chakra máximo −10% (automático). Visão de chakra (vê jutsus e genjutsus ativos), mede o poder (NC) e distingue assinaturas. Transformações da Natureza: compre Ninpou como "Rinne Ninpou" e, com uma ação parcial antes de usá-lo, troque o elemento (só efeitos permitidos naquele elemento, com as propriedades dele; sem exclusivos). O nível do Rinne Ninpou vale como pré-requisito dos elementos.', { livro: 'Hijutsus' }),
  apt('Shuradō (Caminho Asura)', 'Rinnegan', 66,
    'Requer Rinnegan, Ocultismo 12 e Mecanismos 12. Até 4 braços extras (movimento, 6 chakra, cena): não é flanqueado ao Bloquear; com Ataque Múltiplo pode Agarrar em todos e bater no agarrado (ação livre, metade do dano). Arsenal Humano (Rinne Ninpou 6): o Rinne Ninpou usa Mecanismos no lugar do Espírito, sem selos.',
    { livro: 'Hijutsus', tecnicas: [tec(1, 'Shuradō: Braços Mecânicos', 'movimento', 6, 'Até quatro braços adicionais pela cena (regras na aptidão).')] }),
  apt('Jigokudō (Caminho Naraka)', 'Rinnegan', 67,
    'Requer Rinnegan, Ocultismo 12 e Espírito 12. Invoca o Rei do Inferno (movimento, 6 chakra). Interrogar (padrão, vítima indefesa): se mentir ou se calar, Vigor 9 ou morre; senão fica exausto (capangas falham). Também repara corpos (ver Gedō).',
    { livro: 'Hijutsus', tecnicas: [tec(1, 'Jigokudō: Rei do Inferno', 'movimento', 6, 'Invoca o Rei do Inferno ao seu lado.')] }),
  apt('Ningendō (Caminho Humano)', 'Rinnegan', 67,
    'Requer Rinnegan, Ocultismo 14 e Concentração 12. Lê a mente de um alvo indefeso (completa, 7 chakra, concentração): a cada turno ele testa Espírito (9 + sua Concentração) — cada falha revela um fato — e sofre dano fixo = sua Concentração; no 4º turno testa Vigor 9 ou morre e você escolhe a informação.',
    { livro: 'Hijutsus', tecnicas: [tec(1, 'Ningendō: Ler a Mente', 'completa', 7, 'Só em alvo indefeso. Regras na aptidão.')] }),
  apt('Gakidō (Caminho Preta)', 'Rinnegan', 68,
    'Requer Rinnegan, Ocultismo 14 e Espírito 14. Sem custo e sem ganhar o chakra. Absorver Técnica (reação, LM contra o ataque): desfaz técnicas de custo até ½ Espírito. Absorver Chakra de alvo indefeso (padrão, concentração): ½ Espírito por turno. Absorver Senjutsu sem ter o poder: vira pedra.', { livro: 'Hijutsus' }),
  apt('Chikushōdō (Caminho Animal)', 'Rinnegan', 68,
    'Requer Rinnegan, Ocultismo 16 e Rinne Ninpou 7. Kuchiyose grátis no nível do Rinne Ninpou com 8 criaturas únicas (Pássaro Bico-de-Broca, Cachorro Quimera, Camaleão Quimera, Panda, Touro, Crustáceo, Centopeia, Rinoceronte), todas Enormes ou maiores; pode invocar as 8 juntas como capangas.', { livro: 'Hijutsus' }),
  apt('Tendō (Caminho Deva)', 'Rinnegan', 72,
    'Requer Rinnegan, Ocultismo 16 e Rinne Ninpou 8. A cada 5 de chakra gastos, espera 1 turno para usar de novo. Levitar (movimento, 1 CK, 1 m por Esp). Acelerar na Corrida (1 CK). Repelir reativo (LM, sem custo) contra ataques comuns; defensivo (movimento, custo igual à técnica) anula jutsus; ofensivo: Míssil ou Onda Explosiva do Rinne Ninpou com +4 de dano e acerto automático (na 2ª vez o alvo pode se defender). Atrair objetos (parcial) ou criaturas (padrão, acerto automático; fica indefesa até o fim do seu turno): +1/+3/+5/+7/+9 de chakra por tamanho.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Tendō: Levitar', 'movimento', 1, 'Sobe até 1 m por Espírito (só vertical). Desfazer é livre.'),
      tec(1, 'Tendō: Repelir Defensivo', 'movimento', 0, 'Anula uma técnica pagando o mesmo custo dela (pague à parte). Também afasta técnicas presas em você.'),
      tec(1, 'Tendō: Atrair Criatura (Banshō Ten\'in)', 'padrao', 3, 'Alcance 10 m + 2 m por Espírito; acerto automático (na 2ª vez o alvo pode se defender); a criatura fica indefesa até o fim do seu turno. Custo: pequeno +1, médio +3, grande +5, enorme +7, imenso +9.', { alcance: 'medio' }),
    ] }),
  apt('Gedō (Caminho Externo)', 'Rinnegan', 74,
    'Requer Rinnegan, Ocultismo 18 e Espírito 18. Receptor de Chakra (parcial, 1 CK): haste = arma leve +2 (crítico 15–16). Obstruir Chakra (padrão, 8 CK): quem estiver perfurado fica paralisado enquanto a haste estiver nele (perfurar exige crítico; Vigor 9 + Esp com ação completa para tirar uma haste). Outros poderes do caminho no livro.', { livro: 'Hijutsus' }),
  // Samurai (Hijutsus págs. 75–78). Samurais não compram poderes comuns nem Aptidões Shinobi
  // e não usam Bunshin, Henge e Shunshin (salvo se o Mestre liberar).
  apt('Espadachim', 'Samurai', 75,
    'Com espada leve ou mediana: manobras especiais com a precisão da arma e sem o −2 (menos agarrar). Ganha Desarme Agressivo. Aparar Lâmina (Des 10): ao Bloquear arma cortante, sua espada não é danificada por armas que ignoram dureza.', { livro: 'Hijutsus' }),
  apt('Sabre Samurai', 'Samurai', 76,
    'Requer CC 12. Usar Arma Marcial para todas as espadas (menos pesadas) e Especialista nos testes de CC com elas. Lâmina de Chakra (parcial, 3 CK, sustentada: como Energizar). Corte de Chakra (padrão, ½ Espírito de CK): projétil de chakra com teste de CC, alcance 5 m + 1 m por Espírito, dano do seu ataque com a Lâmina; sem manobras.',
    { livro: 'Hijutsus', tecnicas: [
      tec(1, 'Lâmina de Chakra', 'parcial', 3, 'Envolve as espadas empunhadas em chakra (como Energizar: pode usar Espírito no dano). Sustentada.', { fica: 'Lâmina de Chakra' }),
      tec(1, 'Corte de Chakra', 'padrao', 'meioEspirito', 'Com a Lâmina de Chakra ativa: projétil com teste de CC, alcance 5 m + 1 m por Espírito, dano do seu ataque com a Lâmina. Sem aptidões de manobra. (Issen com duas espadas: dobra o dano de arma.)', { requer: 'Lâmina de Chakra' }),
    ] }),
  apt('Iaido', 'Samurai', 76,
    'Requer Des 8, Espadachim e Saque Rápido. Acuidade com espadas leves e medianas; katana (sem Ambidestria) +1 de dano. Corte Rápido: logo depois de sacar, usa Destreza no dano e pode Fintar como ação livre (uma espada só).', { livro: 'Hijutsus' }),
  apt('Yojinbo', 'Samurai', 77,
    'Requer Des 10, Espadachim, Saque Rápido, Iaido e Ataque em Movimento. Investida sacando a espada: +0,5 no grau de dano (arredonda para cima) e sem a penalidade de defesa da Investida. Espada embainhada, uma só, sem outras manobras.', { livro: 'Hijutsus' }),
  apt('Issen', 'Samurai', 77,
    'Requer Des 12, Esp 12, Sabre Samurai e Ambidestria. Corte de Chakra com duas espadas dobra o dano de arma. Hadan (completa): quando um inimigo a 10 m ou mais tenta se aproximar, ataque com o Corte de Chakra; acertando, ele perde a ação de movimento.', { livro: 'Hijutsus' }),
  apt('Impedir Selos', 'Samurai', 77,
    'Requer Des 12, Espadachim, Saque Rápido e Iaido. Quando um inimigo faz selos no seu alcance corpo a corpo: saque e ataque (ação parcial, sem dano nem testes) — a técnica é interrompida e ele não usa técnicas com selos neste turno (não perde a ação). Seguir Passo: contra Passo Seguro, ação parcial para dar −3 no CD dele.', { livro: 'Hijutsus' }),
  apt('Iaigiri', 'Samurai', 78,
    'Requer Des 14, Espadachim, Saque Rápido e Iaido. Só como Golpe de Misericórdia com o Corte Rápido: +1 no grau de dano (grau 5). Sem manobras.', { livro: 'Hijutsus' }),
  apt('Armadura Samurai', 'Samurai', 78,
    'Requer Força 10 ou Vigor 12. Usar Armaduras Pesadas e a Armadura de Batalha Samurai (600 Ryos, pesada, −3 comp., absorção +20, dureza de corpo 2 — escolha na aba Equipamento; sem esta aptidão, penalidade −5). Leva até 4 espadas sem penalidade; capacete dá +3 nos testes contra venenos.', { livro: 'Hijutsus' }),
  // Hachimon Tonkou (pág. 207)
  apt('Estilo da Lótus', 'Hachimon', 207,
    'Ganha duas aptidões de manobra à escolha (cumprindo os pré-requisitos), mas só pode usá-las com o Hachimon Tonkou ativo. Pode ser comprada até 3 vezes, com manobras diferentes.'),
  // Akimichi (pág. 150)
  apt('Corpulência', 'Akimichi', 150,
    '+3 × Vigor de Vitalidade (já entra na ficha) e +2 em testes de Vigor. Pode pagar 2 de Vitalidade por 1 de chakra ao usar uma técnica. Não recebe os benefícios de Acelerado.'),
  apt('Resiliência', 'Akimichi', 151,
    'Dureza de corpo 1 a cada 4 de Vigor contra todo ataque. Em troca: −5 m de deslocamento e −3 em Esquiva, Agilidade, Acrobacia e Furtividade.'),
  apt('Controle de Caloria', 'Akimichi', 153,
    'Queima calorias (ação Parcial, cada nível 1×/cena): Verde −3 Vit, +6 chakra, Força +2 · Amarelo −5 Vit, +10 chakra, Força +4 · Vermelho −7 Vit, +14 chakra, Força +6 e Modo Chou. Pré-req.: Vigor 14; Corpulência; Resiliência (ou as pílulas coloridas, com penalidades).',
    { tecnicas: [
      tec(1, 'Caloria Verde', 'parcial', 0, 'Perde 3 de Vitalidade, ganha 6 de chakra e Força +2 (sustentada). Pelas pílulas: fatigado por 1 turno no fim.', { custoVit: 3, ganhoChakra: 6, fica: 'Caloria Verde (Força +2)', danoBonus: 1, tira: 'Caloria|Modo Chou' }),
      tec(1, 'Caloria Amarela', 'parcial', 0, 'Perde 5 de Vitalidade, ganha 10 de chakra e Força +4. Pelas pílulas: exausto por 2 turnos no fim.', { custoVit: 5, ganhoChakra: 10, fica: 'Caloria Amarela (Força +4)', danoBonus: 2, tira: 'Caloria|Modo Chou' }),
      tec(1, 'Caloria Vermelha (Modo Chou)', 'parcial', 0, 'Perde 7 de Vitalidade, ganha 14 de chakra, Força +6 e entra no Modo Chou (asas; sem as penalidades da Resiliência). Pelas pílulas: inconsciente 24 h (Vigor 23 para só exausto) e risco de morte.', { custoVit: 7, ganhoChakra: 14, fica: 'Modo Chou (Força +6)', danoBonus: 3, tira: 'Caloria|Modo Chou' }),
    ] }),

  // Hatake (pág. 155)
  apt('Presa de Prata', 'Hatake', 155,
    'Aptidão especial do Tensai: Usar Arma (Espada de Chakra Branco) e uma aptidão de Domínio Elemental + Maestria para um dos 5 elementos básicos. Pré-req.: Tensai.'),

  // Hyuuga (pág. 157)
  apt('Byakugan', 'Hyuuga', 157,
    'Ativar: ação Parcial, 1 de chakra, dura a cena (pode ativar na defesa). Visão de raio-X 360° (10 m + 2 m por Rastrear), vê chakra, ignora camuflagem do ambiente; não pode ser surpreendido nem flanqueado; 1×/cena simula 2 dados em Percepção/Procurar/Prontidão/Rastrear. Pré-req.: Percepção 1.',
    { tecnicas: [tec(1, 'Ativar Byakugan', 'parcial', 1, 'Byakugan ativo pela cena: visão 360° e de chakra; não pode ser flanqueado nem surpreendido.', { fica: 'Byakugan', modo: 'byakugan' })] }),
  apt('Tenketsu Byakugan', 'Hyuuga', 158,
    'Com o Byakugan: cada acerto do Juuken básico faz o alvo testar Vigor (Dif 7 + 2 × Juuken) ou perde 2 de chakra (tenketsu selado; volta com uma noite de descanso). Pré-req.: Byakugan; Procurar 7; Prontidão 7; Rastrear 7.'),

  // Inuzuka (pág. 163)
  apt('Companheiro Animal', 'Inuzuka', 163,
    'Cão ou lobo como Parceiro: mesma ficha do Inuzuka com −2 em tudo (Vit/Chakra pelas fórmulas). Pequeno; Médio com Lidar com Animais 10; Grande e fala com 14; Matilha em 16 e 18. Pré-req.: Lidar com Animais 1.'),
  apt('Hakken no Jutsu', 'Inuzuka', 164,
    'Olfato sobre-humano (ação Livre, 2 de chakra, contínua): detecta odores a 10 m + 2 m por Rastrear; teste de Rastrear contra surpresa; −1 nível de dificuldade em Prontidão, Rastrear e Procurar pelo olfato. Pré-req.: Rastrear 1.',
    { tecnicas: [tec(1, 'Ativar Hakken', 'livre', 2, 'Olfato apurado ativo (contínua).', { fica: 'Hakken no Jutsu' })] }),

  // Sarutobi (pág. 174)
  apt('Vontade do Fogo', 'Sarutobi', 174,
    'Aptidão especial do Tensai: Duro de Matar grátis, envelhece devagar e cria até 2 Kage Bunshin resistentes (1/5 da Vit, com Duro de Matar). Pré-req.: Tensai; Vigor 6; Resistência Maior (Vigor); Clone Verdadeiro.'),

  // Uchiha (pág. 180)
  apt('Elemento Natural: Katon', 'Uchiha', 180,
    'Usa o Sopro Destrutivo 4 de Katon mesmo sem o poder: dano base = Espírito + 2, custo = metade do Espírito. Com o poder Katon, ganha o Sopro Destrutivo de graça (evolui no 7 e no 10). Pré-req.: Espírito 1.',
    { tecnicas: [tec(1, 'Katon: Goukakyuu no Jutsu', 'padrao', 'meioEspirito', 'Sopro Destrutivo de Katon em cone: dano base Espírito + 2 (o menu de Jutsus do Katon tem o ataque completo).')] }),
  apt('Sharingan', 'Uchiha', 181,
    'Ativar: ação Parcial, 1 de chakra, dura a cena. Vê chakra, mede o poder; Esquiva Perceptiva: a Dif para te acertar pode usar 9 + LM no lugar da Esquiva. Pré-req.: Percepção 3.',
    { tecnicas: [tec(1, 'Ativar Sharingan', 'parcial', 1, 'Sharingan ativo pela cena (Esquiva Perceptiva: 9 + LM).', { fica: 'Sharingan', modo: 'sharingan' })] }),
  apt('Nidan Sharingan', 'Uchiha', 182,
    'Com o Sharingan: Intuição grátis, +2 em Prontidão contra Fintar, não pode ser flanqueado, Olhar Hipnótico (genjutsu pelo olhar, 9 m), +2 contra genjutsu ocular e Mímica Sharingan. Pré-req.: Percepção 6; Sharingan.'),
  apt('Sandan Sharingan', 'Uchiha', 182,
    'Com o Sharingan: Hipnose Sharingan, imune à finta acelerada, manobras de previsão mesmo desprevenido, Superar Técnica sem penalidade, Reverter Ilusão. Pré-req.: Percepção 9; Nidan Sharingan.'),
  apt('Mangekyou Sharingan', 'Uchiha', 183,
    'Escolha um par de técnicas (Tsukuyomi + Amaterasu, Kagutsuchi + Amaterasu ou Kamui) e depois o Susanoo. 10 pontos de visão: a cada 3 perdidos, ofuscado permanente; zerar = dor e depois cegueira. Pré-req.: Percepção 16; Sandan Sharingan; evento traumático.',
    { tecnicas: [
      tec(1, 'Amaterasu', 'padrao', 10, 'Teste de LM contra a defesa (só Esquiva se acelerado, Evadir com cobertura). Dano fixo 2 × Katon e 4 por turno enquanto queima, ignorando dureza. Custa 2 pontos de visão (+1 por turno em concentração). 9 m.', { alcance: 9 }),
      tec(1, 'Tsukuyomi', 'padrao', 10, 'Genjutsu pelo olhar (9 m): Mensageiro (1 visão) ou Torturador (2 visão): Inteligência contra 11 + Int do usuário; falhando, exausto e −4 de Inteligência.', { alcance: 9 }),
      tec(1, 'Kamui: ativar', 'livre', 10, 'Ativa o Kamui (contínua). Teletransporte para a dimensão: Movimento, 1 chakra e 1 visão. Intangível: Padrão, 5 chakra e 2 visão. Abdução ofensiva: Padrão, 10 chakra e 2 visão, 3 acertos de LM.', { fica: 'Kamui ativo' }),
      tec(1, 'Susanoo', 'padrao', 10, 'Avatar de chakra (sustentado). Exige dominar o par de técnicas do Mangekyou.', { fica: 'Susanoo' }),
    ] }),

  // Uzumaki (pág. 193)
  apt('Chakra Expandido', ['Uzumaki', 'Hoshigaki'], 193,
    'Chakra máximo +50% (já entra na ficha).'),
  apt('Mil Clones', 'Uzumaki', 194,
    'Por 6 de Vitalidade e uma ação Padrão: 1 Kage Bunshin por ponto de chakra (fica com 1). Clones falham em testes de combate; com 8+ clones, Ataque em Grupo (flanqueado, +3 de dano). Pré-req.: Espírito 10; Chakra Expandido; Clone 2; Clone Verdadeiro.',
    { tecnicas: [tec(1, 'Mil Clones', 'padrao', 0, 'Cria 1 Kage Bunshin por ponto de chakra, dividindo o chakra entre eles (você fica com 1).', { custoVit: 6 })] }),
  apt('Kongou Fuusa', 'Uzumaki', 195,
    'Correntes de selamento (Padrão, 7 de chakra, 10 m + 2 m por Espírito): Ataque (dano = Espírito), Capturar (CD; paralisado até 5 turnos; Espírito 9 + Esp por turno ou fica sem chakra; Força 9 + Esp para soltar) ou Barreira (absorção 4 × Espírito). Pré-req.: Espírito 14.',
    { tecnicas: [
      tec(1, 'Kongou Fuusa: Capturar', 'padrao', 7, 'Teste de CD: o alvo fica paralisado (concentração, até 5 turnos). Força Dif 9 + seu Espírito para se soltar.', { ataque: 'alvo', alcance: 'medio', dano: 0, aplica: 'indefeso', duracaoAplica: 5 }),
      tec(1, 'Kongou Fuusa: Barreira', 'padrao', 7, 'Cúpula de correntes e chakra (10 m a 3 m por Espírito de diâmetro, absorção 4 × Espírito).', { fica: 'Barreira de Kongou Fuusa' }),
    ] }),
];

// ---------------------------------------------------------------------
// Poderes restritos dos clãs (com técnicas por nível)
// ---------------------------------------------------------------------
export const PODERES_CLAS = [
  {
    id: 'baika_ninpou', nome: 'Baika Ninpou (Akimichi)', tipo: 'restrito', pagina: 151,
    resumo: 'Expansão do corpo: roliço no Nv 1, Grande no 4, Enorme no 5, Imenso no 6. Nikudan Sensha, Bunbun Baika e Choudan Bakugeki.',
    requisitos: { cla: 'Akimichi', atributos: { vigor: 6 }, aptidoes: ['Corpulência'] },
    tecnicas: [
      tec(1, 'Baika no Jutsu (roliço)', 'movimento', 1, 'Fica roliço (para o Nikudan Sensha, só ação Parcial).'),
      tec(4, 'Baika no Jutsu: Grande', 'movimento', 3, 'Todo o corpo cresce para Grande (itens e armas crescem junto).', { tamanho: 'grande', fica: 'Baika (Grande)' }),
      tec(5, 'Baika no Jutsu: Enorme', 'movimento', 4, 'Todo o corpo cresce para Enorme.', { tamanho: 'enorme', fica: 'Baika (Enorme)' }),
      tec(6, 'Baika no Jutsu: Imenso', 'movimento', 5, 'Todo o corpo cresce para Imenso.', { tamanho: 'imenso', fica: 'Baika (Imenso)' }),
      tec(1, 'Desfazer Baika', 'livre', 0, 'Volta ao tamanho normal.', { tamanho: null, tira: 'Baika' }),
      tec(2, 'Nikudan Sensha', 'completa', 1, 'Atropelar com Investida que causa o dano corporal comum; o alvo testa Vigor (Dif 2 + seu CC) ou cai. Pré-req.: Lutador.'),
      tec(3, 'Bunbun Baika no Jutsu', 'livre', 0, 'Antes de um ataque ou manobra: braço/perna Grande (alcance CC 2 m, Força +1) e +1 em atropelar, empurrar, agarrar e derrubar. Pré-req.: Lutador.'),
      tec(4, 'Choudan Bakugeki', 'padrao', 3, 'Só no Modo Chou: soco com o dano corporal +3 (com Baika a partir do Nv 7; +1 por nível a partir do 8). Pré-req.: Corpulência; Resiliência.', { alcance: 'toque' }),
    ],
  },
  {
    id: 'juuken', nome: 'Juuken (Hyuuga)', tipo: 'restrito', pagina: 159,
    resumo: 'Punho Gentil: golpes desarmados letais com dano (Destreza ÷ 2) + 1 (2 no Nv 4, 3 no 5, 4 no 6), ignoram metade da dureza de corpo. Precisa do Byakugan ativo.',
    requisitos: { cla: 'Hyuuga', atributos: { espirito: 1 }, aptidoes: ['Byakugan', 'Acuidade'] },
    tecnicas: [
      tec(1, 'Juuken (postura)', 'livre', 0, 'Entra na postura: o ataque "Juuken" aparece em Atacar (dano Destreza ÷ 2 + arma do nível).', { fica: 'Postura Juuken' }),
      tec(2, 'Jūkenpō Ichigekishin', 'padrao', 2, 'Explosão de chakra a 3 m: teste de CD contra todos; quem é atingido testa Acrobacia 13 ou cai. Quem te agarra não se defende. Quebra amarras (2 de dano por nível).', { alcance: 3 }),
      tec(3, 'Hakkeshou Kaiten (ofensivo)', 'padrao', 2, 'Gira e atinge todos a 2 m (5 m no Nv 6) com o dano do Juuken; Acrobacia ou Vigor (Dif 7 + 2 × nível) ou cai.'),
      tec(3, 'Hakkeshou Kaiten (defesa)', 'parcial', 'nivel', 'Defender com Técnica usando o CC desarmado no lugar do LM: barreira de dureza 3 + 2 × nível (não pode ser ignorada).'),
      tec(4, 'Hakke Sanjuuni Shou', 'padrao', 4, '3 ataques Juuken (Ataque Múltiplo) com +3 de dano; cada golpe tira 3 de chakra. Crítico: os seguintes acertam sozinhos. Pré-req.: Tenketsu Byakugan; Ataque Múltiplo.', { alcance: 'toque' }),
      tec(5, 'Hakke Kuushou', 'padrao', 5, 'Golpe Juuken projetado até 20 m (teste de CC); o alvo testa Acrobacia ou Força (Dif 9 + 2 × Juuken) ou é jogado 3 m e cai.', { alcance: 20 }),
      tec(6, 'Hakke Rokujuuyon Shou', 'padrao', 6, '3 ataques Juuken com +4 de dano; cada golpe tira 4 de chakra; se os 3 tirarem chakra, Vigor (Dif 7 + 2 × Juuken) ou atordoado. Pré-req.: Tenketsu Byakugan; Ataque Múltiplo.', { alcance: 'toque' }),
      tec(7, 'Juuho Soushiken', 'movimento', 'meioNivel', 'Leões gêmeos (sustentada, ½ nível de chakra por turno): Ataque Múltiplo especial, cada golpe com dano base = nível usado. Pré-req.: Ataque Múltiplo.', { fica: 'Juuho Soushiken', drenoTurno: 'meioNivel' }),
      tec(8, 'Hakke Hyakunijuuhachi Shou', 'padrao', 'nivel', '3 ataques Juuken com +1 de dano por nível; cada golpe tira 5 de chakra (+1 a cada 3 níveis acima de 8).', { alcance: 'toque' }),
    ],
  },
  {
    id: 'shikakyu', nome: 'Shikakyu (Inuzuka)', tipo: 'restrito', pagina: 165,
    resumo: 'Técnicas quadrúpedes com o companheiro: garras e mordida, Tsuuga, Gatsuga e as formas de lobo gigante.',
    requisitos: { cla: 'Inuzuka' },
    tecnicas: [
      tec(1, 'Shikakyu no Jutsu', 'parcial', 1, 'Forma quadrúpede (contínua): garras e mordida com dano (Força ÷ 2) + 1 (2 no Nv 4, 3 no 5, 4 no 6), +1 em Intimidação e +2 na iniciativa. Pré-req.: Hakken no Jutsu.', { fica: 'Shikakyu (quadrúpede)' }),
      tec(2, 'Juujin Bunshin no Jutsu', 'movimento', 2, 'O companheiro vira uma cópia sua (contínua). Cancela se ele desmaiar ou perder metade da Vit. Pré-req.: Companheiro Animal.', { alcance: 'toque' }),
      tec(3, 'Tsuuga', 'completa', 1, 'Atropelar com Investida girando (precisa do Shikakyu e de 3 m): dano das garras; o alvo testa Vigor (Dif 2 + seu CC) ou cai. Com o cão transformado: Gatsuga (seu dano dobra). Pré-req.: Lutador.'),
      tec(5, 'Sotorou (lobo de duas cabeças)', 'movimento', 3, 'Você e o cão viram um lobo Enorme (3 de chakra por turno). Golpear dá um ataque extra com metade do dano. Pré-req.: Disfarces 8.', { tamanho: 'enorme', fica: 'Sotorou', drenoTurno: 3 }),
      tec(6, 'Garouga', 'completa', 2, 'Tsuuga na forma Sotorou: tamanho Enorme e +6 de dano.'),
      tec(7, 'Santorou (lobo de três cabeças)', 'movimento', 4, 'Você, o cão e um clone viram um lobo Imenso (4 de chakra por turno). Pré-req.: Disfarces 12.', { tamanho: 'imenso', fica: 'Santorou', drenoTurno: 4 }),
      tec(8, 'Ooiga Gatenga', 'completa', 3, 'Tsuuga na forma Santorou: Imenso, +nível de dano, ataque em linha de 5 m de largura.'),
      tec(1, 'Desfazer transformação', 'livre', 0, 'Volta ao tamanho normal.', { tamanho: null, tira: 'Sotorou|Santorou' }),
    ],
  },
  {
    id: 'kagejutsu', nome: 'Kagejutsu (Nara)', tipo: 'restrito', pagina: 168,
    resumo: 'Arte das Sombras: prende (paralisa) com a sombra, imita, estrangula, puxa objetos e costura. Alcance 5 m + 2 m por nível. Escapar: Força Dif 9 + nível + ½ Int do usuário.',
    requisitos: { cla: 'Nara' },
    tecnicas: [
      tec(1, 'Kage Shibari no Jutsu', 'padrao', 'nivel', 'Teste de CD (−3 se o alvo estiver vendo; furtivo/camuflado: alvo −3 e só Esquiva/Antecipar). Acertando, o alvo fica paralisado (concentração: 1 + nível turnos, máx. 6; −1 a cada reuso na cena). Você fica imóvel.', { ataque: 'alvo', alcance: 'sombra', dano: 0, aplica: 'indefeso', duracaoAplica: 'shibari', penalidade: 3 }),
      tec(3, 'Kage Mane no Jutsu', 'padrao', 'nivel', 'Como o Shibari, mas o alvo imita seus gestos e deslocamentos (você pode andar). Voadores caem.', { ataque: 'alvo', alcance: 'sombra', dano: 0, aplica: 'indefeso', duracaoAplica: 'shibari', penalidade: 3 }),
      tec(4, 'Kage Mane Shuriken no Jutsu', 'parcial', 'nivel', 'Prepara a sombra numa arma condutora (Aian Nakkuru) e arremessa na sombra do alvo (Padrão): paralisa até 2 turnos; −2 na Esquiva/Antecipar se ele não sabe a intenção.'),
      tec(5, 'Kage Kubishibari no Jutsu', 'movimento', 'nivel', 'Transforma o Shibari/Kage Mane em estrangulamento: dano fixo de sufocamento = nível no fim de cada turno seu (1 alvo a cada 6 de Espírito).'),
      tec(6, 'Kageyose no Jutsu', 'movimento', 'nivel', '2 filamentos de sombra por nível que pegam objetos pequenos; algemar (Algemar Nv 6 de Ninpou), dureza nível + ½ Int.', { fica: 'Kageyose (filamentos)' }),
      tec(6, 'Kage Nui', 'padrao', 'nivel', 'Agulhas de sombra (2 por nível, 1 de dano base cada; não é técnica lenta). Costurar (Completa): grau 3+ deixa impedido; de novo, paralisado.'),
      tec(8, 'Kagezukami no Jutsu', 'padrao', 'nivel', 'Como o Kage Mane, mas você puxa e move o alvo para onde quiser dentro do alcance (ele age, mas não se desloca).'),
    ],
  },
  {
    id: 'shindenshin', nome: 'Shindenshin (Yamanaka)', tipo: 'restrito', pagina: 196,
    resumo: 'Transmissão da Mente: troca de mente, telepatia, sensor de mentes e controle de corpos. Resistir: Inteligência Dif 9 + nível + ½ Int do usuário (capangas falham).',
    requisitos: { cla: 'Yamanaka' },
    tecnicas: [
      tec(1, 'Shintenshin no Jutsu', 'padrao', 'nivel', 'Manda a mente para o alvo (5 m + 1 m por Int) e controla o corpo dele (1 dia por nível). Melhor em alvo impedido, agarrado, atordoado, indefeso ou surpreso; senão ele testa Agilidade/Prontidão (Dif −3) e, passando, você desmaia até o próximo turno. Seu corpo fica indefeso.'),
      tec(3, 'Shindenshin no Jutsu', 'padrao', 'nivel', 'Telepatia (concentração, 1 cena): conversa, lê e passa memórias com até "nível" pessoas; rede de comunicação. Quem não quiser testa Inteligência.'),
      tec(3, 'Sensor de Mentes', 'parcial', 2, 'Detecta e distingue mentes a 10 m + 2 m por Rastrear (sustentada).', { fica: 'Sensor de Mentes' }),
      tec(5, 'Shinten Bunshin no Jutsu', 'padrao', 4, 'Divide a consciência e controla 2 corpos inanimados, cadáveres ou animais médios (10 min por nível); viram Parceiros.'),
      tec(6, 'Shinranshin no Jutsu', 'padrao', 'nivel', 'Controla o corpo do alvo pelo sistema nervoso (concentração) sem sair do seu: ele testa Inteligência; falhando, você usa as ações dele (só ataques comuns e defesas básicas). 3 alvos no Nv 8.'),
      tec(7, 'Shinten Kugutsu Juin no Jutsu', 'completa', 'nivel', 'Com um boneco preparado: prende a mente do inimigo no boneco e controla o corpo dele sem risco de ser expulso.'),
    ],
  },
];

// ---------------------------------------------------------------------
// Hijutsus do Livro Básico com técnicas por nível (págs. 201–244)
// ---------------------------------------------------------------------
/**
 * Técnicas de poderes comuns que funcionam por lista (Livro Básico págs. 114–121).
 * Selos avançados: criar a tarja custa chakra igual ao nível usado e uma ação completa;
 * são gastos ao usar e destruídos por dano cortante ou de fogo.
 */
export const TECNICAS_PODERES = {
  fuuinjutsu: [
    tec(1, 'Selo de Armazenamento', 'completa', 1, 'Sela objetos, chakra ou jutsus num pergaminho (1 rodada). 1 chakra por compartimento para guardar ou tirar. Jutsu: 1 + o custo dele para guardar e o custo de novo para liberar (ação do jutsu, com selos de mão; ataque à distância usa seu CD). Não guarda técnicas pessoais, de toque, sustentadas ou de concentração. Nv 3: 1 objeto médio; Nv 5: grande.'),
    tec(2, 'Selo de Armazenamento Maior', 'completa', 1, 'Como o Selo de Armazenamento, mas com 6 compartimentos de itens ou mais chakra (até 1 + 1 por nível do poder).'),
    tec(3, 'Misshi (Mensageiro)', 'padrao', 3, '[Selo avançado] Grava uma mensagem de até 20 palavras que toca quando a assinatura de chakra escolhida tocar o selo; você sabe na hora que ela foi ouvida.'),
    tec(4, 'Bakudan (Bomba)', 'padrao', 'meioNivel', '[Selo avançado] Tarja explosiva melhorada (1 chakra por tarja ao criar; ativar custa metade do nível). Esfera de 2 m de diâmetro por nível e 2 de dano por nível usado; ativação remota: Dif 9 + 2 × nível. Um Bakudan por ataque; aceita meta-aptidões; pode virar armadilha (Mecanismos).', { danoTexto: 'dobroNivel' }),
    tec(5, 'Gensou no In (Selo de Ilusão)', 'padrao', 5, '[Selo avançado] Ilusão de objetos ou criaturas no lugar do selo, até 1 m por Inteligência em cada medida. Só se percebe interagindo; não é cancelada por Kai (é ninjutsu). Some quando o selo é removido.'),
    tec(6, 'Ninjutsu no Wana (Armadilha)', 'completa', 4, '[Selo avançado] Requer Mecanismos 10. Armadilha (círculo de 0,5 m por Int) que lança um ninjutsu seu de alcance à distância (nível até 8, sem restritos) na primeira criatura que passar; custo 4 + o do jutsu. Seu teste de CD fica gravado e a vítima defende com −1. Procurar/Prontidão para notar: Dif 7 + 2 × nível (só quem tem Ocultismo ou Fuuinjutsu).'),
    tec(7, 'Chakra no Souin (Contenção de Chakra)', 'completa', 0, '[Selo avançado] Precisa de 15 de chakra e fica com 1. Círculo fixo de 1 m por Int: toda criatura nele perde 2 de chakra por turno (nunca abaixo de 1; não afeta sua assinatura).'),
    tec(8, 'Kekkai no In (Barreira de Selo)', 'completa', 8, '[Selo avançado] Parede invisível e indestrutível (0,5 m por Int de altura e largura) que nada atravessa e dá cobertura. Não para tempo-espaço (Hiraishin) nem doujutsus. Acaba se o selo for movido ou destruído.'),
    tec(8, 'Shishou Fuuin (Quatro Símbolos)', 'completa', 16, '[Selo épico] Requer Ocultismo 16. Ritual de 3 dias com 10 pessoas para selar uma Bijuu num pote (até 10 anos) ou numa pessoa (vira Jinchuuriki). Qualquer perturbação cancela.'),
    tec(9, 'Keiyaku Fuuin (Anticontrato)', 'padrao', 8, '[Selo épico] Requer Ocultismo 16. Com um toque, cancela o controle de um Mangekyou Sharingan sobre uma Bijuu.'),
    tec(10, 'Shiki Fuujin (Demônio da Morte)', 'padrao', 10, '[Selo épico] Requer Ocultismo 20. Alcance 75 m. Preparação de 1 turno; depois os braços do Shinigami agarram a alma do alvo (sucesso automático): ele fica indefeso e é selado no início do seu próximo turno (morre). Selamento parcial: membros inutilizados e exausto para sempre. Você morre 5 minutos depois.'),
  ],
  kami_ninpou: [
    tec(5, 'Anjo de Papel', 'parcial', 0, '[Requer Shikigami no Mai] Asas de papel (2 Pontos Kami): Voo = Espírito (ou Arte). Voo rápido (1 PK): Corrida com Espírito no lugar de Atletismo. Com as asas, pode usar Flechas Nv 3. Sustentada.'),
    tec(6, 'Julgamento', 'completa', 0, '[Requer Anjo de Papel e Shikigami 2] Envolve um alvo médio ou menor (capanga, indefeso ou impedido): indefeso e sufocando (dano fixo = dano comum do poder). Ele escapa com ação padrão + Força contra a Dif do poder. Fogo/Katon ou Suiton nele cancela e você sofre dano grau 2. Nv 9: 1 alvo a cada 2 níveis, ou um não-capanga mesmo sem estar indefeso.'),
    tec(10, 'Emissário Divino', 'completa', 0, '[Requer Fuuinjutsu 8, Anjo de Papel e Shikigami 2] 1º estágio (completa, 10 PK): o ambiente vira papel. 2º (completa, 12 PK): selos explosivos. Explosão (padrão): círculo com o triplo do tamanho comum, dano 2 por nível, alvos indefesos (golpe de misericórdia), ignora dureza; você também sofre grau 3.'),
  ],
  hyouton: [
    tec(6, 'Espelhos Demoníacos', 'padrao', 3, '[Hijutsus pág. 20] Requer Ataque em Movimento e Imergir. 21 espelhos em meia-esfera (1 m de diâmetro por nível): teste de CD contra Evadir (sem saída = sucesso automático). Custa 3 chakra por turno. Dentro deles: absorção 8 por nível, ataques e áreas erram com 4 ou menos no d8 (exceto Kagura Shingan/visão de chakra); trocar de espelho é ação de movimento (acelerado, finta acelerada à distância). Reconstruir: ação de movimento. Nv 8: dureza 2, troca como ação parcial, 4 chakra por turno.'),
  ],
  iryou_ninjutsu: [
    tec(6, "In'yu Shōmetsu (Recuperação Secreta)", 'movimento', 0, 'Requer Perito e Perícia Inata em Medicina. Ao ser atingido, cura na hora até o dano daquele ataque (1 chakra por 2 de Vitalidade). Não funciona contra crítico nem área. 1 vez por dia.'),
    tec(6, 'Chakra no Mesu (Bisturi de Chakra)', 'movimento', 0, 'Lâminas de chakra sustentadas: ataques de toque com dano letal de 2 por nível usado (aceita Ataque Múltiplo; não pode ser bloqueado desarmado). Três acertos: Vigor (Dif 7 + nível + ½ Medicina) ou fica lento e debilitado.'),
    tec(7, 'Shousen no Jutsu (Mão Mística)', 'padrao', 'nivel', 'Cura pela taxa do Iryou Ninjutsu. Ofensivo: o alvo testa Vigor (Dif 7 + nível + ½ Medicina) ou fica atordoado até o fim do próximo turno dele (falha crítica: testa de novo; se falhar, inconsciente).'),
  ],
};

/**
 * Técnicas que vêm de aptidões comuns (Livro Básico págs. 76–82).
 * aptidao = nome da aptidão exigida; poder = poder exigido (qualquer nível).
 */
export const TECNICAS_APTIDOES = [
  { aptidao: 'Clone', ...tec(1, 'Clone Genérico', 'padrao', 1, 'Até 2 clones (Clone 2: até 6, mas falham em testes de Habilidade de Combate) por 1 chakra cada. São Parceiros e Capangas com 1 de Vitalidade e sem chakra; itens são cópias falsas. Escolha: atirador (CD e ESQ sem penalidade com 1 clone), resistente (dureza de corpo = Esp − 3) ou enganador (com Réplica Enganadora). Mestre: coloque os clones como capangas.') },
  { aptidao: 'Clone', ...tec(1, 'Kage Bunshin (Clone das Sombras)', 'padrao', 0, 'Paga 3 de Vitalidade por clone e divide o chakra igualmente com eles (a maior parte fica com você). Ao desfazer, o chakra e as memórias voltam, e também fatigado/exausto (cumulativos). Sem regeneração de chakra enquanto existirem. Com Clone Verdadeiro: 1 clone que usa jutsus, poderes e aptidões não restritos.', { custoVit: 3 }) },
  { aptidao: 'Clone', poder: 'suiton', ...tec(1, 'Mizu Bunshin (Clone de Água)', 'padrao', 1, 'Clone de água (1 chakra cada). Com 1 clone, CC e ESQ sem penalidade. Pode lançar seus ataques Suiton a partir dele (até 5 m); funde-se com água (Imergir Nv 2 grátis).') },
  { aptidao: 'Clone', poder: 'doton', ...tec(1, 'Iwa Bunshin (Clone de Pedra)', 'padrao', 1, 'Clone de pedra (1 chakra cada) com Vitalidade = 1/5 da sua; recebe suas técnicas Doton de suporte ativas; funde-se com terra (Imergir Nv 2 grátis).') },
  { aptidao: 'Réplica Enganadora', ...tec(1, 'Réplica Enganadora', 'livre', 4, 'Ao falhar na defesa contra corpo a corpo ou projétil por até 2 pontos: um clone leva o golpe e você usa o Movimento para se afastar sem ataque oportuno. 1 vez por cena (Nv 2: 2 vezes, e pode testar Furtividade).', { umaPorCena: 'Réplica Enganadora usada nesta cena' }) },
  { aptidao: 'Fascinar', ...tec(1, 'Fascinar', 'padrao', 3, '[Ilusão] Alvo a até 5 m testa Inteligência contra 6 + sua Inteligência ou fica fascinado pela cena. Do 2º turno em diante pode repetir o teste (Dif −1 por tentativa); qualquer dano quebra. Só 1 vez por cena no mesmo alvo.', { genjutsu: 'compulsao', ilusao: ['fascinado'], alcance: 5, difFascinar: true }) },
  { aptidao: 'Miragem', ...tec(1, 'Miragem', 'padrao', 1, '[Ilusão] Imagem parada ou móvel num ponto a até 5 m (1 chakra por categoria de tamanho: pequena; Int 8 média; 12 grande; 16 enorme). Tocar revela a ilusão (depois sai com Kai); visão de chakra vê na hora. Contínua se parada, sustentada se móvel.') },
  { aptidao: 'Kyoudo Kyouka', ...tec(1, 'Kyoudo Kyouka: Concentrar chakra', 'parcial', 'meioEspirito', 'Acumula chakra na mão ou no pé (Kyoudo Kyouka 2: ação de movimento). O próximo golpe desarmado aparece em Atacar como “Kyoudo Kyouka”: dano ½ Espírito + nível do Iryou (Nv 2: Espírito + Iryou), sem Força nem bônus, não pode ser Bloqueado e o alvo testa Acrobacia (Dif 9 + Esp) ou cai. O chakra é liberado mesmo se errar.', { fica: 'Kyoudo Kyouka: chakra concentrado', kyoudo: true }) },
  { aptidao: 'Kyoudo Kyouka', ...tec(1, 'Oukashou (Flor de Cerejeira)', 'padrao', 'meioEspirito', 'Requer Kyoudo Kyouka 2 e Espírito 10. Soco com o dano do Kyoudo Kyouka. No chão: cratera de 1,5 m por Espírito; quem estiver nela e falhar na defesa sofre metade do dano e cai (Acrobacia Dif 9 + Esp evita); quem estiver sob a terra sofre o dano todo com grau 4.') },
  { aptidao: 'Kyoudo Kyouka', ...tec(1, 'Tsuutenkyaku (Chute Celestial)', 'padrao', 'meioEspirito', 'Requer Kyoudo Kyouka 2 e Espírito 10. Igual ao Oukashou, com um chute vertical para baixo depois de um salto.') },
];

/**
 * Taijutsus de exemplo (Livro Básico, págs. 207–212). Não custam pontos: basta cumprir
 * os requisitos (aptidões e nível do Hachimon). portao = portão que precisa estar aberto.
 */
const tai = (nome, rank, acao, aptidoes, resumo, extra = {}) => ({ nome, rank, acao, aptidoes, resumo, ...extra });
export const TAIJUTSUS = [
  tai('Gouken (Punho de Ferro)', 'D', 'livre', ['Punho de Ferro'], 'Postura de luta de Konoha: dano de arma adicional ao atacar desarmado, pelas regras da aptidão Punho de Ferro. Contínua.'),
  tai('Konoha Reppū (Vento Violento)', 'D', 'padrao', ['Lutador'], 'Chute rasteiro: manobra Derrubar. Com Rasteira, +1 de precisão; com Derrubar Agressivo, causa dano e derruba; com Ataque Giratório, acerta todos à sua volta.', { manobra: 'Derrubar' }),
  tai('Konoha Senpū (Redemoinho)', 'D', 'completa', ['Ponto Cego'], 'Chute alto: teste resistido de Agilidade contra a Prontidão do alvo; se vencer, ele fica fintado contra o chute baixo (o ataque). Com Chute Inverso, só uma ação padrão; com Chute Giratório, +2 de dano. Em dupla: Konoha Tsumuji Senpū.', { manobra: 'Fintar' }),
  tai('Konoha Shōfū (Vento Ascendente)', 'C', 'padrao', ['Arremessar', 'Lutador'], 'Chute para cima sem dano: arremessa o alvo (aptidão Arremessar) ou o desarma. Com Desarme Agressivo ou Derrubar Agressivo, também causa dano.'),
  tai('Konoha Daisenpū (Grande Redemoinho)', 'C', 'completa', ['Ponto Cego', 'Ataque Múltiplo', 'Ataque Giratório', 'Chute Giratório', 'Chute Duplo'], 'Começa com a finta do Konoha Senpū e segue com 2 ou 3 ataques (Ataque Múltiplo + Chute Giratório) ou 2 ataques com Chute Duplo.'),
  tai('Kage Buyō (Sombra da Folha Dançante)', 'C', 'parcial', ['Ataque em Movimento', 'Seguir Sombra'], 'Depois do Konoha Shōfū jogar o alvo para cima, salta e segue a sombra dele (aptidão Seguir Sombra); não pode vir depois do Derrubar Agressivo. Termina com um ataque corporal no ar.', { hachimon: 1 }),
  tai('Shishi Rendan (Combo do Leão)', 'C', 'padrao', ['Lutador', 'Arremessar', 'Ataque em Movimento', 'Seguir Sombra', 'Ataque Múltiplo'], 'Só em alvo seguido pelo Kage Buyō: 3 golpes desarmados (Ataque Múltiplo) e o joga no chão — dano comum de queda pela altura; o alvo fica caído.', { hachimon: 1, portao: 1, deixaCaido: true }),
  tai('Omote Renge (Lótus Inicial)', 'B', 'padrao', ['Lutador', 'Arremessar', 'Ataque em Movimento', 'Seguir Sombra'], 'Só em alvo seguido pelo Kage Buyō: agarra e gira contra o chão — dano comum de queda pela altura + dano comum de um ataque seu com o Hachimon; o alvo fica caído.', { hachimon: 1, portao: 1, deixaCaido: true }),
  tai('Ura Renge (Lótus Final)', 'A', 'padrao', ['Lutador', 'Arremessar', 'Ataque em Movimento', 'Seguir Sombra', 'Ataque Múltiplo'], 'Só em alvo seguido pelo Kage Buyō: o máximo de ataques possível e o empurra contra o chão — dano comum de queda pela altura; o alvo fica caído.', { hachimon: 3, portao: 3, deixaCaido: true }),
  tai('Asa Kujaku (Pavão Matutino)', 'A', 'padrao', ['Lutador', 'Arremessar', 'Ataque em Movimento', 'Seguir Sombra', 'Ataque Múltiplo', 'Ataque Progressivo'], 'O máximo de ataques com Ataque Múltiplo + bônus do Ataque Progressivo, depois o alvo cai — dano comum de queda pela altura; fica caído.', { hachimon: 6, portao: 6, deixaCaido: true }),
  tai('Hirudora (Tigre da Tarde)', 'A', 'padrao', ['Lutador', 'Arremessar', 'Derrubar Agressivo'], 'Um único ataque com o Ataque Pesado do Hachimon, que pode arremessar o inimigo longe e derrubá-lo.', { hachimon: 7, portao: 7 }),
  tai('Sekizō (Elefante da Noite)', 'A', 'padrao', ['Lutador', 'Arremessar', 'Derrubar Agressivo', 'Ataque Múltiplo'], 'Golpes sucessivos com Ataque Múltiplo usando o Hachimon Tonkou (cinco socos de ar pressurizado).', { hachimon: 8, portao: 8 }),
  tai('Yagai (Homem da Noite)', 'S', 'padrao', ['Lutador', 'Arremessar', 'Derrubar Agressivo'], 'Um chute com o Ataque Pesado do Hachimon, quase impossível de defender.', { hachimon: 9, portao: 8 }),
];

/**
 * Jinchuuriki (Livro Básico págs. 213–221; Livro de Hijutsus págs. 22–52).
 * Regras gerais iguais para toda Bijuu; muda o número de caudas (limite da Força
 * do Manto), o nível do Modo Bijuu e as técnicas próprias.
 */
const FORCA_MANTO = [[2, 1], [3, 3], [6, 4], [7, 5], [8, 6], [9, 7], [10, 8]]; // pág. 215
const forcaAteCaudas = (caudas) => FORCA_MANTO.filter(([nv]) => nv <= caudas + 1);
const BIJUUS = [
  { id: 'ichibi', nome: 'Ichibi (Shukaku, Uma Cauda)', caudas: 1, modo: 4, pagina: 29, elemento: 'Sabaku Hijutsu (areia; Efeito Canhão no Nv 1 e efeitos pelos níveis da tabela)', extras: [] },
  { id: 'nibi', nome: 'Nibi (Matatabi, Duas Caudas)', caudas: 2, modo: 4, pagina: 34, elemento: 'Aoi Katon (fogo azul)', extras: [
    tec(4, 'Nekozume (Garras de Gato)', 'livre', 0, '[Hijutsus pág. 36] Técnica própria do Nibi — efeito e custo exatos no livro; o Mestre aplica.')] },
  { id: 'sanbi', nome: 'Sanbi (Isobu, Três Caudas)', caudas: 3, modo: 4, pagina: 36, elemento: 'Sanbi Suiton (água)', extras: [
    tec(4, 'Sangoshō (Soco do Coral)', 'padrao', 'nivel', '[Hijutsus pág. 37] Exige o Modo Bijuu (Nível 2 com Jinchuuriki 6; Nível 3 com 10) — efeito exato no livro; o Mestre aplica.', { requer: 'Jinchuuriki: Modo' }),
    tec(5, 'Kagenade (Arrancada das Sombras)', 'padrao', 'nivel', '[Hijutsus pág. 37] Na Forma Bijuu, avança enrolado contra os inimigos — efeito exato no livro.')] },
  { id: 'yonbi', nome: 'Yonbi (Son Goku, Quatro Caudas)', caudas: 4, modo: 4, pagina: 38, elemento: 'Yonbi Youton (lava; Manto de Lava e Vulcão)', extras: [] },
  { id: 'gobi', nome: 'Gobi (Kokuō, Cinco Caudas)', caudas: 5, modo: 5, pagina: 40, elemento: 'Gobi Futton (vapor: Ebulição, Aceleração-Vapor, Força-Vapor)', extras: [
    tec(8, 'Tsunoori (Investida do Chifre)', 'padrao', 'nivel', '[Hijutsus pág. 41] Na Forma Bijuu, investida com os chifres — efeito exato no livro.')] },
  { id: 'rokubi', nome: 'Rokubi (Saiken, Seis Caudas)', caudas: 6, modo: 5, pagina: 43, elemento: 'Rokubi Suiton (bolhas ácidas)', extras: [
    tec(8, 'Corrosão da Lesma', 'padrao', 'nivel', '[Hijutsus pág. 44] Na Forma Bijuu, névoa corrosiva pela boca — efeito exato no livro.')] },
  { id: 'nanabi', nome: 'Nanabi (Chōmei, Sete Caudas)', caudas: 7, modo: 5, pagina: 46, elemento: 'pó de prata e fios', extras: [
    tec(2, 'Pó de Prata', 'padrao', 'nivel', '[Hijutsus pág. 47] Técnica própria do Nanabi — efeito exato no livro.'),
    tec(6, 'Rede de Fios', 'padrao', 'nivel', '[Hijutsus pág. 47] Técnica própria do Nanabi — efeito exato no livro.'),
    tec(9, 'Casulo de Fios', 'movimento', 0, '[Hijutsus pág. 47] Técnica própria do Nanabi — efeito exato no livro.')] },
  { id: 'hachibi', nome: 'Hachibi (Gyūki, Oito Caudas)', caudas: 8, modo: 5, pagina: 48, elemento: 'tinta e tentáculos', extras: [
    tec(2, 'Tinta do Polvo', 'padrao', 'nivel', '[Hijutsus pág. 49] Tinta escura em névoa (também na água) que atrapalha a visão dos inimigos — detalhes no livro.'),
    tec(9, 'Cauda Morta', 'livre', 0, '[Hijutsus pág. 49] Com Controle Total, em Transformação Parcial.'),
    tec(10, 'Tornado do Polvo', 'completa', 'nivel', '[Hijutsus pág. 49] Na Forma Bijuu.')] },
  { id: 'kyuubi', nome: 'Kyuubi (Kurama, Nove Caudas)', caudas: 9, modo: 5, pagina: 220, metadeDano: true, elemento: null, extras: [
    tec(10, 'Modo Kurama', 'completa', 10, 'Precisa da Presença. Manto dourado (regras do Manto): dureza de corpo 3, Agilidade +2, acelerado, imune à finta super acelerada, +4 na Potência da Besta, Sensor de emoções e Transformação Parcial. Perde Manto e Modo Bijuu. Sem dano na Vitalidade (Controle Total).', { fica: 'Jinchuuriki: Modo Kurama', durezaCorpo: 3, requer: 'Jinchuuriki: Presença', modo: 'acelerado', forcaPorNivel: [[10, 8]], tira: 'Jinchuuriki:' })] },
];

function jinchuuriki(b) {
  const dreno = b.metadeDano ? 'meioNivel' : 'nivel';
  const forca = forcaAteCaudas(b.caudas);
  const textoForca = forca.map(([nv, f]) => `Nv ${nv}: +${f}`).join('; ');
  return {
    id: `jinchuuriki_${b.id}`, nome: `Jinchuuriki: ${b.nome}`, tipo: 'restrito', pagina: b.pagina,
    resumo: `Bijuu selada (${b.caudas} cauda${b.caudas > 1 ? 's' : ''}). Presença (livre) → Manto (parcial) → Modo Bijuu no Nv ${b.modo} (parcial); voltar é livre. Manto e Modo causam dano na Vitalidade igual ${b.metadeDano ? 'à metade do' : 'ao'} nível usado ao ativar e a cada turno. Duração segura: 1 + nível turnos (depois o dano dobra). Vitalidade 0 ou estresse: Teste de Domínio (2d8 contra 9). Chakra Bijuu = Chakra Expandido.${b.elemento ? ` Elemento próprio: ${b.elemento} — use as regras do livro com o Mestre.` : ' Cura da Raposa: recuperação dobrada e cura 1 nível de sangramento por turno; exausto no fim da cena se usou o Manto.'}`,
    requisitos: { cla: ['Jinchuuriki', b.nome.split(' ')[0]] },
    tecnicas: [
      tec(2, 'Presença Bijuu', 'livre', 0, 'Força +1, golpes desarmados letais e Potência da Besta (dano corporal com Espírito ÷ 2 + dano de arma 1; Nv 4: 2; Nv 5: 3; Nv 6+: 4). Sem dano na Vitalidade.', { fica: 'Jinchuuriki: Presença Bijuu', forcaBonus: 1, tira: 'Jinchuuriki:' }),
      tec(2, 'Manto Bijuu', 'parcial', 0, `Precisa da Presença. Golpes desarmados letais, dureza de corpo 1, bloqueia projéteis, acelerado e Força pelas caudas (${textoForca}). Dano por turno na Vitalidade.`, { fica: 'Jinchuuriki: Manto Bijuu', durezaCorpo: 1, requer: 'Jinchuuriki: Presença', drenoHp: dreno, modo: 'acelerado', forcaPorNivel: forca, tira: 'Jinchuuriki:' }),
      tec(3, 'Onda de Chakra', 'padrao', 'nivel', 'Com Manto, Modo ou Forma: meia-esfera de 2 m de diâmetro por nível ao seu redor. Dano base 2 × nível; Vigor (Dif 7 + 2 × nível) ou é empurrado até a borda (Nv 8: e cai).', { requer: 'Jinchuuriki: (Manto|Modo)', danoTexto: 'dobroNivel' }),
      tec(4, 'Braço de Chakra', 'parcial', 'nivel', 'Com Manto ou Modo: braço de chakra (dureza 3 × nível) que ataca com CC, bloqueia projéteis, agarra (apertar: Força × Vigor, dano fixo 2 × nível) e alcança 10 m + 4 m por nível. Recolher é livre e devolve o chakra.', { requer: 'Jinchuuriki: (Manto|Modo)' }),
      tec(b.modo, 'Modo Bijuu', 'parcial', 0, 'Precisa do Manto ativo. Mantém o Manto e ganha Agilidade +2 e dureza de corpo 2. Sem selos de mão e só técnicas deste poder.', { fica: 'Jinchuuriki: Modo Bijuu', durezaCorpo: 2, requer: 'Jinchuuriki: Manto', drenoHp: dreno, modo: 'acelerado', forcaPorNivel: forca, tira: 'Jinchuuriki:' }),
      tec(5, 'Disparo de Chakra', 'padrao', 'nivel', 'Com Modo Bijuu: alcance 15 m + 6 m por nível; explosão de 2 m de diâmetro por nível, dano base 2 × nível. Rajada: ação completa e +3 de chakra, novo teste a cada 2 níveis (+2 de dano por sucesso).', { requer: 'Jinchuuriki: Modo', danoTexto: 'dobroNivel' }),
      tec(7, 'Bijuudama', 'completa', 'bijuudama', 'Com Modo Bijuu, a 5 m de qualquer inimigo. Esfera ou cilindro (5 m) com alcance 15 m + 6 m por nível, esfera de 6 m de diâmetro por nível. Dano base 3 × nível. Quem Esquivar ou Antecipar testa Agilidade (Dif 9 + 2 × nível) ou sofre dano remanescente grau 1 (acelerados passam).', { requer: 'Jinchuuriki: Modo', danoTexto: 'triploNivel' }),
      ...b.extras,
    ],
  };
}

export const PODERES_HIJUTSU = [
  {
    id: 'senninka', nome: 'Senninka (Transformação Eremita)', tipo: 'restrito', pagina: 79, livro: 'Hijutsus',
    resumo: '[Hijutsus] Kekkei genkai que absorve energia natural sem treino. Surto Homicida: em combate não para até os inimigos morrerem (o Mestre decide os gatilhos). 1º estágio: 1 chakra por nível liberado (até metade do nível: ação parcial; acima: movimento), contínuo; bônus de 1 chakra cada, até 1 por nível (máx. 4). 2º estágio (Nv 5): parcial, 2 chakra, com o 1º a 100%; um bônus fica contínuo e entram Acelerado e Chakra +3 por nível. A partir do Nv 5, efeitos de Ninpou (Canhão, Criar Arma, Orbe, Raio, Flechas, Energizar, Sopro, Míssil + Corrente e Transferência Celular) com dano comum 2 × nível. Incompatível com Senjutsu e Juuinka.',
    requisitos: { cla: 'Senninka' },
    tecnicas: [
      tec(1, 'Liberar 1º estágio', 'parcial', 'nivel', 'Custa 1 chakra por nível liberado (até metade do nível do poder: ação parcial; acima: troque por ação de movimento). Contínuo.', { fica: 'Senninka: 1º estágio', tira: 'Senninka: [12]º' }),
      tec(1, 'Senninka: Força +4', 'livre', 1, '1 chakra: Força +4 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Força +4', turnosFica: 1, requer: 'Senninka:', forcaBonus: 4, tira: 'Senninka: (Força|Dano)' }),
      tec(1, 'Senninka: Dano +2', 'livre', 1, '1 chakra: Dano +2 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Dano +2', turnosFica: 1, requer: 'Senninka:', danoBonus: 2, tira: 'Senninka: (Força|Dano)' }),
      tec(1, 'Senninka: Ataque +1', 'livre', 1, '1 chakra: Ataque +1 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Ataque +1', turnosFica: 1, requer: 'Senninka:', bonusAtaque: 1 }),
      tec(1, 'Senninka: Defesa +1', 'livre', 1, '1 chakra: Defesa +1 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Defesa +1', turnosFica: 1, requer: 'Senninka:', bonusDefesa: 1 }),
      tec(1, 'Senninka: Dificuldade +1', 'livre', 1, '1 chakra: Dificuldade +1 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Dificuldade +1', turnosFica: 1, requer: 'Senninka:', dif: 1 }),
      tec(1, 'Senninka: Dureza +1', 'livre', 1, '1 chakra: Dureza +1 até o início do seu próximo turno (1 bônus de cada; até 1 por nível do poder, máx. 4).', { fica: 'Senninka: Dureza +1', turnosFica: 1, requer: 'Senninka:', durezaBonus: 1 }),
      tec(5, 'Liberar 2º estágio', 'parcial', 2, 'Com o 1º estágio a 100%. Escolha 1 bônus para ficar contínuo (pague-o à parte pelo botão do bônus). Ganha Acelerado; Chakra +3 por nível 1 vez por cena.', { fica: 'Senninka: 2º estágio', modo: 'acelerado', requer: 'Senninka: 1º', tira: 'Senninka: [12]º' }),
      tec(5, 'Senninka: Chakra +3 por nível', 'livre', 0, 'No 2º estágio: recupera 3 de chakra por nível do poder (1 vez por cena).', { ganhoChakra: 'tresPorNivel', requer: 'Senninka: 2º', umaPorCena: 'Senninka: Chakra extra usado' }),
      tec(5, 'Senninka: Corrente', 'parcial', 0, '[Efeito Nv 3] Estica o braço até 10 m: Agarrar à distância sem as penalidades comuns (testes de CC normais). Contínua.'),
      tec(6, 'Senninka: Transferência Celular', 'completa', 0, '[Efeito Nv 6] 1 rodada, toque, alvo fora de combate: absorve toda a Vitalidade restante dele (cura você, mata o alvo). Ou doa até 15 de Vitalidade a alguém compatível com o Juuinka (você fica menor até absorver alguém).'),
    ],
  },
  ...BIJUUS.map(jinchuuriki),
  {
    id: 'senjutsu', nome: 'Senjutsu (Técnica Eremita)', tipo: 'restrito', pagina: 239,
    resumo: 'Modo Eremita: 2 turnos concentrado e imóvel (dano ou defesa interrompem) e recebe 1 ponto de Chakra Senjutsu por nível. Cada ponto compra um bônus (ação livre; o mesmo bônus 1 vez por vez): energia dura a cena, o resto até o início do seu próximo turno. Ganha Sensor enquanto estiver no modo. Requer Vigor 14 e Kuchiyose 8 (Sapos/Cobras) ou Mokuton 8.',
    requisitos: { cla: 'Senjutsu', atributos: { vigor: 14 } },
    tecnicas: [
      tec(1, 'Entrar no Modo Eremita', 'completa', 0, 'Use no fim do 2º turno de concentração imóvel. Recebe 1 ponto de Chakra Senjutsu por nível do poder. Só recarrega quando todos os pontos forem gastos.', { modoEremita: true }),
      tec(1, 'Senjutsu: Força +4', 'livre', 0, '1 ponto de Chakra Senjutsu: Força +4 (+2 de dano corpo a corpo) até o início do seu próximo turno. Não acumula com Dano Base +2.', { senjutsu: true, fica: 'Senjutsu: Força +4', turnosFica: 1, danoBonus: 2, tira: 'Senjutsu: (Força|Dano)' }),
      tec(1, 'Senjutsu: Dano Base +2', 'livre', 0, '1 ponto de Chakra Senjutsu: +2 de dano base num ataque (inclui Energizar) até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Dano +2', turnosFica: 1, danoBonus: 2, tira: 'Senjutsu: (Força|Dano)' }),
      tec(1, 'Senjutsu: Precisão de Ataque +1', 'livre', 0, '1 ponto de Chakra Senjutsu: +1 nos testes de ataque até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Ataque +1', turnosFica: 1, bonusAtaque: 1 }),
      tec(1, 'Senjutsu: Precisão de Defesa +1', 'livre', 0, '1 ponto de Chakra Senjutsu: +1 nas defesas até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Defesa +1', turnosFica: 1, bonusDefesa: 1 }),
      tec(1, 'Senjutsu: Acelerado', 'livre', 0, '1 ponto de Chakra Senjutsu: fica acelerado até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Acelerado', turnosFica: 1, modo: 'acelerado' }),
      tec(1, 'Senjutsu: Dificuldade +1', 'livre', 0, '1 ponto de Chakra Senjutsu: +1 na dificuldade das suas técnicas até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Dificuldade +1', turnosFica: 1 }),
      tec(1, 'Senjutsu: Dureza de Corpo +1', 'livre', 0, '1 ponto de Chakra Senjutsu: +1 de Dureza de Corpo até o início do seu próximo turno.', { senjutsu: true, fica: 'Senjutsu: Dureza +1', turnosFica: 1, durezaBonus: 1 }),
      tec(1, 'Senjutsu: Chakra +20', 'livre', 0, '1 ponto de Chakra Senjutsu: recupera 20 de chakra (1 vez por cena).', { senjutsu: true, ganhoChakra: 20, umaPorCena: 'Senjutsu: Chakra +20 usado' }),
      tec(1, 'Senjutsu: Vitalidade +30', 'livre', 0, '1 ponto de Chakra Senjutsu: recupera 30 de Vitalidade (1 vez por cena; não com Ryōsei no Jutsu).', { senjutsu: true, ganhoVit: 30, umaPorCena: 'Senjutsu: Vitalidade +30 usado' }),
    ],
  },
  {
    id: 'kuchiyose', nome: 'Kuchiyose (Invocação)', tipo: 'restrito', pagina: 224,
    resumo: 'Contrato de sangue com uma espécie. Uma vez por cena (ação padrão, custo 2 × nível) invoca 1 criatura de NC até 2 × nível, ou 2 de NC até 2 × nível − 2. As fichas seguem as regras das págs. 225–229 e agem por Comandar Parceiro (pág. 269).',
    requisitos: { cla: 'Kuchiyose' },
    tecnicas: [
      tec(1, 'Kuchiyose no Jutsu', 'padrao', 'dobroNivel', 'Invoca a criatura do contrato ao seu lado (ou embaixo de você, se for montaria). Se ela for cancelada ou abatida, não pode invocar outra na mesma cena. Ela volta sozinha com Vitalidade 0 ou menos.', { kuchiyose: true, umaPorCena: 'Kuchiyose usado nesta cena' }),
    ],
  },
  {
    id: 'magen', nome: 'Magen (Ilusão Demoníaca)', tipo: 'restrito', pagina: 233,
    resumo: 'Genjutsus sem teste de precisão: o alvo testa Inteligência contra 9 + nível do poder + ½ Int (+3 contra capangas). Custo = nível do efeito; ação padrão; alcance 5 m + 1 m por Int. Compulsão dura até se libertar; Aflição, 2 turnos. Notar Genjutsu a partir do 2º turno (Dif −1, −1 por tentativa); Kai ou dano (≥ dobro do custo) cancela.',
    requisitos: { cla: 'Magen', atributos: { inteligencia: 6 }, aptidoes: ['Fascinar', 'Miragem', 'Ilusão Profunda'] },
    tecnicas: [
      tec(1, 'Êxtase', 'padrao', 1, '[Compulsão] Prende a mente do alvo numa ilusão: fica fascinado. Pode repetir na cena, mas o alvo tem 1 turno de imunidade depois de se libertar.', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['fascinado'] }),
      tec(2, 'Amedrontar', 'padrao', 2, '[Aflição] Mostra o pior pesadelo do alvo: fica assustado (Nv 5: amedrontado; Nv 8: aterrorizado).', { genjutsu: 'aflicao', alcance: 'curtoInt', ilusao: ['assustado'], porNivel: [[5, ['amedrontado']], [8, ['aterrorizado']]] }),
      tec(2, 'Confundir', 'padrao', 2, '[Compulsão] Alucinações que mudam a cada rodada: o alvo fica confuso.', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['confuso'] }),
      tec(2, 'Fadigar', 'padrao', 2, '[Aflição] Mal súbito ou falta de ar: o alvo fica fatigado (Nv 5: exausto). Não acumula até inconsciente.', { genjutsu: 'aflicao', alcance: 'curtoInt', ilusao: ['fatigado'], porNivel: [[5, ['exausto']]] }),
      tec(2, 'Segurar', 'padrao', 2, '[Compulsão] O alvo acredita estar sendo agarrado: fica agarrado (Nv 10: indefeso). Quem tem a aptidão Lutador é imune (até o Nv 6).', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['agarrado'], porNivel: [[10, ['indefeso']]], imuneApt: 'Lutador', imuneAte: 6 }),
      tec(3, 'Adormecer', 'padrao', 3, '[Compulsão] Sonolência: fatigado por 5 turnos (Nv 6: 4; Nv 9: 3) e cai inconsciente no fim deles, até o efeito acabar ou ser cancelado.', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['fatigado'], porNivelTurnos: [[1, 5], [6, 4], [9, 3]], adormecer: true }),
      tec(3, 'Anular Sentido', 'padrao', 3, '[Compulsão] Audição: −2 em Procurar/Prontidão auditivos (Nv 6: surdo). Olfato: sem cheiros. Visão: ataca como se o alvo tivesse camuflagem parcial (Nv 6: total; Nv 9: cego).', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: [], visao: true }),
      tec(3, 'Desequilibrar', 'padrao', 3, '[Aflição] Ventos, tremores ou doença: o alvo fica caído e não levanta até o fim do próximo turno dele (Nv 6: dois turnos).', { genjutsu: 'aflicao', alcance: 'curtoInt', ilusao: ['caido'], turnosAplica: 1, porNivelTurnos: [[6, 2]] }),
      tec(3, 'Desorientar', 'padrao', 3, '[Compulsão] O alvo perde o senso de direção: falha automática em Rastrear e anda em círculos. Sensores ganham +2 para notar. (Nv 6: vários alvos sem penalidade; Nv 9: pode ser Aflição.)', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: [] }),
      tec(3, 'Falsa Velocidade', 'padrao', 2, '[Fantasma] Parece mais rápido: use como a manobra Fintar (ação padrão, ou movimento com Ponto Cego), 2 chakra por uso. O alvo testa Notar Genjutsu; se falhar, fica fintado contra seu ataque até o fim do seu turno.', { genjutsu: 'fantasma', alcance: 'curtoInt', ilusao: ['fintado'], turnosAplica: 1, notar: true }),
      tec(3, 'Petrificar', 'padrao', 3, '[Compulsão] O corpo deixa de responder: lento e, a partir do 2º turno, impedido (Nv 7: impedido na hora; Nv 10: paralisado/indefeso).', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['lento'], porNivel: [[7, ['impedido']], [10, ['indefeso']]] }),
      tec(4, 'Aliviamento', 'padrao', 4, '[Aflição] O alvo vê o que mais deseja: fica desprevenido pela duração (2 turnos; Nv 7: 3 turnos; Nv 10: não pode ser resistido). Ao ser atacado percebe a ilusão, mas a penalidade fica.', { genjutsu: 'aflicao', alcance: 'curtoInt', ilusao: ['desprevenido'], porNivelTurnos: [[7, 3]], semResistenciaNv: 10 }),
      tec(4, 'Falsa Posição', 'padrao', 4, '[Fantasma] Os inimigos acham que você está em outro lugar: camuflagem parcial pelo resto da cena (Nv 7: total). Quem o acerta mesmo assim testa Notar Genjutsu; se passar, o efeito não funciona mais contra ele. Sustentado.', { fica: 'Magen: Falsa Posição', camuflagemNv: [[1, 2], [7, 4]] }),
      tec(4, 'Paralisar', 'padrao', 4, '[Compulsão] Braços e pernas presos: o alvo fica indefeso (só pode falar). Um golpe de misericórdia quebra a ilusão (Nv 9: não quebra mais).', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['indefeso'] }),
      tec(5, 'Adoecer', 'padrao', 5, '[Compulsão] Dor de cabeça, gripe, ânsia: o alvo fica tonto (Nv 8: e fatigado; Nv 10: e exausto).', { genjutsu: 'compulsao', alcance: 'curtoInt', ilusao: ['tonto'], porNivel: [[8, ['tonto', 'fatigado']], [10, ['tonto', 'exausto']]] }),
      tec(5, 'Atordoar', 'padrao', 5, '[Aflição] Confunde os sentidos: o alvo fica atordoado até o fim do próximo turno dele (Nv 8: e desprevenido). Pode repetir na cena.', { genjutsu: 'aflicao', alcance: 'curtoInt', ilusao: ['atordoado'], turnosAplica: 1, porNivel: [[8, ['atordoado', 'desprevenido']]] }),
    ],
  },

  {
    id: 'hachimon_tonkou', nome: 'Hachimon Tonkou (Oito Portões)', tipo: 'restrito', pagina: 202,
    resumo: 'Abre os portões: bônus de Força (dobrado no dano), acelerado e resistência a Genjutsu, pagando Vitalidade todo turno. Portão 1 dura 2 turnos; os outros, 5. Depois: fatigado por 4 turnos (−1 por nível acima do portão). 3ª vez na cena: exausto por um dia.',
    requisitos: { cla: 'Hachimon', atributos: { vigor: 6 } },
    tecnicas: [
      tec(1, 'Kaimon (Portão da Abertura)', 'parcial', 0, 'Força +1; acelerado (+2 iniciativa, Agilidade dobrada no deslocamento, finta acelerada). Dura 2 turnos. Libera o Omote Renge. Dano por turno: 3 (já com a cura do 2º portão).', { fica: 'Hachimon: Kaimon', turnosFica: 2, drenoHp: 3, danoBonus: 1, tira: 'Hachimon', modo: 'acelerado' }),
      tec(2, 'Kyūmon (Portão da Cura)', 'parcial', 0, 'Força +2; acelerado; anula fatigado e exausto enquanto aberto. Dano por turno: 2 (já com a cura do 2º portão).', { fica: 'Hachimon: Kyūmon', turnosFica: 5, drenoHp: 2, danoBonus: 2, tira: 'Hachimon', modo: 'acelerado' }),
      tec(3, 'Seimon (Portão da Vida)', 'parcial', 0, 'Força +3; acelerado; Dif −1 contra Genjutsus. Libera o Ura Renge. Dano por turno: 3 (já com a cura do 2º portão).', { fica: 'Hachimon: Seimon', resGenjutsu: 1, turnosFica: 5, drenoHp: 3, danoBonus: 3, tira: 'Hachimon', modo: 'acelerado' }),
      tec(4, 'Shōmon (Portão da Dor)', 'parcial', 0, 'Força +4, Agilidade +1; acelerado; Dif −1 contra Genjutsus. Dano por turno: 4 (já com a cura do 2º portão).', { fica: 'Hachimon: Shōmon', resGenjutsu: 1, turnosFica: 5, drenoHp: 4, danoBonus: 4, tira: 'Hachimon', modo: 'acelerado' }),
      tec(5, 'Tomon (Portão do Limite)', 'parcial', 0, 'Força +5, Agilidade +2; acelerado; Dif −2 contra Genjutsus. Dano por turno: 5 (já com a cura do 2º portão).', { fica: 'Hachimon: Tomon', resGenjutsu: 2, turnosFica: 5, drenoHp: 5, danoBonus: 5, tira: 'Hachimon', modo: 'acelerado' }),
      tec(6, 'Keimon (Portão da Visão)', 'parcial', 0, 'Força +6, Agilidade +3; acelerado; Dif −2 contra Genjutsus. Libera o Asa Kujaku. Dano por turno: 6 (já com a cura do 2º portão).', { fica: 'Hachimon: Keimon', resGenjutsu: 2, turnosFica: 5, drenoHp: 6, danoBonus: 6, tira: 'Hachimon', modo: 'acelerado' }),
      tec(7, 'Kyōmon (Portão do Milagre)', 'parcial', 0, 'Força +1 por nível, Agilidade +3; super acelerado (+4 iniciativa, finta super acelerada); Dif −3 contra Genjutsus. Dano por turno: 1 por nível. Libera o Hirudora.', { fica: 'Hachimon: Kyōmon', resGenjutsu: 3, turnosFica: 5, drenoHp: 'nivel', danoBonus: 'nivel', tira: 'Hachimon', modo: 'superAcelerado' }),
      tec(8, 'Shimon (Portão da Morte)', 'movimento', 0, 'Força +2 por nível, Agilidade +6; super acelerado; Dif −8 contra Genjutsus; ataque com acerto automático. Ao fechar: exausto e paralisado por 3 turnos e depois MORRE.', { fica: 'Hachimon: Shimon', resGenjutsu: 8, turnosFica: 5, danoBonus: 'dobroNivel', tira: 'Hachimon', modo: 'superAcelerado' }),
      tec(1, 'Fechar os portões', 'livre', 0, 'Fecha todos os portões e fica fatigado (4 turnos, −1 por nível do poder acima do portão aberto; mínimo 1). Espere 1 turno para abrir de novo.', { tira: 'Hachimon', fadiga: true }),
    ],
  },
];

/** Técnicas de Mokuton (Senju, págs. 178–180) — o poder já existe no catálogo. */
export const TECNICAS_MOKUTON = [
  tec(1, 'Aikagi (Chave Mestra)', 'padrao', 1, 'Cria uma chave de madeira que abre qualquer fechadura.'),
  tec(1, 'Moku Bunshin (clone de madeira)', 'padrao', 1, 'Clone resistente (1/5 da sua Vit), fala por telepatia e se funde com árvores (Imergir Nv 2 grátis). 1 de chakra por clone. Pré-req.: Clone.'),
  tec(2, 'Daijurin no Jutsu', 'padrao', 'nivel', 'Estacas de madeira em linha até o alvo, com as regras do efeito Raio.'),
  tec(2, 'Soushinki (semente transmissora)', 'parcial', 2, 'O clone vira sementes rastreadoras (regras da aptidão Sensor só para quem carrega a semente). Pré-req.: Moku Bunshin.', { alcance: 'toque' }),
  tec(3, 'Mokujōheki (Parede de Madeira)', 'movimento', 'nivel', 'Barreira de madeira na defesa (teste de LM), metade do tamanho comum, regras do efeito Barreira.'),
  tec(6, 'Shichūrō no Jutsu', 'padrao', 'nivel', 'Prisão de quatro pilares (regras do efeito Barreira).'),
  tec(6, 'Nitten Suishu', 'padrao', 'nivel', 'Ação preparada: sela o chakra bijuu de um jinchuuriki descontrolado (regras do Selar Chakra).'),
  tec(7, 'Mokujin no Jutsu (Golem)', 'padrao', 'nivel', 'Golem de madeira Imenso (metade da Vit; regras do efeito Golem); você controla por concentração.', { fica: 'Mokujin (golem)' }),
];

const NORMAL = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const temAptidaoNome = (lista, nome) => lista.some((n) => NORMAL(n) === NORMAL(nome));
