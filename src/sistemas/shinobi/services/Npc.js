// =====================================================================
// Gerador de PdMs (Personagens do Mestre) — Livro Básico, págs. 30 e 280–281
//
// Capanga: sem ficha. Precisão de ataque e defesa ≈ 3 + NC, dano ≈ NC − 3
//          (entre o Limite de Poder e o NC) e somente 1 de Vitalidade.
// Inimigo: define-se o NC e o estilo de luta; o máximo de pontos vai para os
//          atributos do estilo. Perícias usam o próprio nível do atributo.
// =====================================================================

export const ATTRIBUTE_KEYS = ['forca', 'destreza', 'agilidade', 'percepcao', 'inteligencia', 'vigor', 'espirito'];

export const ATTRIBUTE_LABELS = {
  forca: 'Força',
  destreza: 'Destreza',
  agilidade: 'Agilidade',
  percepcao: 'Percepção',
  inteligencia: 'Inteligência',
  vigor: 'Vigor',
  espirito: 'Espírito',
};

/** Estilos de luta e os atributos de foco de cada um (pág. 281). */
export const NPC_STYLES = {
  taijutsu: { label: 'Taijutsu', focus: ['forca', 'agilidade', 'vigor'] },
  ninjutsu: { label: 'Ninjutsu', focus: ['destreza', 'agilidade', 'espirito'] },
  genjutsu: { label: 'Genjutsu', focus: ['inteligencia', 'agilidade', 'espirito'] },
};

// ---------- Tabela de Evolução (pág. 30) ----------

/** Pontos de atributo do NC: 12 no NC 4 e +6 por nível. */
export const attributePoints = (nc) => 6 * (Math.max(4, nc) - 2);

/** Valor mínimo de atributo: 0 no NC 4, +1 a cada 2 níveis. */
export const attributeMinimum = (nc) => Math.max(0, Math.floor((Math.max(4, nc) - 3) / 2));

/** O Nível da Campanha é o valor máximo de um atributo (pág. 249). */
export const attributeLimit = (nc) => Math.max(4, nc);

export const vitalityFor = (vigor, nc) => 10 + 3 * vigor + 5 * nc;
export const chakraFor = (espirito) => 10 + 3 * espirito;

/**
 * Distribui os pontos de um inimigo: todos no mínimo, depois o máximo possível
 * nos atributos de foco do estilo (em rodízio), e o que sobrar nos demais.
 */
export function distributeAttributes(nc, style, usePerception = false) {
  let focus = [...(NPC_STYLES[style]?.focus || NPC_STYLES.taijutsu.focus)];
  // Para Ninjutsu e Genjutsu, o livro permite focar Percepção no lugar de Agilidade.
  if (usePerception && style !== 'taijutsu') focus = focus.map((key) => (key === 'agilidade' ? 'percepcao' : key));
  return distributeWithFocus(nc, focus);
}

/** Todos no mínimo, o máximo possível nos atributos de foco, o resto nos demais. */
export function distributeWithFocus(nc, focus) {
  const points = attributePoints(nc);
  const min = attributeMinimum(nc);
  const limit = attributeLimit(nc);

  const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, min]));
  let remaining = points - min * ATTRIBUTE_KEYS.length;

  const fill = (keys) => {
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (const key of keys) {
        if (remaining > 0 && attributes[key] < limit) {
          attributes[key] += 1;
          remaining -= 1;
          progress = true;
        }
      }
    }
  };

  fill(focus);
  fill(ATTRIBUTE_KEYS.filter((key) => !focus.includes(key)));
  return attributes;
}

// ---------- Montagem da linha `characters` ----------

/**
 * Gera os dados de um modelo de NPC pronto para salvar em `characters`.
 * input: { type: 'capanga' | 'inimigo', name, nc, style, usePerception, avatarUrl }
 */
export function buildNpc({ type, name, nc, style = 'taijutsu', usePerception = false, avatarUrl = '', species = 'caes', size = 'medio' }) {
  const level = Math.max(1, Number(nc) || 4);

  if (type === 'capanga') {
    const precision = 3 + level;
    const damage = Math.max(Math.floor(level / 2), level - 3);
    return {
      name: name || 'Capanga',
      rank: 'Capanga',
      level,
      hp_max: 1,
      hp_current: 1,
      chakra_max: 0,
      chakra_current: 0,
      avatar_url: avatarUrl || null,
      attributes: {
        nc: level,
        npc: {
          template: true,
          type: 'capanga',
          precisao_ataque: precision,
          precisao_defesa: precision,
          dano: damage,
          iniciativa: level, // não definido no livro: ajuste à vontade
          notas: 'Falha automaticamente em testes de atributo e perícia. Sem crítico nem ataque oportuno contra não-capangas.',
        },
      },
    };
  }

  if (type === 'criatura') return buildCreature({ name, nc: level, species, size, avatarUrl });

  const attributes = distributeAttributes(level, style, usePerception);
  const hp = vitalityFor(attributes.vigor, level);
  const chakra = chakraFor(attributes.espirito);

  return {
    name: name || 'Inimigo',
    rank: `Inimigo · ${NPC_STYLES[style]?.label || 'Taijutsu'}`,
    level,
    hp_max: hp,
    hp_current: hp,
    chakra_max: chakra,
    chakra_current: chakra,
    avatar_url: avatarUrl || null,
    attributes: {
      nc: level,
      attributes,
      // Perícias de PdM usam o nível do atributo (pág. 281): Prontidão = Percepção.
      skill_totals: { prontidao: attributes.percepcao },
      npc: {
        template: true,
        type: 'inimigo',
        style,
        iniciativa: attributes.agilidade + attributes.percepcao,
        notas: '',
      },
    },
  };
}

export const isNpcTemplate = (character) => Boolean(character?.is_npc && character?.attributes?.npc?.template);
export const isNpcInstance = (character) => Boolean(character?.is_npc && character?.attributes?.npc && !character.attributes.npc.template);

// =====================================================================
// Criaturas — poder Kuchiyose, Livro Básico págs. 225–229 e 271
//  - Atributos: pontos do NC (como personagem), de preferência nos principais da espécie
//  - Tamanho ajusta Força e Vigor (pode passar do limite do NC)
//  - Vitalidade calculada normalmente e reduzida pela metade
//  - Dano corpo-a-corpo = Força − 3 (mínimo 3); +1 com arma marcial
//  - Perícias: usam o nível do atributo, só as da lista da espécie
//  - Pontos de Poder: 1 a cada 2 NC completos; um único poder da lista
// =====================================================================

/** Tabela de Tamanho (págs. 227 e 271) + altura sugerida no mapa (células). */
export const CREATURE_SIZES = {
  miudo: { label: 'Miúdo', mod: -3, minNc: 14, heightCells: 0.7 },
  pequeno: { label: 'Pequeno', mod: -1, maxNc: 8, heightCells: 1.1 },
  medio: { label: 'Médio', mod: 0, heightCells: 1.8 },
  grande: { label: 'Grande', mod: 1, minNc: 12, heightCells: 3 },
  enorme: { label: 'Enorme', mod: 3, minNc: 14, heightCells: 4.5 },
  imenso: { label: 'Imenso', mod: 5, minNc: 16, heightCells: 7 },
};
const SIZE_ORDER = ['miudo', 'pequeno', 'medio', 'grande', 'enorme', 'imenso'];

export const CREATURE_SPECIES = {
  aguias: {
    label: 'Águias',
    focus: ['agilidade', 'percepcao'],
    pericias: ['Acrobacia', 'Atletismo', 'Voo', 'Prontidão', 'Rastrear'],
    poderes: [],
    aptidoes: 'Ataque em Movimento, Especialista, Reflexos, Intuição, Velocista, Perito, Perícia Inata, Ponto Cego, Ataque Atordoante, Ataque Poderoso, Derrubar Agressivo (não requer Lutador; sem penalidade de precisão da manobra)',
    tecnicas: 'Bater de Asas (ação padrão: ventania em área de 2m de diâmetro por nível de Força; sem dano, dissipa gases)',
    ataques: 'Garras (corte) e Bico (perfuração)',
    notas: 'Não falam a língua humana.',
  },
  caes: {
    label: 'Cães (Ninken)',
    focus: ['agilidade', 'percepcao'],
    maxSize: 'medio',
    pericias: ['Acrobacia', 'Atletismo', 'Escapar', 'Furtividade', 'Procurar', 'Prontidão', 'Rastrear'],
    poderes: [],
    aptidoes: 'Acuidade, Ataque em Movimento, Especialista, Intuição, Reflexos, Velocista, Perito, Perícia Inata, Lutador, Ponto Cego, Ataque Atordoante, Ataque Poderoso, Derrubar Agressivo, De Pé, Desarme Agressivo, Rasteira, Sensor (via olfato; requer Per 1)',
    tecnicas: 'Tadayou; Kuchiyose: Doton: Tsuiga no Jutsu',
    ataques: 'Mordida (perfuração)',
    notas: 'Exclusivos do clã Hatake. Invocação numerosa: até 8 cães, mas então são capangas com 1 de Vitalidade e falham em testes de Habilidade de Combate.',
  },
  cobras: {
    label: 'Cobras (Kyodaija)',
    focus: ['forca', 'agilidade', 'percepcao'],
    pericias: ['Acrobacia', 'Atletismo', 'Furtividade', 'Prontidão', 'Rastrear'],
    poderes: [],
    aptidoes: 'Ataque em Movimento, Especialista, Reflexos, Intuição, Velocista, Perito, Perícia Inata, Lutador, Ponto Cego, Arremessar, Ataque Atordoante, Ataque Poderoso, Derrubar Agressivo, Sensor (via olfato; requer Per 1)',
    tecnicas: 'Kawarimi no Jutsu, Kinobori, Imergir (Doton), Amedrontar Nv 2 (Magen; Dif 6 + Int; só contra criaturas menores)',
    ataques: 'Mordida (perfuração), Batida com Cauda (esmagamento)',
    notas: 'Temperamentais; podem exigir sacrifícios como pagamento. Usam a troca de pele como um Kawarimi.',
  },
  lesmas: {
    label: 'Lesmas',
    focus: ['inteligencia', 'espirito', 'vigor'],
    pericias: ['Ciências Naturais', 'Concentração', 'Escapar', 'Furtividade', 'Medicina', 'Prontidão'],
    poderes: ['Iryou Ninjutsu'],
    aptidoes: 'Acuidade, Ataque em Movimento, Intuição, Reflexos, Ninja Médico, Perito, Perícia Inata, Lutar às Cegas, Maestria, Resistência Maior (Vigor), Duro de Matar',
    tecnicas: 'Tadayou; Kinobori; Katsuyu Daibunretsu; Byakugou no In; Ácido (Sopro Destrutivo Nv 4; dano base = Espírito; só tamanho médio ou maior)',
    ataques: 'Batida de Corpo (esmagamento)',
    notas: 'Invocação unitária: só uma lesma por cena. Curam junto com o invocador (somam os efeitos).',
  },
  macacos: {
    label: 'Macacos',
    focus: ['forca', 'agilidade', 'vigor'],
    maxSize: 'grande',
    pericias: ['Acrobacia', 'Atletismo', 'Disfarces', 'Prontidão'],
    poderes: [],
    aptidoes: 'Ataque em Movimento, Especialista, Reflexos, Velocista, Perito, Perícia Inata, Lutador, Lutar às Cegas, Ponto Cego, Arremessar, Ataque Atordoante, Ataque Múltiplo, Ataque Poderoso, Derrubar Agressivo, De Pé, Desarme Agressivo, Soco Agarrado, Chute Inverso, Voadora',
    tecnicas: 'Henge no Jutsu; Henge: Kongōnyoi (Bastão Adamantino; NC mínimo 12 e tamanho médio)',
    ataques: 'Socos e Chutes',
    notas: 'Exclusivos do clã Sarutobi.',
  },
  sapos: {
    label: 'Sapos',
    focus: ['agilidade', 'espirito', 'forca'],
    pericias: ['Acrobacia', 'Atletismo', 'Escapar', 'Prontidão'],
    poderes: ['Fuuton', 'Suiton', 'Katon'],
    aptidoes: 'Ataque em Movimento, Especialista, Guerreiro, Intuição, Reflexos, Velocista, Maestria, Perito, Perícia Inata, Usar Arma',
    tecnicas: 'Tadayou; Óleo do Sapo (com Suiton, ganha Inflamável Nv 5 grátis; só tamanho médio ou maior)',
    ataques: 'Clava, Lança e Espadas de qualquer tipo (arma marcial: +1 de dano)',
    notas: 'Podem usar armas de corte como espadachins.',
  },

  // ---------- Livro de Hijutsus (vol. 1) ----------
  tubaroes: {
    label: 'Tubarões',
    livro: 'Hijutsus vol. 1, pág. 9',
    focus: ['forca', 'agilidade', 'percepcao'],
    maxSize: 'grande',
    inteligenciaZero: true,
    pericias: ['Atletismo (Natação)', 'Prontidão', 'Rastrear'],
    poderes: [],
    aptidoes: 'Ataque em Movimento, Especialista, Reflexos, Velocista, Perito, Perícia Inata, Ataque Atordoante, Ataque Poderoso, Sensor (duração contínua)',
    tecnicas: 'Ataque do Cardume (com 8 tubarões: um teste de CC; o alvo não pode Evadir e fica desprevenido se usar Esquiva ou Antecipar; sem dano)',
    ataques: 'Mordida (perfuração), Batida com Corpo (esmagamento)',
    notas: 'Inteligência sempre zero (falham em testes de Inteligência e não falam). Invocação numerosa: até 8, mas então são capangas e falham em testes de Habilidade de Combate.',
  },

  // ---------- Livro de Hijutsus (vol. 2) ----------
  baku: {
    label: 'Baku',
    livro: 'Hijutsus vol. 2, pág. 8',
    focus: ['forca', 'percepcao', 'inteligencia', 'espirito'],
    pericias: ['Atletismo', 'Concentração', 'Prontidão', 'Rastrear'],
    poderes: [],
    aptidoes: 'Ataque em Movimento, Crítico Aprimorado, Especialista, Intuição, Lutador, Oportunista, Trespassar, Usar Armaduras Pesadas, Agarrar Agressivo, Arremessar, Ataque Atordoante, Ataque Giratório, Ataque Múltiplo, Ataque Poderoso, Contragolpe, Derrubar Agressivo, Instância de Falange, Potencializar [META], Burro de Carga, Duro de Matar, Perícia Inata, Perito, Resistência Maior',
    tecnicas: 'Ver Hijutsus vol. 2, pág. 9',
    ataques: 'Corpo a corpo (ver o livro)',
    notas: 'Invocação especial do clã Shimura (anta-elefante). Invocação unitária: só um Baku por cena.',
  },
  doninhas: {
    label: 'Doninhas',
    livro: 'Hijutsus vol. 2, pág. 81',
    focus: ['agilidade', 'espirito', 'destreza'],
    maxSize: 'medio',
    pericias: ['Acrobacia', 'Atletismo', 'Furtividade', 'Prontidão'],
    poderes: ['Fuuton'],
    aptidoes: 'Acuidade, Ataque em Movimento, Combate Defensivo, Crítico Aprimorado, De Pé, Especialista, Guerreiro, Maestria: Fuuton, Mobilidade, Oportunista, Ponto Cego, Reflexos, Retirada Rápida, Rolamento, Trespassar, Usar Arma (apenas Foice), Velocista, Domínio do Vento, Potencializar, Técnica Acelerada, Técnica Eficiente, Técnica Elevada, Técnica Poderosa, Perito, Perícia Inata',
    tecnicas: 'Kirikiri Mai (Dança Decapitadora: invoca a doninha junto com uma técnica Fuuton; NC 12+)',
    ataques: 'Foices (corte)',
    notas: 'Limitadas até o tamanho Médio.',
  },
  mariscos: {
    label: 'Mariscos',
    livro: 'Hijutsus vol. 2, pág. 82',
    focus: ['inteligencia', 'espirito', 'vigor'],
    pericias: ['Furtividade', 'Prontidão', 'Procurar'],
    poderes: [],
    aptidoes: 'Combate Defensivo, Especialista, Intuição, Lutar às Cegas, Trespassar, Ataque Atordoante, Ataque Giratório, Ataque Poderoso, Contragolpe, Ilusão Profunda, Potencializar [Meta], Técnica Acelerada, Duro de Matar, Perícia Inata, Perito, Resistência Maior (Vigor), Fascinar, Miragem, Sensor',
    tecnicas: 'Magen: Kijō no Rōkaku (névoa ilusória de vapor; NC 10+)',
    ataques: 'Batida de Corpo (esmagamento)',
    notas: 'Da Vila da Névoa (clã Hozuki). Invocação unitária: só um marisco por cena.',
  },
  salamandras: {
    label: 'Salamandras',
    livro: 'Hijutsus vol. 2, pág. 83',
    focus: ['forca', 'agilidade', 'inteligencia', 'vigor'],
    maxSize: 'enorme',
    pericias: ['Acrobacia', 'Atletismo', 'Furtividade', 'Prontidão'],
    poderes: [],
    aptidoes: 'Acuidade, Ataque em Movimento, Combate Defensivo, Crítico Aprimorado, De Pé, Especialista, Lutar às Cegas, Mobilidade, Oportunista, Ponto Cego, Reflexos, Retirada Rápida, Rolamento, Trespassar, Velocista, Perícia Inata, Perito, Resistência Maior (Vigor)',
    tecnicas: 'Dokugiri (Névoa Venenosa); Imergir Nv 2 (Doton); Engolimento (NC 12+)',
    ataques: 'Batida com cauda (esmagamento)',
    notas: 'Invocação unitária: só uma salamandra por cena. Limitada até o tamanho Enorme.',
  },
  tartarugas: {
    label: 'Tartarugas',
    livro: 'Hijutsus vol. 2, pág. 85',
    focus: ['forca', 'percepcao', 'inteligencia', 'vigor'],
    pericias: ['Atletismo (somente Nadar)', 'Ciências Naturais', 'Cultura', 'Ocultismo', 'Procurar'],
    poderes: [],
    aptidoes: 'Crítico Aprimorado, Combate Defensivo, Especialista, Intuição, Lutador, Trespassar, Ataque Atordoante, Ataque Giratório, Ataque Poderoso, Bloquear Arma, Contragolpe, Derrubar Agressivo, Desarme Agressivo, Duro de Matar, Perito, Perícia Inata, Resistência Maior',
    tecnicas: 'Pele de Pedra (Doton, dureza igual ao Espírito); Tadayou; Kinobori',
    ataques: 'Batida de Casco (esmagamento), Mordida (perfuração)',
    notas: 'Casco de Proteção: Dureza 1 (2 com NC 12+, 3 com NC 16+; não acumula com Pele de Pedra).',
  },
};

/** Tamanhos permitidos para a espécie neste NC. */
export function allowedSizes(speciesKey, nc) {
  const species = CREATURE_SPECIES[speciesKey];
  const maxIndex = species?.maxSize ? SIZE_ORDER.indexOf(species.maxSize) : SIZE_ORDER.length - 1;
  return SIZE_ORDER.filter((key, index) => {
    const size = CREATURE_SIZES[key];
    return index <= maxIndex && (!size.minNc || nc >= size.minNc) && (!size.maxNc || nc <= size.maxNc);
  });
}

export function buildCreature({ name, nc, species: speciesKey = 'caes', size: sizeKey = 'medio', avatarUrl = '' }) {
  const level = Math.max(4, Number(nc) || 4);
  const species = CREATURE_SPECIES[speciesKey] || CREATURE_SPECIES.caes;
  const sizes = allowedSizes(speciesKey, level);
  const finalSize = sizes.includes(sizeKey) ? sizeKey : (sizes.includes('medio') ? 'medio' : sizes[sizes.length - 1]);
  const size = CREATURE_SIZES[finalSize];

  const attributes = distributeWithFocus(level, species.focus);
  if (species.inteligenciaZero) attributes.inteligencia = 0;
  // Ajuste de tamanho em Força e Vigor (aplicado depois; pode passar do limite).
  attributes.forca = Math.max(0, attributes.forca + size.mod);
  attributes.vigor = Math.max(0, attributes.vigor + size.mod);

  const hp = Math.floor(vitalityFor(attributes.vigor, level) / 2); // Vitalidade pela metade
  const chakra = chakraFor(attributes.espirito);
  const damage = Math.max(3, attributes.forca - 3);

  return {
    name: name || species.label,
    rank: `Criatura · ${species.label} · ${size.label}`,
    level,
    hp_max: hp,
    hp_current: hp,
    chakra_max: chakra,
    chakra_current: chakra,
    avatar_url: avatarUrl || null,
    attributes: {
      nc: level,
      attributes,
      skill_totals: { prontidao: attributes.percepcao },
      npc: {
        template: true,
        type: 'criatura',
        species: speciesKey,
        size: finalSize,
        dano: damage,
        pontos_poder: Math.floor(level / 2),
        iniciativa: attributes.agilidade + attributes.percepcao,
        // altura sugerida quando o Mestre colocar uma imagem de corpo inteiro
        figure_height: size.heightCells,
        notas: [
          `Perícias (usam o atributo): ${species.pericias.join(', ')}.`,
          `Poder: ${species.poderes.length ? `um entre ${species.poderes.join(', ')}` : 'nenhum'} (${Math.floor(level / 2)} pontos de poder).`,
          `Aptidões possíveis (3 gratuitas): ${species.aptidoes}.`,
          `Técnicas: ${species.tecnicas}.`,
          `Ataques: ${species.ataques}. Dano corpo-a-corpo ${damage}.`,
          species.notas,
        ].join('\n'),
      },
    },
  };
}
