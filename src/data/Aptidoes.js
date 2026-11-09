// =====================================================================
// Catálogo de Aptidões — Naruto "Shinobi no Sho", Livro Básico 4.1b
// "Lista Resumida de Aptidões" (págs. 58–60). Conteúdo sob licença
// CC BY-NC-SA 2.5 / Open Game License — crédito: Diego "Fesant" Silva / Projeto D8.
//
// 1ª versão: só as APTIDÕES COMUNS. Pré-requisitos de cada aptidão e as
// aptidões restritas de clã/hijutsu entram nas próximas etapas.
// =====================================================================
import { APTIDOES_CLAS } from './Clas.js';

/** Categorias e a página onde começam as descrições completas. */
export const CATEGORIAS_APTIDAO = {
  combate: { nome: 'Combate', pagina: 61 },
  manobra: { nome: 'Manobra', pagina: 67 },
  tecnicas: { nome: 'Técnicas', pagina: 72 },
  gerais: { nome: 'Gerais', pagina: 75 },
  shinobi: { nome: 'Shinobi', pagina: 76 },
  cla: { nome: 'Clã / Hijutsu (restritas)', pagina: 142 },
};

/**
 * gratuita:    pode ser escolhida como uma das 3 aptidões gratuitas (pág. 56)
 * complemento: aptidão GENÉRICA (pág. 57) — escolhe-se uma categoria, e ela
 *              pode ser comprada de novo para categorias diferentes.
 *              'pericia' | 'atributo' | 'texto'
 * apenasNpc:   a própria descrição fala em PdM (personagem do mestre)
 */
const a = (nome, categoria, gratuita, resumo, extra = {}) => ({
  id: slug(nome),
  nome,
  categoria,
  gratuita,
  resumo,
  ...extra,
});

function slug(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const APTIDOES_COMUNS = [
  // ----- Combate -----
  a('Ambidestria', 'combate', false, 'Ataque usando duas armas leves'),
  a('Atirador', 'combate', false, 'Aumente seu dano em ataques com projéteis'),
  a('Bloqueio Ambidestro', 'combate', false, 'Melhore seu bloqueio ao usar ambidestria'),
  a('Crítico Aprimorado', 'combate', false, 'Aumente a chance de acerto crítico de seus ataques armados ou desarmados'),
  a('Dano Extra', 'combate', false, 'Aumente o dano de seus ataques que tenham dano de arma'),
  a('Guerreiro', 'combate', false, 'Realize manobras especiais usando armas pesadas ou longas'),
  a('Mestre dos Selos', 'combate', false, 'Realize selos de mão de forma rápida ou com uma única mão'),
  a('Mira Apurada', 'combate', false, 'Aumente sua precisão com armas de disparo'),
  a('Ponto Cego', 'combate', false, 'Finte com uma ação de movimento'),
  a('Retirada Rápida', 'combate', false, 'Recue rapidamente do combate corpo-a-corpo sem sofrer ataque oportuno'),
  a('Tiro Longo', 'combate', false, 'Dobre o alcance de armas de disparo'),
  a('Tiro Preciso', 'combate', false, 'Seus ataques com armas de disparo ignoram cobertura e camuflagem parciais'),
  a('Usar Armaduras Pesadas', 'combate', false, 'Você é capaz de usar armaduras pesadas'),
  a('Acuidade', 'combate', true, 'Use Combate Corporal com o atributo Destreza'),
  a('Ataque em Movimento', 'combate', true, 'Mova-se antes e depois de atacar'),
  a('Combate Defensivo', 'combate', true, 'Reduza sua precisão corpo-a-corpo para melhorar a esquiva'),
  a('De Pé', 'combate', true, 'Levante-se como uma reação ou ação livre'),
  a('Diligente', 'combate', true, 'Aumente e repita testes de Iniciativa'),
  a('Especialista', 'combate', true, 'Aumente sua precisão em combate desarmado ou armado', { complemento: 'texto', dica: 'Categoria de arma ou desarmado' }),
  a('Intuição', 'combate', true, 'Aumente sua precisão em manobras de previsão (Ler Movimento)'),
  a('Lutador', 'combate', true, 'Realize manobras especiais desarmadas sem penalidade de precisão'),
  a('Lutar às Cegas', 'combate', true, 'Melhore seu combate sob escuridão e outras camuflagens'),
  a('Maestria', 'combate', true, 'Aumente sua precisão no uso de técnicas'),
  a('Mobilidade', 'combate', true, 'Melhore sua esquiva contra ataques oportunos'),
  a('Oportunista', 'combate', true, 'Realize mais ataques oportunos na mesma rodada'),
  a('Punho de Ferro', 'combate', true, 'Aumente o dano de arma de seus ataques desarmados'),
  a('Reflexos', 'combate', true, 'Aumente a precisão de sua Esquiva'),
  a('Rolamento', 'combate', true, 'Aumente a redução do dano de queda dos testes de Acrobacia ou Atletismo'),
  a('Saque Rápido', 'combate', true, 'Saque e guarde armas com somente uma ação livre'),
  a('Trespassar', 'combate', true, 'Receba um ataque corporal extra quando derrotar um inimigo'),
  a('Usar Arma', 'combate', true, 'Você sabe usar a arma escolhida, sem penalidades', { complemento: 'texto', dica: 'Arma' }),
  a('Velocista', 'combate', true, 'Aumente a distância máxima de seu deslocamento'),

  // ----- Manobra -----
  a('Arremessar', 'manobra', false, 'Empurre para longe inimigos derrubados'),
  a('Ataque Atordoante', 'manobra', false, 'Faça um ataque que atordoa o inimigo'),
  a('Ataque Múltiplo', 'manobra', false, 'Divida seu ataque em até três golpes'),
  a('Ataque Progressivo', 'manobra', false, 'Aumente a quantidade de seu ataque múltiplo para causar mais dano'),
  a('Chute Duplo', 'manobra', false, 'Faça dois chutes rápidos e precisos'),
  a('Chute Giratório', 'manobra', false, 'Faça um chute que acerta a todos ao seu redor e ainda causa mais dano'),
  a('Chute Inverso', 'manobra', false, 'Faça um chute invertido, de difícil defesa'),
  a('Contragolpe', 'manobra', false, 'Faça um ataque oportuno quando bloquear um inimigo'),
  a('Golpe Atemi', 'manobra', false, 'Mire e ataque um ponto vital do inimigo, causando mais dano'),
  a('Golpe Caratê', 'manobra', false, 'Faça um golpe forte que ignora durezas'),
  a('Seguir Sombra', 'manobra', false, 'Mova-se até um inimigo arremessado para atacá-lo novamente'),
  a('Soco em Gancho', 'manobra', false, 'Finalize uma sequência de golpes com um soco em gancho forte e preciso'),
  a('Apanhar Objetos', 'manobra', true, 'Agarre projéteis arremessados contra você e lance-os de volta contra o inimigo'),
  a('Ataque Giratório', 'manobra', true, 'Faça um ataque que acerta a todos ao seu redor'),
  a('Ataque Poderoso', 'manobra', true, 'Faça um ataque menos preciso, porém com mais dano'),
  a('Bloquear Arma', 'manobra', true, 'Faça bloqueios mais precisos contra ataques armados'),
  a('Derrubar Agressivo', 'manobra', true, 'Cause dano e derrube o inimigo'),
  a('Desarme Agressivo', 'manobra', true, 'Cause dano e desarme o inimigo'),
  a('Rasteira', 'manobra', true, 'Faça um golpe baixo e preciso para derrubar o inimigo'),
  a('Soco Agarrado', 'manobra', true, 'Agarre o braço do inimigo antes de atacar e dificulte sua defesa'),
  a('Voadora', 'manobra', true, 'Faça um chute em voadora contra o inimigo'),

  // ----- Técnicas -----
  a('Domínio da Água', 'tecnicas', false, 'Melhore suas técnicas Suiton aproveitando a água do ambiente'),
  a('Domínio do Fogo', 'tecnicas', false, 'O calor de suas chamas sufoca os inimigos'),
  a('Domínio do Raio', 'tecnicas', false, 'Suas técnicas Raiton possuem Crítico Aprimorado'),
  a('Domínio da Terra', 'tecnicas', false, 'Suas barreiras Doton são mais resistentes'),
  a('Domínio do Vento', 'tecnicas', false, 'Os ventos de suas técnicas Fuuton dificultam a locomoção dos inimigos'),
  a('Domínio Ninpou', 'tecnicas', false, 'Sua finta do efeito Flechas é mais rápida'),
  a('Ilusão Profunda', 'tecnicas', false, 'Seus Genjutsus são mais difíceis de serem resistidos'),
  a('Potencializar', 'tecnicas', false, 'Aumente o dano, a área ou o alcance de suas técnicas'),
  a('Técnica Acelerada', 'tecnicas', false, 'Execute técnicas mais rapidamente'),
  a('Técnica Eficiente', 'tecnicas', false, 'Refaça o grau de dano de suas técnicas'),
  a('Técnica Elevada', 'tecnicas', false, 'Aumente os testes de resistência de Perícias de suas técnicas'),
  a('Técnica Poderosa', 'tecnicas', false, 'Aumente o grau de dano de suas técnicas'),

  // ----- Gerais -----
  a('Ninja Médico', 'gerais', false, 'Você estudou e aprendeu a ciência médica'),
  a('Químico', 'gerais', false, 'Você sabe produzir venenos'),
  a('Duro de Matar', 'gerais', true, 'Você resiste ao último golpe que reduziria sua Vitalidade a zero'),
  a('Engenheiro', 'gerais', true, 'Você sabe criar e utilizar mecanismos e armadilhas'),
  a('Perícia Inata', 'gerais', true, 'Você pode repetir testes de perícia', { complemento: 'pericia' }),
  a('Perito', 'gerais', true, 'Você recebe bônus de precisão nos testes de perícia', { complemento: 'pericia' }),
  a('Resistência Maior', 'gerais', true, 'Você pode repetir testes de resistência de atributo', { complemento: 'atributo' }),

  // ----- Shinobi -----
  a('Clone', 'shinobi', false, 'Crie cópias temporárias de si mesmo'),
  a('Clone Verdadeiro', 'shinobi', false, 'Seus Clones podem usar técnicas e poderes'),
  a('Clone Perfeito', 'shinobi', false, 'O PdM cria cópias perfeitas de si mesmo, com todas as suas habilidades', { apenasNpc: true }),
  a('Kyoudo Kyouka', 'shinobi', false, 'Faça um poderoso ataque desarmado usando chakra'),
  a('Réplica Enganadora', 'shinobi', false, 'Escape de um ataque deixando um clone em seu lugar'),
  a('Sensor', 'shinobi', false, 'Você pode rastrear criaturas pelo seu chakra'),
  a('Shunjutsu', 'shinobi', false, 'Mova-se mais rápido usando o Shunshin no Jutsu durante o combate'),
  a('Fascinar', 'shinobi', true, 'Crie uma ilusão na mente do inimigo'),
  a('Miragem', 'shinobi', true, 'Crie uma ilusão sobre um objeto ou lugar'),
  a('Trabalho Duro', 'shinobi', true, 'Receba bônus genéricos durante o combate'),
];

/**
 * Aptidões restritas de clã/hijutsu. `cla` = nome que precisa aparecer no campo
 * "Clã ou Hijutsu" da ficha. Gratuita só se um Genin de NC 4 cumpre os
 * pré-requisitos (pág. 56: perícia/atributo até 4).
 */
export const APTIDOES_RESTRITAS = [
  // ----- Clã Aburame (Livro Básico págs. 142–147) -----
  a('Kikaichuu (Inseto Parasita Destruidor)', 'cla', true,
    'Hospeda 1 kikaichuu (100 insetos) por nível de Lidar com Animais. Ataque: até metade deles, teste de CD, drena chakra igual ao nº usado (sem custo, não pode ser Bloqueado). Pré-req.: Lidar com Animais 1',
    { cla: 'Aburame', pagina: 143 }),
  a('Kikaichuu Nv 2', 'cla', false,
    'Notar Genjutsu e Esconder Insetos com Lidar com Animais; Drenar Veneno com 1 kikaichuu. Pré-req.: Lidar com Animais 10',
    { cla: 'Aburame', pagina: 144, requer: 'Kikaichuu (Inseto Parasita Destruidor)' }),
  a('Shōkaichuu (Inseto Parasita Rastreador)', 'cla', false,
    'Larvas rastreadoras: cada grupo cobre 20 m de raio e volta no início do 5º turno com a posição das assinaturas de chakra. Pré-req.: Lidar com Animais 6; Kikaichuu',
    { cla: 'Aburame', pagina: 144, requer: 'Kikaichuu (Inseto Parasita Destruidor)' }),
  a('Kidaichuu (Inseto Parasita Gigante)', 'cla', false,
    '1 inseto a cada 3 níveis de Lidar com Animais; toque (CC) drena 2 de chakra cada, e eles crescem e viram capangas parceiros. Não combina com Rinkaichuu. Pré-req.: Lidar com Animais 12; Kikaichuu',
    { cla: 'Aburame', pagina: 145, requer: 'Kikaichuu (Inseto Parasita Destruidor)', exclui: 'Rinkaichuu (Inseto Parasita Venenoso)' }),
  a('Rinkaichuu (Inseto Parasita Venenoso)', 'cla', false,
    'Insetos venenosos por contato: 1 de dano fixo por turno por grupo e teste de Vigor (Dif 7 + Lidar com Animais) contra atordoado e fatigado. Não combina com Kidaichuu. Pré-req.: Lidar com Animais 12; Kikaichuu',
    { cla: 'Aburame', pagina: 146, requer: 'Kikaichuu (Inseto Parasita Destruidor)', exclui: 'Kidaichuu (Inseto Parasita Gigante)' }),

  // ----- Clã Senju (Livro Básico págs. 174–175) e Uzumaki (pág. 193) -----
  a('Maximizar', 'cla', false,
    'Escolha Mokuton ou Suiton: ao usar a meta-aptidão Potencializar nesse elemento, aplica todos os benefícios dela de uma vez. Pré-req.: Espírito ou Inteligência 15; Potencializar',
    { cla: 'Senju', pagina: 175, complemento: 'texto', dica: 'Mokuton ou Suiton' }),
  a('Regeneração', 'cla', true,
    'Cura 1 nível de sangramento por turno sem teste (o VTT tira 1 "Sangrando" no início do turno); estabiliza automaticamente morrendo; curas +25%; +2 contra doenças e venenos.',
    { cla: ['Senju', 'Uzumaki', 'Kaguya'], pagina: 193 }),
];

// Aptidões dos clãs do Livro Básico (data/Clas.js).
APTIDOES_RESTRITAS.push(...APTIDOES_CLAS.filter((nova) => !APTIDOES_RESTRITAS.some((a) => a.id === nova.id)));

const TODAS = () => [...APTIDOES_COMUNS, ...APTIDOES_RESTRITAS];

/** Converte uma linha da tabela room_catalog (criada pelo Mestre) em aptidão. */
export function aptitudeFromCatalogRow(row) {
  return {
    id: `custom:${row.id}`,
    nome: row.nome,
    categoria: CATEGORIAS_APTIDAO[row.tipo] ? row.tipo : 'gerais',
    gratuita: Boolean(row.gratuita),
    resumo: row.resumo || '',
    custom: true,
  };
}

export function findAptitude(id, catalog = TODAS()) {
  return catalog.find((aptidao) => aptidao.id === id) ?? null;
}

const normalize = (text) =>
  String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Procura uma aptidão pelo nome digitado (usado para converter fichas antigas). */
export function findAptitudeByName(name, catalog = TODAS()) {
  const target = normalize(name);
  if (!target) return null;
  return catalog.find((aptidao) => normalize(aptidao.nome) === target) ?? null;
}

/**
 * Converte a lista antiga (texto livre) para a nova [{ id, complemento }].
 * O que não for reconhecido fica com id vazio e o texto em `legacy`.
 */
export function migrateLegacyAptitudes(names, catalog) {
  return (names || []).map((name) => {
    const text = String(name || '').trim();
    if (!text) return { id: '', complemento: '' };
    const match = findAptitudeByName(text, catalog);
    return match ? { id: match.id, complemento: '' } : { id: '', complemento: '', legacy: text };
  });
}

/** Nomes das aptidões escolhidas (usado nos pré-requisitos de poderes). */
export function aptitudeNames(list, catalog) {
  return (list || []).map((item) => findAptitude(item.id, catalog)?.nome).filter(Boolean);
}

/** Valida as aptidões gratuitas + adicionais. Retorna a lista de problemas. */
export function validateAptitudes(freeList, extraList, catalog, clan = '') {
  const problemas = [];
  const all = [...freeList.map((item) => ({ ...item, free: true })), ...extraList];
  const seen = new Set();
  const nomes = all.map((item) => findAptitude(item.id, catalog)?.nome).filter(Boolean);

  all.forEach((item) => {
    if (!item.id) return;
    const aptidao = findAptitude(item.id, catalog);
    if (!aptidao) {
      problemas.push('Uma aptidão escolhida não existe mais no catálogo.');
      return;
    }

    if (item.free && !aptidao.gratuita) {
      problemas.push(`${aptidao.nome} não pode ser escolhida como aptidão gratuita.`);
    }

    const clas = [].concat(aptidao.cla || []);
    if (clas.length && !clas.some((c) => normalize(clan).includes(normalize(c)))) {
      problemas.push(`${aptidao.nome} é restrita: escolha ${clas.join(' ou ')} na aba Identidade (Clã ou Hijutsu).`);
    }
    if (aptidao.requer && !nomes.includes(aptidao.requer)) {
      problemas.push(`${aptidao.nome} exige a aptidão ${aptidao.requer}.`);
    }
    if (aptidao.exclui && nomes.includes(aptidao.exclui)) {
      problemas.push(`${aptidao.nome} não pode ser combinada com ${aptidao.exclui}.`);
    }

    if (aptidao.apenasNpc) {
      problemas.push(`${aptidao.nome} é uma aptidão de PdM (personagem do Mestre).`);
    }

    if (aptidao.complemento && !String(item.complemento || '').trim()) {
      problemas.push(`${aptidao.nome}: escolha a categoria.`);
    }

    // Aptidões iguais não se acumulam; genéricas só repetem com categoria diferente (pág. 56–57).
    const key = aptidao.complemento ? `${aptidao.id}|${normalize(item.complemento)}` : aptidao.id;
    if (seen.has(key)) {
      problemas.push(
        aptidao.complemento
          ? `${aptidao.nome}: não repita a mesma categoria.`
          : `${aptidao.nome} foi escolhida mais de uma vez.`
      );
    }
    seen.add(key);
  });

  return problemas;
}
