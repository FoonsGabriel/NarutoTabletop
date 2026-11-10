import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase/client';
import { normalizeModes } from '../services/Combat';
import AppearanceEditor from './AppearanceEditor.jsx';
import {
  PODERES_COMUNS,
  PODERES_RESTRITOS,
  TIPOS_DE_PODER,
  NOMES_DE_ATRIBUTOS,
  findPower,
  powerFromCatalogRow,
  maxPowerLevel,
  powersCost,
  describeRequirements,
  validatePower,
  validatePowerList,
} from '../data/Poderes';
import {
  APTIDOES_COMUNS,
  APTIDOES_RESTRITAS,
  CATEGORIAS_APTIDAO,
  findAptitude,
  aptitudeFromCatalogRow,
  migrateLegacyAptitudes,
  aptitudeNames,
  validateAptitudes,
} from '../data/Aptidoes';
import { ARMAS, ARMADURAS, GRUPOS_DE_ARMA, METROS_POR_BLOCO, findArmor, resolveWeapon, attackModes, damageGrade, finalDamage, defenses as computeDefenses } from '../data/Armas';
import { figureFor } from '../data/Aparencias';
import { ELEMENTOS, PODERES_VERSATEIS, efeitosDoPoder, findEfeito, usaEfeitos, validarEfeitos, validarVersatilidade } from '../data/Efeitos';
import { spawnPoints } from '../canvas/Spawn';
import { uid } from '../services/Uid';
import { CLAS_E_HIJUTSUS, GRADUACOES, TODOS_CLAS, VILAS } from '../data/Ficha';
import { missingPrereqs } from '../data/PreRequisitos';
import { trackedUpdate } from '../services/Undo';
import { kikaichuuStatus } from '../services/Jutsus';
import { ITENS_GERAIS, SERVICOS, compartimentos, findItem } from '../data/Itens';

const NC_DEFAULT = 4;
const ATTRIBUTE_POINTS = 12;
const SKILL_POINTS = 8;
const SOCIAL_POINTS = 2;
const POWER_POINTS = 4;

const ATTRIBUTES = [
  { key: 'forca', label: 'Força', short: 'FOR' },
  { key: 'destreza', label: 'Destreza', short: 'DES' },
  { key: 'agilidade', label: 'Agilidade', short: 'AGI' },
  { key: 'percepcao', label: 'Percepção', short: 'PER' },
  { key: 'inteligencia', label: 'Inteligência', short: 'INT' },
  { key: 'vigor', label: 'Vigor', short: 'VIG' },
  { key: 'espirito', label: 'Espírito', short: 'ESP' },
];

const SKILLS = [
  { key: 'acrobacia', label: 'Acrobacia', attr: 'agilidade' },
  { key: 'arte', label: 'Arte', attr: 'inteligencia' },
  { key: 'atletismo', label: 'Atletismo', attr: 'forca' },
  { key: 'ciencias_naturais', label: 'Ciências Naturais', attr: 'inteligencia' },
  { key: 'concentracao', label: 'Concentração', attr: 'inteligencia' },
  { key: 'cultura', label: 'Cultura', attr: 'inteligencia' },
  { key: 'disfarces', label: 'Disfarces', attr: 'percepcao' },
  { key: 'escapar', label: 'Escapar', attr: 'destreza' },
  { key: 'furtividade', label: 'Furtividade', attr: 'agilidade' },
  { key: 'lidar_animais', label: 'Lidar com animais', attr: 'percepcao', trained: true },
  { key: 'mecanismos', label: 'Mecanismos', attr: 'inteligencia', trained: true },
  { key: 'medicina', label: 'Medicina', attr: 'inteligencia', trained: true },
  { key: 'ocultismo', label: 'Ocultismo', attr: 'inteligencia', trained: true },
  { key: 'prestidigitacao', label: 'Prestidigitação', attr: 'destreza' },
  { key: 'procurar', label: 'Procurar', attr: 'percepcao' },
  { key: 'prontidao', label: 'Prontidão', attr: 'percepcao' },
  { key: 'rastrear', label: 'Rastrear', attr: 'percepcao' },
  { key: 'veneficio', label: 'Venefício', attr: 'inteligencia', trained: true, unavailableAtNc4: true },
];

const COMBAT = [
  { key: 'cc', label: 'Combate Corporal', short: 'CC', attr: 'forca' },
  { key: 'cd', label: 'Combate à Distância', short: 'CD', attr: 'destreza' },
  { key: 'esq', label: 'Esquiva', short: 'ESQ', attr: 'agilidade' },
  { key: 'lm', label: 'Ler Movimento', short: 'LM', attr: 'percepcao' },
];

// Ajuda de cada aba da ficha: frases curtas, sem jargão (regras do Livro Básico).
const AJUDA = {
  identidade: [
    'Aqui você diz quem é o seu ninja: nome, clã e vila.',
    'Clã ou Hijutsu é a família ou técnica secreta do ninja. Ela libera poderes e aptidões especiais. Sem clã? Deixe "Nenhum".',
    'Graduação é o posto do ninja (Genin, Chuunin…). O Nível de Campanha (NC) é controlado pelo Mestre.',
    'Conceito e História são livres: escreva do seu jeito, ajuda o Mestre a criar a aventura.',
  ],
  atributos: [
    'Atributos são o corpo e a mente do ninja. Toque em + e − para colocar os pontos.',
    'Força = golpes corpo a corpo · Destreza = arremessos e armas à distância · Agilidade = velocidade e esquiva · Percepção = notar coisas e ler o movimento do inimigo.',
    'Inteligência = estudo e estratégia · Vigor = aguentar dano (mais Vitalidade) · Espírito = energia (mais Chakra).',
    'Nenhum atributo passa do NC. Pontos Sociais são separados: Carisma (convencer, inspirar) e Manipulação (enganar, pressionar).',
  ],
  pericias: [
    'Perícias são o que o ninja sabe fazer: se esconder, escalar, rastrear, cuidar de feridos…',
    'O valor de cada perícia = metade do atributo ligado a ela (arredondado para cima) + os pontos que você colocar.',
    'Perícias "TREINADAS" só funcionam se você colocar pelo menos 1 ponto nelas.',
    'Cada perícia pode receber até metade do NC em pontos.',
  ],
  combate: [
    'Habilidades de Combate: Combate Corporal (CC), à Distância (CD), Esquiva (ESQ) e Ler Movimento (LM). O total é o atributo + uma base que começa em 3.',
    'Você pode tirar até 2 pontos de uma base e colocar em outra, se quiser se especializar.',
    'Aptidões são talentos (ex.: Diligente, Acuidade). Você ganha 3 de graça; outras custam 2 pontos de Poder.',
    'Poderes são os jutsus e estilos do ninja (Ninjutsu, Taijutsu, elementos…). Cada nível custa 1 ponto de Poder e libera técnicas.',
  ],
  equipamento: [
    'Escolha as armas e a armadura. A ficha calcula sozinha o ataque e as defesas.',
    'Genin começa com 100 Ryos para comprar equipamento.',
    'Depois de mudar o equipamento, salve a ficha.',
  ],
  recursos: [
    'Vitalidade é a sua vida: 10 + 3 × Vigor + 5 × NC. Chakra é a energia dos jutsus: 10 + 3 × Espírito.',
    'Em 0 de Vitalidade o ninja cai e fica fora de combate. Abaixo disso fica inconsciente, depois morrendo; em −21 morre.',
    'Experiência (EXP) e recompensas que o Mestre der aparecem aqui.',
  ],
};

const emptyAttributes = () => Object.fromEntries(ATTRIBUTES.map(({ key }) => [key, 0]));
const emptySkillSpending = () => Object.fromEntries(SKILLS.map(({ key }) => [key, 0]));
const emptyCharacter = (playerName) => ({
  name: `${playerName || 'Novo'} — Genin`,
  clan: '',
  village: 'Konohagakure',
  rank: 'Genin',
  level: NC_DEFAULT,
  xp: 0,
  ryo: 100,
  hp_max: 30,
  hp_current: 30,
  chakra_max: 10,
  chakra_current: 10,
  stamina_max: 0,
  stamina_current: 0,
  attributes: {
    nc: NC_DEFAULT,
    attributes: emptyAttributes(),
    skill_spending: emptySkillSpending(),
    social: { carisma: 0, manipulacao: 0 },
    combat_base: { cc: 3, cd: 3, esq: 3, lm: 3 },
    concept: '',
    history: '',
    aptidoes_gratuitas: ['', '', ''],
    powers: '',
    extra_aptidoes: '',
  },
  active_modes: [],
  overrides: {},
  is_npc: false,
});

const getPointTotal = (values) => Object.values(values || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const halfRoundedUp = (value) => Math.ceil(Number(value || 0) / 2);
const formatError = (error) => error?.message || 'Não foi possível salvar a ficha.';

export default function CharacterSheet({ roomId, playerId, playerName, onRoll }) {
  const [character, setCharacter] = useState(null);
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('identidade');
  // Ajuda nas abas: começa ligada; quem já conhece pode desligar (vale só neste aparelho).
  const [ajuda, setAjuda] = useState(() => {
    try { return window.localStorage.getItem('vtt_ficha_ajuda') !== '0'; } catch { return true; }
  });
  const alternarAjuda = () => setAjuda((on) => {
    try { window.localStorage.setItem('vtt_ficha_ajuda', on ? '0' : '1'); } catch { /* sem localStorage */ }
    return !on;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [figureDraft, setFigureDraft] = useState({}); // aparência de corpo inteiro (ainda não aplicada)
  const [savingFigure, setSavingFigure] = useState(false);
  const [expanded, setExpanded] = useState(false); // ficha completa sobreposta ao tabuleiro
  const [roomInfo, setRoomInfo] = useState(null); // gm_id e grid_size da mesa
  const [catalogRows, setCatalogRows] = useState([]); // poderes/aptidões criados pelo Mestre

  const isGM = Boolean(roomInfo && playerId && roomInfo.gm_id === playerId);

  // Carrega a mesa (para saber quem é o Mestre) e o catálogo personalizado,
  // e acompanha em tempo real quando o Mestre cria algo novo.
  useEffect(() => {
    if (!roomId) return undefined;
    let active = true;

    supabase.from('rooms').select('gm_id, grid_size').eq('id', roomId).single()
      .then(({ data }) => { if (active) setRoomInfo(data); });

    supabase.from('room_catalog').select('*').eq('room_id', roomId).order('nome')
      .then(({ data, error: catalogError }) => {
        if (!active) return;
        if (catalogError) console.warn('Catálogo personalizado indisponível:', catalogError.message);
        else setCatalogRows(data || []);
      });

    const channel = supabase
      .channel(`catalog_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_catalog', filter: `room_id=eq.${roomId}` }, (payload) => {
        setCatalogRows((current) => {
          if (payload.eventType === 'DELETE') return current.filter((row) => row.id !== payload.old.id);
          return [...current.filter((row) => row.id !== payload.new.id), payload.new];
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const powersCatalog = useMemo(
    () => [...PODERES_COMUNS, ...PODERES_RESTRITOS, ...catalogRows.filter((row) => row.kind === 'poder').map(powerFromCatalogRow)],
    [catalogRows]
  );
  const aptitudesCatalog = useMemo(
    () => [...APTIDOES_COMUNS, ...APTIDOES_RESTRITAS, ...catalogRows.filter((row) => row.kind === 'aptidao').map(aptitudeFromCatalogRow)],
    [catalogRows]
  );

  // Mestre cria um poder/aptidão novo para esta mesa. Retorna o id usado na ficha.
  const createCatalogEntry = async (entry) => {
    const { data: row, error: insertError } = await supabase
      .from('room_catalog')
      .insert({ ...entry, room_id: roomId, created_by: playerId })
      .select('*')
      .single();

    if (insertError) {
      setError(`Erro ao criar no catálogo: ${insertError.message}`);
      return null;
    }

    setCatalogRows((current) => [...current.filter((item) => item.id !== row.id), row]);
    return `custom:${row.id}`;
  };

  const characterId = character?.id;

  // Carrega a aparência salva quando a ficha abre (ou muda de personagem).
  useEffect(() => {
    setFigureDraft(character?.attributes?.figure || {});
  }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha a ficha completa.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const loadCharacter = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase.from('characters').select('*').eq('room_id', roomId).eq('is_npc', false);
    if (playerId) query = query.eq('owner_id', playerId);
    const { data, error: fetchError } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (fetchError) {
      setError(`Erro ao carregar personagem: ${fetchError.message}`);
      setCharacter(null);
      setDraft(null);
    } else if (data) {
      setCharacter(data);
      setDraft(data);
    } else {
      setCharacter(null);
      setDraft(emptyCharacter(playerName));
    }
    setLoading(false);
  }, [roomId, playerId, playerName]);

  useEffect(() => { loadCharacter(); }, [loadCharacter]);

  // Quando o Mestre altera Vitalidade/Chakra ou concede EXP/recompensas, a ficha aberta acompanha.
  useEffect(() => {
    if (!characterId) return undefined;

    const channel = supabase
      .channel(`character_${characterId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'characters', filter: `id=eq.${characterId}` },
        (payload) => {
          const fresh = payload.new;
          setCharacter(fresh);
          setDraft((current) => {
            if (!current) return fresh;
            return {
              ...current,
              hp_current: fresh.hp_current,
              hp_max: fresh.hp_max,
              chakra_current: fresh.chakra_current,
              chakra_max: fresh.chakra_max,
              active_modes: fresh.active_modes,
              xp: fresh.xp ?? current.xp,
              level: fresh.level ?? current.level,
              ryo: fresh.ryo ?? current.ryo,
              attributes: {
                ...(current.attributes || {}),
                ...(fresh.attributes?.exp_ganho ? { exp_ganho: fresh.attributes.exp_ganho } : {}),
                ...(fresh.attributes?.itens_recebidos ? { itens_recebidos: fresh.attributes.itens_recebidos } : {}),
                ...(fresh.attributes?.equipment ? { equipment: fresh.attributes.equipment } : {}),
              },
            };
          });
        }
      )
      .subscribe();

    const onRefresh = () => loadCharacter();
    window.addEventListener('vtt:character-refresh', onRefresh);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('vtt:character-refresh', onRefresh);
    };
  }, [characterId, loadCharacter]);

  const data = draft?.attributes || {};
  // Evolução (pág. 31): EXP recebido do Mestre soma aos pontos da criação.
  // Na evolução pode guardar pontos para depois (não precisa gastar tudo).
  const ganho = data.exp_ganho || {};
  const evolucao = ['atributos', 'pericias', 'poderes'].some((k) => Number(ganho[k] || 0) > 0);
  const ATTR_TOTAL = ATTRIBUTE_POINTS + Math.floor(Number(ganho.atributos || 0));
  const SKILL_TOTAL = SKILL_POINTS + Math.floor(Number(ganho.pericias || 0));
  const POWER_TOTAL = POWER_POINTS + Math.floor(Number(ganho.poderes || 0));
  // Tabela de Evolução (págs. 31–32): o atributo mínimo começa em 0 e sobe 1 a cada NC ímpar;
  // a partir do NC 7, cada novo mínimo dá +2 pontos para Carisma ou Manipulação.
  const ncAtual = Number(draft?.level || NC_DEFAULT);
  const minAtributo = Math.max(0, Math.floor((ncAtual - 3) / 2));
  const SOCIAL_TOTAL = SOCIAL_POINTS + (ncAtual >= 7 ? 2 * Math.floor((ncAtual - 5) / 2) : 0);
  const limiteMetade = Math.floor(ncAtual / 2); // perícias e sociais: até metade do NC
  const attributes = data.attributes || emptyAttributes();
  const skillSpending = data.skill_spending || emptySkillSpending();
  const social = data.social || { carisma: 0, manipulacao: 0 };
  const combatBase = data.combat_base || { cc: 3, cd: 3, esq: 3, lm: 3 };

  const attributeSpent = getPointTotal(attributes);
  const skillSpent = getPointTotal(skillSpending);
  const socialSpent = getPointTotal(social);
  const combatMoved = Object.values(combatBase).reduce((sum, value) => sum + Math.max(0, Number(value) - 3), 0);
  // Aptidões: listas estruturadas [{ id, complemento }] escolhidas por combo box.
  // Fichas antigas (texto livre) são convertidas automaticamente pelo nome.
  const freeAptList = (() => {
    const list = Array.isArray(data.aptidoes_gratuitas_list)
      ? data.aptidoes_gratuitas_list
      : migrateLegacyAptitudes(data.aptidoes_gratuitas, aptitudesCatalog);
    return [0, 1, 2].map((index) => list[index] || { id: '', complemento: '' });
  })();
  const extraAptList = Array.isArray(data.aptidoes_extra_list)
    ? data.aptidoes_extra_list
    : migrateLegacyAptitudes(String(data.extra_aptidoes || '').split('\n').filter((line) => line.trim()), aptitudesCatalog);
  const chosenAptitudeNames = aptitudeNames([...freeAptList, ...extraAptList], aptitudesCatalog);
  const regrasLivresMestre = Boolean(data?.regras_livres_mestre || draft?.overrides?.regras_livres);
  const allClans = [draft?.clan, data?.segundo_cla].filter(Boolean).join(' / ');
  const aptitudeIssues = validateAptitudes(freeAptList, extraAptList, aptitudesCatalog, allClans, { regrasLivres: regrasLivresMestre });
  const freeAptitudes = freeAptList.filter((item) => item.id);
  const extraAptitudes = extraAptList;
  // Poderes: lista estruturada [{ id, level, name }] escolhida por combo box.
  const powerList = Array.isArray(data.powers_list) ? data.powers_list : [];
  const legacyPowers = String(data.powers || '').trim(); // texto livre da versão antiga
  const currentNc = Number(draft?.level || NC_DEFAULT);
  const powerContext = {
    nc: currentNc,
    attributes,
    aptitudes: chosenAptitudeNames,
    catalog: powersCatalog,
    clan: allClans,
    regrasLivres: regrasLivresMestre,
  };
  const powerIssues = validatePowerList(powerList, powerContext);
  const powerSpent = powersCost(powerList) + extraAptitudes.length * 2;
  // Corpulência (Akimichi, pág. 150): +3 × Vigor de Vitalidade. Chakra Expandido (Uzumaki, pág. 193): +50% de chakra.
  const aptIdsFicha = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])].map((item) => item?.id);
  const vitalityMax = 10 + 3 * Number(attributes.vigor || 0) + 5 * Number(draft?.level || NC_DEFAULT)
    + (aptIdsFicha.includes('corpulencia') ? 3 * Number(attributes.vigor || 0) : 0);
  // Chakra Expandido ×1,5 (pág. 193); Rinnegan sempre ativo: −10% (Hijutsus pág. 65).
  const chakraMax = Math.floor((10 + 3 * Number(attributes.espirito || 0)) * (aptIdsFicha.includes('chakra_expandido') ? 1.5 : 1) * (aptIdsFicha.includes('rinnegan') ? 0.9 : 1));

  // ---------- Combate: precisões, equipamento e defesas ----------
  // Precisão de combate = atributo + valor base (CC/FOR, CD/DES, ESQ/AGI, LM/PER).
  const combatTotals = Object.fromEntries(COMBAT.map((item) => [
    item.key, Number(attributes[item.attr] || 0) + Number(combatBase[item.key] ?? 3),
  ]));
  const equipment = data.equipment || { weapons: [], armor: 'nenhuma' };
  const weaponItems = Array.isArray(equipment.weapons) ? equipment.weapons : [];
  const armor = findArmor(equipment.armor);
  // Aptidões com nome + complemento (Usar Arma: Katana, por exemplo).
  const aptitudeDetails = [...freeAptList, ...extraAptList]
    .filter((item) => item.id)
    .map((item) => ({ nome: findAptitude(item.id, aptitudesCatalog)?.nome, complemento: item.complemento }));
  const hasHeavyArmorAptitude = armor.exigeApt ? aptitudeDetails.some((apt) => apt.nome === armor.exigeApt) : aptitudeDetails.some((apt) => apt.nome === 'Usar Armaduras Pesadas' || apt.nome === 'Armadura Samurai');
  const weaponsResolved = [
    { uid: 'desarmado', item: { uid: 'desarmado', id: 'ataque-desarmado' }, arma: resolveWeapon({ uid: 'desarmado', id: 'ataque-desarmado' }) },
    ...weaponItems.map((item) => ({ uid: item.uid, item, arma: resolveWeapon(item) })).filter((entry) => entry.arma),
  ];
  const attackContext = { attributes, combat: combatTotals, aptitudes: aptitudeDetails };
  const defenseValues = computeDefenses({
    combat: combatTotals,
    armor,
    hasHeavyArmorAptitude,
    weapons: weaponsResolved.map((entry) => entry.arma),
    aptitudes: aptitudeDetails,
  });

  const derivedSkills = useMemo(() => Object.fromEntries(SKILLS.map((skill) => {
    const trained = Number(skillSpending[skill.key] || 0);
    return [skill.key, skill.trained && trained < 1 ? null : halfRoundedUp(attributes[skill.attr]) + trained];
  })), [attributes, skillSpending]);

  // Pré-requisitos das aptidões escolhidas (aviso; o Mestre pode liberar exceções).
  const prereqWarnings = [...freeAptList, ...extraAptList]
    .filter((item) => item.id)
    .map((item) => findAptitude(item.id, aptitudesCatalog)?.nome)
    .filter(Boolean)
    .map((nome) => ({ nome, falta: missingPrereqs(nome, {
      attributes, skills: derivedSkills, combat: combatTotals, aptitudes: chosenAptitudeNames, powers: powerList, clan: draft?.clan,
    }) }))
    .filter((w) => w.falta.length);

  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateData = (field, value) => setDraft((current) => ({
    ...current,
    attributes: { ...(current.attributes || {}), [field]: value },
  }));
  // Mestre sobe (ou desfaz) um Nível de Campanha: +6 atributos, +4 perícias, +2 poderes (pág. 31).
  const mudarNc = (delta) => setDraft((current) => {
    const nivel = Math.max(NC_DEFAULT, Number(current.level || NC_DEFAULT) + delta);
    const passo = nivel - Number(current.level || NC_DEFAULT);
    if (!passo) return current;
    const atual = current.attributes?.exp_ganho || {};
    const exp_ganho = {
      atributos: Math.max(0, Number(atual.atributos || 0) + 6 * passo),
      pericias: Math.max(0, Number(atual.pericias || 0) + 4 * passo),
      poderes: Math.max(0, Number(atual.poderes || 0) + 2 * passo),
    };
    return { ...current, level: nivel, attributes: { ...(current.attributes || {}), exp_ganho } };
  });
  const updateNested = (group, field, value) => setDraft((current) => ({
    ...current,
    attributes: {
      ...(current.attributes || {}),
      [group]: { ...((current.attributes || {})[group] || {}), [field]: value },
    },
  }));

  const validation = useMemo(() => {
    const issues = [];
    if (!draft?.name?.trim()) issues.push('Informe o nome do personagem.');
    const howMany = (spent, total) => (spent < total ? `faltam ${total - spent}` : `tire ${spent - total}`);
    // Criação: gastar exatamente. Evolução: gastar pelo menos os da criação e no máximo o total.
    const conta = (spent, base, total, nome) => {
      if (!evolucao) { if (spent !== base) issues.push(`Distribua exatamente ${base} pontos de ${nome} (${howMany(spent, base)}).`); return; }
      if (spent > total) issues.push(`Você usou ${spent - total} ponto(s) de ${nome} a mais (tem ${total}).`);
      else if (spent < base) issues.push(`Distribua pelo menos os ${base} pontos de ${nome} da criação (faltam ${base - spent}).`);
    };
    conta(attributeSpent, ATTRIBUTE_POINTS, ATTR_TOTAL, 'atributos');
    if (ATTRIBUTES.some(({ key }) => Number(attributes[key]) < 0 || Number(attributes[key]) > Number(draft?.level || NC_DEFAULT))) issues.push('Cada atributo deve ficar entre 0 e o NC da campanha.');
    conta(skillSpent, SKILL_POINTS, SKILL_TOTAL, 'perícia');
    if (SKILLS.some(({ key }) => Number(skillSpending[key]) < 0 || Number(skillSpending[key]) > Math.floor(Number(draft?.level || NC_DEFAULT) / 2))) issues.push('Cada perícia respeita o limite de metade do NC, arredondado para baixo.');
    if (!evolucao && socialSpent !== SOCIAL_TOTAL) issues.push(`Distribua exatamente ${SOCIAL_TOTAL} pontos sociais (${howMany(socialSpent, SOCIAL_TOTAL)}).`);
    if (evolucao && socialSpent > SOCIAL_TOTAL) issues.push(`Você usou pontos sociais a mais: ${socialSpent - SOCIAL_TOTAL} (tem ${SOCIAL_TOTAL}).`);
    if (minAtributo > 0) {
      const abaixo = ATTRIBUTES.filter(({ key }) => Number(attributes[key] || 0) < minAtributo).map((a) => a.label);
      if (abaixo.length) issues.push(`No NC ${ncAtual} todo atributo precisa ser pelo menos ${minAtributo}. Gaste primeiro em: ${abaixo.join(', ')}.`);
    }
    if (Object.values(social).some((value) => Number(value) < 0 || Number(value) > Math.floor(Number(draft?.level || NC_DEFAULT) / 2))) issues.push('Carisma e Manipulação respeitam o limite de metade do NC.')
    if (combatMoved > 2) issues.push('Você só pode redistribuir até 2 pontos entre as bases de combate.');
    if (freeAptitudes.length !== 3) issues.push('Escolha as 3 aptidões gratuitas.');
    if (extraAptList.some((item) => !item.id)) issues.push('Há uma aptidão adicional sem escolha.');
    issues.push(...aptitudeIssues);
    if (!evolucao && powerSpent !== POWER_POINTS) issues.push(`Distribua os ${POWER_POINTS} pontos de Poder: cada nível de poder custa 1 ponto e cada aptidão adicional custa 2 (usados: ${powerSpent}).`);
    if (evolucao && powerSpent > POWER_TOTAL) issues.push(`Você usou ${powerSpent - POWER_TOTAL} ponto(s) de Poder a mais (tem ${POWER_TOTAL}).`);
    if (evolucao && powerSpent < POWER_POINTS) issues.push(`Distribua pelo menos os ${POWER_POINTS} pontos de Poder da criação (faltam ${POWER_POINTS - powerSpent}).`);
    issues.push(...powerIssues);
    if (Number(attributes.vigor || 0) > Number(draft?.level || NC_DEFAULT)) issues.push('Vigor ultrapassa o limite do NC.');
    return issues;
  }, [draft, attributes, attributeSpent, skillSpent, skillSpending, socialSpent, combatMoved, freeAptitudes, extraAptList, aptitudeIssues, powerSpent, powerIssues, evolucao, ATTR_TOTAL, SKILL_TOTAL, POWER_TOTAL, SOCIAL_TOTAL, minAtributo, ncAtual]);

  // Em qual aba cada pendência se resolve (selo ✓ / número em cada aba e o botão "Próximo passo").
  const tabOfIssue = (issue) => {
    if (/perícia/i.test(issue)) return 'pericias';
    if (/atributo|sociais|carisma|vigor/i.test(issue)) return 'atributos';
    if (/poder|aptid|afinidade|combate|ninpou|elemento/i.test(issue) || powerIssues.includes(issue) || aptitudeIssues.includes(issue)) return 'combate';
    return 'identidade';
  };
  const issuesByTab = validation.reduce((acc, issue) => {
    const tab = tabOfIssue(issue);
    (acc[tab] ||= []).push(issue);
    return acc;
  }, {});

  const saveCharacter = async () => {
    if (validation.length) {
      setError(validation[0]);
      setActiveTab(tabOfIssue(validation[0]));
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      room_id: roomId,
      owner_id: playerId || null,
      name: draft.name.trim(),
      clan: draft.clan || null,
      village: draft.village || null,
      rank: draft.rank || 'Genin',
      level: Number(draft.level || NC_DEFAULT),
      xp: Number(draft.xp || 0),
      ryo: Number(draft.ryo ?? 100),
      // Campos legados da antiga ficha simplificada; os atributos oficiais ficam no JSONB.
      ninjutsu: 0,
      taijutsu: 0,
      genjutsu: 0,
      hp_max: vitalityMax,
      hp_current: character ? Math.min(Number(draft.hp_current ?? vitalityMax), vitalityMax) : vitalityMax,
      chakra_max: chakraMax,
      chakra_current: character ? Math.min(Number(draft.chakra_current ?? chakraMax), chakraMax) : chakraMax,
      stamina_max: Number(draft.stamina_max || 0),
      stamina_current: Number(draft.stamina_current || 0),
      attributes: {
        ...data,
        nc: Number(draft.level || NC_DEFAULT),
        attributes,
        skill_spending: skillSpending,
        social,
        combat_base: combatBase,
        skill_totals: derivedSkills,
        combat_totals: combatTotals,
        defenses: {
          esquiva_dificuldade: defenseValues.esquiva.dificuldade,
          bloqueio: defenseValues.bloqueio.possivel ? defenseValues.bloqueio.precisao : null,
          antecipar: defenseValues.antecipar.precisao,
        },
        equipment,
      },
      active_modes: normalizeModes(character?.active_modes ?? draft.active_modes),
      overrides: draft.overrides || {},
      is_npc: false,
    };
    const request = character
      ? supabase.from('characters').update(payload).eq('id', character.id).select().single()
      : supabase.from('characters').insert(payload).select().single();
    const { data: saved, error: saveError } = await request;
    if (saveError) {
      setError(`Erro ao salvar: ${formatError(saveError)}`);
    } else {
      setCharacter(saved);
      setDraft(saved);
      setNotice('Ficha salva no Supabase!');
    }
    setSaving(false);
  };

  // Cria o token do personagem no mapa, ligado à ficha (character_id).
  const placeOnMap = async () => {
    if (!character || placing) return;

    setPlacing(true);
    setError('');
    setNotice('');

    const { data: existing, error: findError } = await supabase
      .from('map_tokens')
      .select('id')
      .eq('character_id', character.id)
      .limit(1);

    if (findError) {
      setError(`Erro ao verificar o mapa: ${findError.message}`);
      setPlacing(false);
      return;
    }

    if (existing?.length) {
      setNotice('Seu personagem já está no mapa.');
      setPlacing(false);
      return;
    }

    const { data: room } = await supabase.from('rooms').select('grid_size').eq('id', roomId).single();
    const gridSize = room?.grid_size || 64;
    const [spot] = spawnPoints(1, gridSize); // no meio da tela, num bloco livre

    const { error: insertError } = await supabase.from('map_tokens').insert({
      room_id: roomId,
      character_id: character.id,
      name: character.name,
      image_url: character.avatar_url || `https://api.dicebear.com/7.x/adventurer/png?seed=${character.id}`,
      x: spot.x,
      y: spot.y,
      width: 1,
      height: 1,
      rotation: 0,
      layer: 'token',
      is_hidden: false,
      is_clone: false,
      sprite: figureFor(character), // corpo inteiro da ficha, ou o Genin padrão
    });

    if (insertError) {
      setError(`Erro ao colocar no mapa: ${insertError.message}`);
    } else {
      setNotice('Personagem colocado no mapa!');
    }

    setPlacing(false);
  };

  // Ajuste rápido de Vitalidade/Chakra no modo compacto (salva na hora).
  const adjustResource = async (field, maxField, delta) => {
    if (!character) return;

    const max = Number(character[maxField] ?? 0);
    const next = Math.max(0, Math.min(max, Number(character[field] ?? 0) + delta));
    if (next === character[field]) return;

    setCharacter((current) => ({ ...current, [field]: next }));
    setDraft((current) => ({ ...current, [field]: next }));

    const sigla = field === 'hp_current' ? 'VIT' : field === 'chakra_current' ? 'CK' : field;
    const { error: updateError } = await trackedUpdate(character.id, { [field]: next }, `${character.name}: ${sigla} ${Number(character[field] ?? 0)} → ${next} (ficha)`);
    if (updateError) setError(`Erro ao atualizar recurso: ${updateError.message}`);
  };

  // Modos e efeitos ativos: salvam direto no banco (o combate desconta a cada turno).
  // Aparência no mapa: salva na ficha e aplica em todos os tokens deste personagem.
  const savedFigure = character?.attributes?.figure || {};
  const figureChanged = JSON.stringify(savedFigure) !== JSON.stringify(figureDraft || {});

  const saveFigure = async () => {
    if (!character || savingFigure) return;
    setSavingFigure(true);
    setError('');

    const figure = figureDraft?.url ? { ...figureDraft, mode: 'figure' } : {};
    const nextAttributes = { ...(character.attributes || {}), figure };

    const { error: sheetError } = await supabase.from('characters').update({ attributes: nextAttributes }).eq('id', character.id);
    if (sheetError) {
      setError(`Erro ao salvar a aparência: ${sheetError.message}`);
      setSavingFigure(false);
      return;
    }

    setCharacter((current) => ({ ...current, attributes: nextAttributes }));
    setDraft((current) => ({ ...current, attributes: { ...(current.attributes || {}), figure } }));

    const { error: tokenError } = await supabase.from('map_tokens').update({ sprite: figure }).eq('character_id', character.id);
    if (tokenError) setError(`A ficha foi salva, mas o token não atualizou: ${tokenError.message}`);
    else setNotice(figure.url ? 'Aparência aplicada no mapa!' : 'Voltou ao token redondo.');

    setSavingFigure(false);
  };

  // Contador de Kikaichuu (Aburame): só aparece com a aptidão.
  const temKikaichuu = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])]
    .some((item) => findAptitude(item?.id, aptitudesCatalog)?.nome === 'Kikaichuu (Inseto Parasita Destruidor)');
  const kikaichuu = temKikaichuu ? kikaichuuStatus({ ...data, skill_totals: { ...(data.skill_totals || {}), lidar_animais: derivedSkills.lidar_animais ?? data.skill_totals?.lidar_animais } }) : null;
  const changeKikaichuu = async (delta) => {
    if (!character || !kikaichuu) return;
    // −1: marca a perda agora · +1: tira a perda mais antiga
    const perdas = delta < 0 ? [...kikaichuu.perdas, Date.now()] : [...kikaichuu.perdas].sort((a, b) => a - b).slice(1);
    const nextAttributes = { ...(character.attributes || {}), kikaichuu_perdas: perdas };
    setCharacter((current) => ({ ...current, attributes: nextAttributes }));
    setDraft((current) => ({ ...current, attributes: { ...(current.attributes || {}), kikaichuu_perdas: perdas } }));
    const { error: updateError } = await trackedUpdate(character.id, { attributes: nextAttributes }, `${character.name}: kikaichuu ${delta < 0 ? '−1' : '+1'}`);
    if (updateError) setError(`Erro ao salvar os kikaichuu: ${updateError.message}`);
  };

  const saveModes = async (nextModes) => {
    if (!character) return;
    setCharacter((current) => ({ ...current, active_modes: nextModes }));
    setDraft((current) => ({ ...current, active_modes: nextModes }));
    const { error: updateError } = await trackedUpdate(character.id, { active_modes: nextModes }, `${character.name}: modos/efeitos (ficha)`);
    if (updateError) setError(`Erro ao salvar modos: ${updateError.message}`);
  };

  const addMode = (mode) => saveModes([...normalizeModes(character?.active_modes), { id: uid(), ...mode }]);
  const removeMode = (modeId) => saveModes(normalizeModes(character?.active_modes).filter((mode) => mode.id !== modeId));

  // As rolagens vão para o histórico de dados (não mais para o chat).
  const rollTest = (label, precision) =>
    onRoll?.({ label: `Teste de ${label}`, count: 2, sides: 8, modifier: Number(precision || 0) });

  // Ataque com arma: 2d8 + precisão; o resultado SÓ DOS DADOS define o grau de dano (pág. 258).
  const [lastAttack, setLastAttack] = useState(null);
  const rollAttack = async (arma, modo) => {
    const row = await onRoll?.({ label: `Ataque: ${arma.nome} · ${modo.rotulo}`, count: 2, sides: 8, modifier: modo.precisao });
    if (!row) return;
    const dice = Array.isArray(row.rolls) ? row.rolls.map(Number) : [];
    const diceSum = dice.reduce((sum, value) => sum + value, 0);
    const grade = damageGrade(diceSum, { critico: modo.critico || 15 });
    setLastAttack({
      arma: arma.nome,
      modo: modo.rotulo,
      dice,
      total: Number(row.total),
      ...grade,
      danoBase: modo.danoBase,
      dano: finalDamage(modo.danoBase, grade.grau, { danoFixo: modo.danoFixo }),
    });
  };

  const rollDefense = (label, precision) =>
    onRoll?.({ label: `Defesa: ${label}`, count: 2, sides: 8, modifier: Number(precision || 0) });

  const updateEquipment = (changes) => updateData('equipment', { ...equipment, weapons: weaponItems, ...changes });

  const rollInitiative = () => {
    const diligente = aptitudeDetails.some((apt) => apt.nome === 'Diligente') ? 3 : 0; // pág. 63
    const precision = (derivedSkills.prontidao || 0) + Number(attributes.agilidade || 0) + diligente;
    return onRoll?.({ label: 'Iniciativa', count: 1, sides: 8, modifier: precision });
  };

  if (loading) return <div className="p-4 text-sm text-zinc-400">Carregando ficha do Shinobi no Sho...</div>;
  if (!draft) return <div className="p-4 text-sm text-red-300">{error || 'Não foi possível preparar a ficha.'}<button onClick={loadCharacter} className="mt-3 block rounded bg-zinc-800 px-3 py-2">Tentar novamente</button></div>;

  const tabs = [
    ['identidade', 'Identidade'], ['atributos', 'Atributos'], ['pericias', 'Perícias'], ['combate', 'Combate'], ['equipamento', 'Equipamento'], ['recursos', 'Recursos'],
  ];

  // ---------------------------------------------------------------
  // FICHA COMPLETA (abre sobreposta ao tabuleiro)
  // ---------------------------------------------------------------
  const fullSheet = (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">Naruto · Shinobi no Sho</p>
            <h2 className="text-lg font-black">Ficha do Shinobi</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-red-900 bg-red-950/60 px-2 py-1 text-xs font-bold text-red-300">NC {draft.level || NC_DEFAULT}</span>
            <button onClick={alternarAjuda} className={`rounded border px-2 py-1 text-xs font-bold ${ajuda ? 'border-sky-600 bg-sky-950/60 text-sky-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white'}`} title="Mostrar ou esconder a explicação de cada aba">❓ Ajuda</button>
            <button onClick={() => setExpanded(false)} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-bold text-zinc-300 hover:border-red-600 hover:text-white" title="Voltar para o modo compacto (Esc)">✕ Fechar</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {tabs.map(([key, label], index) => {
            const pending = issuesByTab[key]?.length || 0;
            const checked = ['identidade', 'atributos', 'pericias', 'combate'].includes(key);
            return <button key={key} onClick={() => setActiveTab(key)} className={`relative rounded px-1 py-2 text-[10px] font-bold transition-colors ${activeTab === key ? 'bg-red-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
              <span className="mr-0.5 opacity-60">{index + 1}.</span>{label}
              {checked && <span className={`absolute -right-1 -top-1.5 min-w-[1rem] rounded-full px-1 text-[9px] leading-4 ${pending ? 'bg-amber-500 text-black' : 'bg-emerald-600 text-white'}`}>{pending || '✓'}</span>}
            </button>;
          })}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {error && <div className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}
        {issuesByTab[activeTab]?.length > 0 && (
          <div className="rounded border border-amber-700/70 bg-amber-950/30 p-2 text-xs text-amber-100">
            <p className="mb-1 font-bold">Falta nesta aba:</p>
            <ul className="list-disc space-y-0.5 pl-4">{issuesByTab[activeTab].map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        )}
        {notice && <div className="rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-200">{notice}</div>}

        {ajuda && AJUDA[activeTab] && (
          <div className="rounded border border-sky-800/70 bg-sky-950/30 p-2 text-xs text-sky-100">
            <p className="mb-1 font-bold">❓ Como funciona esta aba</p>
            <ul className="list-disc space-y-0.5 pl-4">{AJUDA[activeTab].map((linha) => <li key={linha}>{linha}</li>)}</ul>
          </div>
        )}

        {evolucao && (() => {
          // Evolução (pág. 31): pontos novos podem ser gastos agora ou guardados.
          const sobra = [
            [ATTR_TOTAL - attributeSpent, 'Atributo', 'atributos'],
            [SOCIAL_TOTAL - socialSpent, 'Social', 'atributos'],
            [SKILL_TOTAL - skillSpent, 'Perícia', 'pericias'],
            [POWER_TOTAL - powerSpent, 'Poder', 'combate'],
          ].filter(([n]) => n > 0);
          if (!sobra.length) return null;
          return (
            <div className="rounded border border-orange-600/70 bg-orange-950/40 p-2 text-xs text-orange-100">
              <p className="font-bold">⬆ Você tem pontos novos para gastar</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {sobra.map(([n, nome, aba]) => (
                  <button key={nome} type="button" onClick={() => setActiveTab(aba)} className="rounded border border-orange-700 px-2 py-0.5 font-bold hover:bg-orange-900/50">
                    {n} de {nome} →
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-orange-200/70">Pode gastar agora ou guardar para depois. Lembre de salvar a ficha.</p>
            </div>
          );
        })()}

        {activeTab === 'identidade' && <section className="space-y-3">
          {!character && <div className="rounded border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-100">Você ainda não tem um personagem nesta mesa. Preencha a ficha e salve para criar seu Genin.</div>}
          <Field label="Nome do personagem"><input value={draft.name || ''} onChange={(e) => updateDraft('name', e.target.value)} className={inputClass} placeholder="Nome do shinobi" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Clã ou Hijutsu">
              <ListOrOther value={draft.clan || ''} onChange={(v) => updateDraft('clan', v)} emptyLabel="Nenhum"
                groups={CLAS_E_HIJUTSUS.map((g) => ({ label: g.grupo, options: g.itens.map((c) => ({ value: c, label: c })) }))}
                known={TODOS_CLAS} placeholder="Nome do clã ou Hijutsu" />
            </Field>
            <Field label="Segundo Clã / Hijutsu (se o Mestre liberou)">
              <input value={data.segundo_cla || ''} onChange={(e) => updateData('segundo_cla', e.target.value)} className={inputClass} placeholder="Ex.: Jiton (Satetsu), Hyuuga..." />
            </Field>
          </div>
          <div className="rounded border border-amber-800/80 bg-amber-950/20 p-2.5 text-xs">
            <label className="flex items-start gap-2 cursor-pointer font-bold text-amber-200">
              <input
                type="checkbox"
                checked={Boolean(data.regras_livres_mestre)}
                onChange={(e) => updateData('regras_livres_mestre', e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <span>🔓 Liberar regras / Exceções autorizadas pelo Mestre</span>
                <p className="font-normal text-[11px] text-zinc-400 mt-0.5">
                  Permite combinar poderes e aptidões de clãs diferentes (por exemplo, ter Areia de Ferro e ser do clã Aburame). Os pontos de poder são divididos normalmente entre as escolhas.
                </p>
              </div>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vila">
              <ListOrOther value={draft.village || ''} onChange={(v) => updateDraft('village', v)} emptyLabel="Escolha a vila"
                groups={[{ options: VILAS.map((v) => ({ value: v.valor, label: v.rotulo })) }]}
                known={VILAS.map((v) => v.valor)} placeholder="Nome da vila" />
            </Field>
            <Field label="Graduação">
              <ListOrOther value={draft.rank || 'Genin'} onChange={(v) => updateDraft('rank', v)}
                groups={[{ options: GRADUACOES.map((g) => ({ value: g.valor, label: `${g.valor} (NC ${g.nc})` })) }]}
                known={GRADUACOES.map((g) => g.valor)} placeholder="Graduação" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nível de Campanha">
              {isGM ? (
                <div className="flex items-center gap-1">
                  <button type="button" disabled={ncAtual <= NC_DEFAULT} onClick={() => mudarNc(-1)} className={stepButton} title="Desfazer uma subida de nível">−</button>
                  <div className={`${inputClass} text-center font-bold`}>NC {ncAtual}</div>
                  <button type="button" onClick={() => mudarNc(1)} className={stepButton} title="Subir de nível: +6 atributos, +4 perícias, +2 poderes">+</button>
                </div>
              ) : <div className={`${inputClass} text-zinc-400`}>NC {ncAtual} (o Mestre sobe o nível)</div>}
            </Field>
          </div>
          <Field label="Conceito"><textarea value={data.concept || ''} onChange={(e) => updateData('concept', e.target.value)} className={`${inputClass} min-h-16 resize-y`} placeholder="Quem é seu personagem? Qual seu estilo?" /></Field>
          <Field label="História"><textarea value={data.history || ''} onChange={(e) => updateData('history', e.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Família, objetivos, passado..." /></Field>
          <div className="rounded border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-400">Todo personagem começa no <b className="text-zinc-200">NC 4 · Genin</b>. Cada nível a mais dá <b className="text-zinc-200">+6 em Atributos, +4 em Perícias e +2 em Poderes</b> (pág. 31). {isGM ? 'Use o + do Nível de Campanha para subir o personagem e depois salve a ficha.' : 'Quando o Mestre subir seu nível, os pontos novos aparecem aqui na ficha.'}</div>
        </section>}

        {activeTab === 'atributos' && <section className="space-y-3">
          <PointsBar label="Pontos de Atributos" spent={attributeSpent} total={ATTR_TOTAL} />
          <p className="text-xs text-zinc-500">{evolucao ? `Você tem ${ATTR_TOTAL} pontos no total (pode guardar os novos para depois).` : `Distribua os ${ATTR_TOTAL} pontos.`} Nenhum atributo passa do NC {ncAtual}{minAtributo > 0 ? ` e todos precisam ser pelo menos ${minAtributo}` : ''}.</p>
          {ATTRIBUTES.map((attr) => <div key={attr.key} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 p-2">
            <div><p className="text-sm font-semibold">{attr.label}</p><p className="text-[10px] text-zinc-500">{attr.short}</p></div>
            <div className="flex items-center gap-2"><button onClick={() => updateNested('attributes', attr.key, Math.max(0, Number(attributes[attr.key] || 0) - 1))} className={stepButton}>−</button><span className="w-6 text-center font-black tabular-nums">{attributes[attr.key] || 0}</span><button disabled={attributeSpent >= ATTR_TOTAL || Number(attributes[attr.key] || 0) >= ncAtual} onClick={() => updateNested('attributes', attr.key, Math.min(ncAtual, Number(attributes[attr.key] || 0) + 1))} className={stepButton}>+</button></div>
          </div>)}
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><PointsBar label="Pontos Sociais" spent={socialSpent} total={SOCIAL_TOTAL} />{['carisma', 'manipulacao'].map((key) => <div key={key} className="mt-2 flex items-center justify-between text-sm"><span className="capitalize">{key}</span><div className="flex items-center gap-2"><button onClick={() => updateNested('social', key, Math.max(0, Number(social[key] || 0) - 1))} className={stepButton}>−</button><b>{social[key] || 0}</b><button disabled={socialSpent >= SOCIAL_TOTAL || Number(social[key] || 0) >= limiteMetade} onClick={() => updateNested('social', key, Math.min(limiteMetade, Number(social[key] || 0) + 1))} className={stepButton}>+</button></div></div>)}</div>
        </section>}

        {activeTab === 'pericias' && <section className="space-y-3">
          <PointsBar label="Pontos de Perícias" spent={skillSpent} total={SKILL_TOTAL} />
          <p className="text-xs text-zinc-500">Nível inicial = metade do atributo dependente, arredondada para cima. Cada ponto gasto aumenta a perícia em 1; limite de 2 pontos gastos por perícia no NC 4.</p>
          {SKILLS.map((skill) => {
            const locked = skill.unavailableAtNc4 && Number(draft.level || NC_DEFAULT) === 4;
            const spent = Number(skillSpending[skill.key] || 0);
            return <div key={skill.key} className={`rounded border p-2 ${locked ? 'border-zinc-900 bg-zinc-950 opacity-50' : 'border-zinc-800 bg-zinc-900'}`}>
              <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">{skill.label} {skill.trained && <span className="text-[9px] text-amber-400">TREINADA</span>}</p><p className="text-[10px] text-zinc-500">½ {ATTRIBUTES.find((a) => a.key === skill.attr)?.short} ({halfRoundedUp(attributes[skill.attr])}){locked ? ' · indisponível no NC 4' : ''}</p></div><div className="flex items-center gap-2"><span className="w-6 text-center text-sm font-black text-red-300">{locked || (skill.trained && spent < 1) ? '—' : derivedSkills[skill.key]}</span><button disabled={locked || spent <= 0} onClick={() => updateNested('skill_spending', skill.key, Math.max(0, spent - 1))} className={stepButton}>−</button><span className="w-4 text-center text-xs">{spent}</span><button disabled={locked || spent >= limiteMetade || skillSpent >= SKILL_TOTAL} onClick={() => updateNested('skill_spending', skill.key, Math.min(limiteMetade, spent + 1))} className={stepButton}>+</button></div></div>
            </div>;
          })}
        </section>}

        {activeTab === 'combate' && <section className="space-y-3">
          {regrasLivresMestre && (
            <div className="rounded border border-amber-700 bg-amber-950/40 p-2.5 text-xs text-amber-200 flex items-center justify-between">
              <span>✨ <b>Exceções do Mestre liberadas:</b> Você pode combinar poderes e aptidões de outros clãs (ex.: Satetsu + Kikaichuu). Divida seus pontos de Poder entre eles livremente!</span>
              <span className="text-[10px] bg-amber-900/80 px-2 py-0.5 rounded font-black text-amber-100">REGRAS LIVRES</span>
            </div>
          )}
          {prereqWarnings.length > 0 && (
            <div className="rounded border border-sky-800/70 bg-sky-950/30 p-2 text-xs text-sky-100">
              <p className="mb-1 font-bold">Pré-requisitos não cumpridos (o Mestre pode liberar):</p>
              <ul className="list-disc space-y-0.5 pl-4">{prereqWarnings.map((w) => <li key={w.nome}><b>{w.nome}</b> pede {w.falta.join(' e ')}</li>)}</ul>
            </div>
          )}
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><h3 className="mb-1 text-sm font-bold text-red-300">Habilidades de Combate</h3><p className="mb-3 text-[11px] text-zinc-500">Total = atributo + valor base. Cada base começa em 3; até 2 pontos podem ser redistribuídos entre elas.</p><div className="grid grid-cols-2 gap-2">{COMBAT.map((item) => <div key={item.key} className="rounded bg-zinc-950 p-2"><p className="text-[10px] text-zinc-400">{item.label}</p><p className="text-xl font-black">{Number(attributes[item.attr] || 0) + Number(combatBase[item.key] ?? 3)}</p><p className="text-[10px] text-zinc-500">Base {combatBase[item.key] ?? 3} + {item.short} {attributes[item.attr] || 0}</p><div className="mt-2 flex gap-2"><button onClick={() => updateNested('combat_base', item.key, Math.max(1, Number(combatBase[item.key] ?? 3) - 1))} className={stepButton}>−</button><button onClick={() => updateNested('combat_base', item.key, Number(combatBase[item.key] ?? 3) + 1)} className={stepButton}>+</button></div></div>)}</div><p className="mt-2 text-[10px] text-zinc-500">Pontos redistribuídos: {combatMoved}/2</p></div>
          <button onClick={rollInitiative} className="w-full rounded border border-red-900 bg-red-950/50 px-3 py-3 text-sm font-bold text-red-200 hover:bg-red-900/60">🎲 Rolar Iniciativa (1d8 + Agilidade + Prontidão)</button>
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><h3 className="mb-2 text-sm font-bold text-red-300">Aptidões e Poderes</h3><p className="mb-2 text-[11px] text-zinc-500">Escolha 3 aptidões gratuitas. Aptidões adicionais custam 2 pontos de Poder; cada nível de Poder custa 1 ponto.</p><AptitudePicker title="Aptidões gratuitas" fixedSlots list={freeAptList} onlyFree catalog={aptitudesCatalog} isGM={isGM} onCreate={createCatalogEntry} onChange={(next) => updateData('aptidoes_gratuitas_list', next)} /><PowerPicker list={powerList} context={powerContext} legacyText={legacyPowers} isGM={isGM} onCreate={createCatalogEntry} onChange={(next) => updateData('powers_list', next)} onClearLegacy={() => updateData('powers', '')} /><AptitudePicker title="Aptidões adicionais (2 pontos cada)" list={extraAptList} catalog={aptitudesCatalog} isGM={isGM} onCreate={createCatalogEntry} onChange={(next) => updateData('aptidoes_extra_list', next)} /><p className={`mt-2 text-xs font-bold ${powerSpent === POWER_TOTAL ? 'text-emerald-400' : 'text-amber-300'}`}>Pontos de Poder utilizados: {powerSpent}/{POWER_TOTAL}</p></div>
        </section>}

        {activeTab === 'equipamento' && <section className="space-y-3">
          <EquipmentEditor
            weaponItems={weaponItems}
            weaponsResolved={weaponsResolved}
            armorId={armor.id}
            hasHeavyArmorAptitude={hasHeavyArmorAptitude}
            attackContext={attackContext}
            isGM={isGM}
            onChange={updateEquipment}
          />
          <DefensePanel defenses={defenseValues} armor={armor} onRoll={rollDefense} />
          <AttackPanel weaponsResolved={weaponsResolved} attackContext={attackContext} onAttack={rollAttack} lastAttack={lastAttack} onClear={() => setLastAttack(null)} />
          <p className="text-[10px] text-zinc-500">Lembre de salvar a ficha depois de mudar o equipamento.</p>
        </section>}

        {activeTab === 'recursos' && <section className="space-y-3">
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">
            <h3 className="mb-2 text-sm font-bold text-red-300">Experiência e recompensas</h3>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400"><span>EXP (sobe o NC ao chegar em 100)</span><span>{Number(draft?.xp || 0)}/100</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-red-600" style={{ width: `${Math.min(100, Number(draft?.xp || 0))}%` }} /></div>
            <p className="mt-2 text-zinc-300">💰 {Number(draft?.ryo ?? 0)} Ryos</p>
            {evolucao && <p className="mt-1 text-zinc-400">Pontos de EXP recebidos: +{Math.floor(Number(ganho.atributos || 0))} atributo, +{Math.floor(Number(ganho.pericias || 0))} perícia, +{Math.floor(Number(ganho.poderes || 0))} poder.</p>}
            {kikaichuu && (
              <div className="mt-2 rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-zinc-200">🪲 Kikaichuu: {kikaichuu.disponiveis} de {kikaichuu.total}</p>
                  <div className="flex gap-1">
                    <button type="button" disabled={!kikaichuu.disponiveis} onClick={() => changeKikaichuu(-1)} title="Um kikaichuu foi destruído ou perdido" className="rounded border border-zinc-700 px-2 py-0.5 font-bold text-zinc-200 disabled:opacity-40">−1</button>
                    <button type="button" disabled={!kikaichuu.perdidos} onClick={() => changeKikaichuu(1)} title="Um kikaichuu voltou antes dos 2 dias" className="rounded border border-zinc-700 px-2 py-0.5 font-bold text-zinc-200 disabled:opacity-40">+1</button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">1 por nível de Lidar com Animais (100 insetos cada). Ataque de alvo único destrói 1; em área, todos da área. Cada perdido volta sozinho em 2 dias{kikaichuu.proxima ? ` — o próximo em ${new Date(kikaichuu.proxima).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
              </div>
            )}
            {(data.itens_recebidos || []).length > 0 && (
              <div className="mt-2"><p className="font-bold text-zinc-300">Itens recebidos</p>
                <ul className="list-disc pl-4 text-zinc-400">{data.itens_recebidos.map((item) => <li key={item.uid}>{item.nome}{item.quantidade > 1 ? ` ×${item.quantidade}` : ''}</li>)}</ul>
              </div>
            )}
          </div>
          <InventarioPanel
            inventario={Array.isArray(data.inventario) ? data.inventario : []}
            ryo={Number(draft?.ryo ?? 0)}
            onChange={(next) => updateData('inventario', next)}
            onRyo={(valor) => updateDraft('ryo', valor)}
          />
          <div className="grid grid-cols-2 gap-2"><ResourceCard label="Vitalidade máxima" value={vitalityMax} /><ResourceCard label="Chakra máximo" value={chakraMax} /></div>
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><h3 className="mb-3 text-sm font-bold text-red-300">Recursos atuais</h3><Field label={`Vitalidade atual (máx. ${vitalityMax})`}><input type="number" min="0" max={vitalityMax} value={draft.hp_current ?? vitalityMax} onChange={(e) => updateDraft('hp_current', Math.max(0, Math.min(vitalityMax, Number(e.target.value))))} className={inputClass} /></Field><Field label={`Chakra atual (máx. ${chakraMax})`}><input type="number" min="0" max={chakraMax} value={draft.chakra_current ?? chakraMax} onChange={(e) => updateDraft('chakra_current', Math.max(0, Math.min(chakraMax, Number(e.target.value))))} className={inputClass} /></Field><Field label="Ryos"><input type="number" min="0" value={draft.ryo ?? 100} onChange={(e) => updateDraft('ryo', Math.max(0, Number(e.target.value)))} className={inputClass} /></Field><p className="mt-2 text-[10px] text-zinc-500">Vitalidade = 10 + 3 × Vigor + 5 × NC. Chakra = 10 + 3 × Espírito. Genin começa com 100 Ryos para equipamentos.</p></div>
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><h3 className="text-sm font-bold text-red-300">Testes rápidos</h3><p className="mb-2 text-[10px] text-zinc-500">Sistema de testes do SNS: 2d8 + precisão.</p><div className="grid grid-cols-2 gap-2">{ATTRIBUTES.map((attr) => <button key={attr.key} onClick={() => rollTest(attr.label, attributes[attr.key])} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs font-semibold hover:border-red-600">🎲 {attr.label} ({attributes[attr.key]})</button>)}{SKILLS.filter((skill) => (!skill.unavailableAtNc4 || Number(draft.level || NC_DEFAULT) !== 4) && derivedSkills[skill.key] !== null).map((skill) => <button key={skill.key} onClick={() => rollTest(skill.label, derivedSkills[skill.key])} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs font-semibold hover:border-red-600">🎲 {skill.label} ({derivedSkills[skill.key]})</button>)}</div></div>
        </section>}
      </div>

      <div className="border-t border-zinc-800 bg-zinc-950 p-3"><div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500"><span>{character ? 'Personagem salvo' : 'Novo personagem'}</span><span>{validation.length ? `${validation.length} pendência(s)` : 'Pronto para salvar'}</span></div>{(() => {
        const order = tabs.map(([key]) => key);
        const next = order.find((key) => issuesByTab[key]?.length && key !== activeTab) || (!issuesByTab[activeTab]?.length ? order.find((key) => issuesByTab[key]?.length) : null);
        return next ? <button type="button" onClick={() => setActiveTab(next)} className="mb-2 w-full rounded border border-amber-600 bg-amber-950/40 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-900/50">Próximo passo: {tabs.find(([key]) => key === next)[1]} →</button> : null;
      })()}<button onClick={saveCharacter} disabled={saving} className="w-full rounded bg-red-700 px-4 py-3 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60">{saving ? 'Salvando...' : character ? 'Salvar ficha' : 'Criar personagem'}</button>{character && <button onClick={placeOnMap} disabled={placing} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-red-600 disabled:cursor-wait disabled:opacity-60">{placing ? 'Colocando...' : '📍 Colocar no mapa'}</button>}</div>
    </div>
  );

  // ---------------------------------------------------------------
  // MODO COMPACTO (painel lateral): só o necessário durante o jogo
  // ---------------------------------------------------------------
  const hpMax = Number(character?.hp_max ?? vitalityMax);
  const hpNow = Number(character?.hp_current ?? hpMax);
  const ckMax = Number(character?.chakra_max ?? chakraMax);
  const ckNow = Number(character?.chakra_current ?? ckMax);

  const compactSheet = (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">Naruto · Shinobi no Sho</p>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black">{character?.name || 'Sem personagem'}</h2>
            {character && <p className="truncate text-xs text-zinc-500">{[character.clan, character.rank, character.village].filter(Boolean).join(' · ')}</p>}
          </div>
          <span className="shrink-0 rounded border border-red-900 bg-red-950/60 px-2 py-1 text-xs font-bold text-red-300">NC {draft.level || NC_DEFAULT}</span>
        </div>
        <button onClick={() => setExpanded(true)} className="mt-3 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-bold text-zinc-200 transition hover:border-red-600 hover:text-white">⤢ {character ? 'Abrir ficha completa' : 'Criar personagem'}</button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {error && <div className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}
        {notice && <div className="rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-200">{notice}</div>}

        {!character && <div className="rounded border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-100">Você ainda não tem um personagem nesta mesa. Abra a ficha completa para criar seu Genin.</div>}

        {character && <>
          <ResourceBar label="Vitalidade" now={hpNow} max={hpMax} color="bg-emerald-500" onAdjust={(delta) => adjustResource('hp_current', 'hp_max', delta)} />
          <ResourceBar label="Chakra" now={ckNow} max={ckMax} color="bg-sky-500" onAdjust={(delta) => adjustResource('chakra_current', 'chakra_max', delta)} />

          <button onClick={rollInitiative} className="w-full rounded border border-red-900 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-900/60">🎲 Iniciativa</button>

          <AttackPanel compact weaponsResolved={weaponsResolved} attackContext={attackContext} onAttack={rollAttack} lastAttack={lastAttack} onClear={() => setLastAttack(null)} />
          <DefensePanel compact defenses={defenseValues} armor={armor} onRoll={rollDefense} />

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Testes rápidos · 2d8 + precisão</p>
            <div className="grid grid-cols-2 gap-1">
              {ATTRIBUTES.map((attr) => <button key={attr.key} onClick={() => rollTest(attr.label, attributes[attr.key])} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs hover:border-red-700"><span>{attr.label}</span><b className="tabular-nums text-red-300">+{attributes[attr.key] || 0}</b></button>)}
            </div>
          </div>

          <ModesPanel modes={normalizeModes(character.active_modes)} onAdd={addMode} onRemove={removeMode} />

          <div className="space-y-1">
            <AppearanceEditor value={figureDraft} onChange={setFigureDraft} />
            {figureChanged && (
              <button onClick={saveFigure} disabled={savingFigure} className="w-full rounded bg-red-700 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                {savingFigure ? 'Aplicando…' : '✓ Aplicar aparência no mapa'}
              </button>
            )}
          </div>

          <button onClick={placeOnMap} disabled={placing} className="w-full rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-red-600 disabled:cursor-wait disabled:opacity-60">{placing ? 'Colocando...' : '📍 Colocar no mapa'}</button>
        </>}
      </div>
    </div>
  );

  return (
    <>
      {compactSheet}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}>
          <div className="h-full w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-700 shadow-2xl">
            {fullSheet}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Seletores por combo box. O botão "+" (só para o Mestre) cria um item
// novo no catálogo desta mesa (tabela room_catalog).
// ---------------------------------------------------------------------

const CUSTOM_GROUP_LABEL = '★ Criados pelo Mestre';

function PowerPicker({ list, context, legacyText, isGM, onCreate, onChange, onClearLegacy }) {
  const [creatingFor, setCreatingFor] = useState(null); // índice da linha que pediu o "+", ou 'new'
  const catalog = context.catalog;
  const limit = maxPowerLevel(context.nc);
  const usedIds = list.map((item) => item.id);

  const updateItem = (index, patch) => onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeItem = (index) => onChange(list.filter((_, i) => i !== index));
  const addItem = () => {
    const firstFree = catalog.find((poder) => !usedIds.includes(poder.id));
    if (firstFree) onChange([...list, { id: firstFree.id, level: 1, name: '' }]);
  };

  const handleCreated = (newId) => {
    if (!newId) return;
    if (creatingFor === 'new') onChange([...list, { id: newId, level: 1, name: '' }]);
    else updateItem(creatingFor, { id: newId });
  };

  const renderOptions = (currentId) => <>
    {Object.entries(TIPOS_DE_PODER).map(([tipo, label]) => <optgroup key={tipo} label={label}>
      {catalog.filter((p) => !p.custom && p.tipo === tipo).map((p) => <option key={p.id} value={p.id} disabled={p.id !== currentId && usedIds.includes(p.id)}>{p.nome}</option>)}
    </optgroup>)}
    {catalog.some((p) => p.custom) && <optgroup label={CUSTOM_GROUP_LABEL}>
      {catalog.filter((p) => p.custom).map((p) => <option key={p.id} value={p.id} disabled={p.id !== currentId && usedIds.includes(p.id)}>{p.nome}</option>)}
    </optgroup>}
  </>;

  return <div className="mb-3">
    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-zinc-400">
      <span>Poderes</span>
      <span className="text-[10px] text-zinc-500">Nível máximo no NC {context.nc}: {limit}</span>
    </div>

    {legacyText && <div className="mb-2 rounded border border-amber-800/70 bg-amber-950/30 p-2 text-[11px] text-amber-100">
      Poderes digitados na versão antiga: <b>{legacyText.replace(/\n/g, ', ')}</b>. Escolha-os de novo abaixo e depois <button type="button" onClick={onClearLegacy} className="underline hover:text-white">apague este aviso</button>.
    </div>}

    <div className="space-y-2">
      {list.map((item, index) => {
        const poder = findPower(item.id, catalog);
        const problems = validatePower(item, context);
        const levelOptions = Array.from({ length: Math.max(limit, Number(item.level || 1)) }, (_, i) => i + 1);
        const requirements = describeRequirements(poder);

        return <div key={index} className={`rounded border p-2 ${problems.length ? 'border-amber-800/70 bg-amber-950/20' : 'border-zinc-800 bg-zinc-950'}`}>
          <div className="flex gap-1">
            <select value={item.id} onChange={(e) => updateItem(index, { id: e.target.value })} className={`${inputClass} min-w-0 flex-1 px-2`}>
              {!poder && <option value={item.id}>— escolha —</option>}
              {renderOptions(item.id)}
            </select>
            {isGM && <PlusButton title="Criar um poder novo para esta mesa" onClick={() => setCreatingFor(index)} />}
            <select value={item.level} onChange={(e) => updateItem(index, { level: Number(e.target.value) })} className={`${inputClass.replace('w-full', '')} w-20 shrink-0 px-2`} title="Nível (custa 1 ponto por nível)">
              {levelOptions.map((level) => <option key={level} value={level}>Nv {level}</option>)}
            </select>
            <RemoveButton onClick={() => removeItem(index)} />
          </div>

          {poder?.precisaNome && <input value={item.name || ''} onChange={(e) => updateItem(index, { name: e.target.value })} className={`${inputClass} mt-1`} placeholder="Nome do Ninpou (ex.: Ninpou: Hari Jizou)" />}

          {item.id === 'hibon_ninpou' && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              {[0, 1].map((slot) => {
                const atual = Array.isArray(item.hibon) ? item.hibon : ['dano', 'dano'];
                return (
                  <select key={slot} value={atual[slot]} title="Bonificação do Hibon Ninpou (pág. 212)"
                    onChange={(e) => { const next = [...atual]; next[slot] = e.target.value; updateItem(index, { hibon: next }); }}
                    className={inputClass}>
                    <option value="dano">+1 de dano (pode 2×)</option>
                    <option value="dureza" disabled={atual[1 - slot] === 'dureza'}>+2 de dureza</option>
                    <option value="dificuldade" disabled={atual[1 - slot] === 'dificuldade'}>+1 na Dif de resistência</option>
                  </select>
                );
              })}
            </div>
          )}
          {item.id === 'versatilidade' && <VersatilidadePicker item={item} onChange={(patch) => updateItem(index, patch)} />}
          {usaEfeitos(item.id) && <EffectPicker item={item} onChange={(patch) => updateItem(index, patch)} />}

          {poder && <p className="mt-1 text-[10px] text-zinc-500">{poder.resumo} <span className="text-zinc-600">· {poder.custom ? 'criado pelo Mestre' : `pág. ${poder.pagina}`}{requirements ? ` · requer ${requirements}` : ''}</span></p>}
          {problems.map((problem) => <p key={problem} className="mt-1 text-[10px] font-bold text-amber-300">⚠ {problem}</p>)}
        </div>;
      })}
    </div>

    <div className="mt-2 flex gap-1">
      <button type="button" onClick={addItem} disabled={usedIds.length >= catalog.length} className="flex-1 rounded border border-dashed border-zinc-700 py-2 text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-white disabled:opacity-40">+ Adicionar poder</button>
      {isGM && <button type="button" onClick={() => setCreatingFor('new')} className="rounded border border-dashed border-amber-800 px-3 text-xs font-bold text-amber-300 hover:border-amber-500" title="Criar um poder novo para esta mesa">★ Novo poder</button>}
    </div>

    {creatingFor !== null && <CatalogCreator kind="poder" onCreate={onCreate} onCreated={handleCreated} onClose={() => setCreatingFor(null)} />}
  </div>;
}

/**
 * Efeitos do Ninpou/elementos (págs. 91–113): 1 efeito por nível do poder, em ordem.
 * Escolher de novo um efeito já escolhido = evoluir esse efeito.
 */
function EffectPicker({ item, onChange }) {
  const level = Number(item.level || 1);
  const escolhas = Array.isArray(item.efeitos) ? item.efeitos : [];
  const nomes = Array.isArray(item.jutsus) ? item.jutsus : [];
  const opcoes = efeitosDoPoder(item.id);
  const problemas = validarEfeitos(item.id, escolhas, level);

  const setSlot = (slot, id) => {
    const next = Array.from({ length: level }, (_, i) => escolhas[i] || '');
    next[slot] = id;
    onChange({ efeitos: next });
  };
  const setNome = (slot, nome) => {
    const next = Array.from({ length: level }, (_, i) => nomes[i] || '');
    next[slot] = nome;
    onChange({ jutsus: next });
  };

  return <div className="mt-2 space-y-1 rounded border border-zinc-800 bg-zinc-900/60 p-2">
    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Efeitos (1 por nível · repetir = evoluir)</p>
    {Array.from({ length: level }, (_, slot) => {
      const nivel = slot + 1;
      const atual = escolhas[slot] || '';
      const antes = escolhas.slice(0, slot);
      const efeito = findEfeito(atual);
      return <div key={slot} className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1">
        <span className="text-[11px] font-bold text-zinc-400">Nv {nivel}</span>
        <select value={atual} onChange={(e) => setSlot(slot, e.target.value)} className={`${inputClass} px-1 py-1 text-xs`} title={efeito?.resumo || ''}>
          <option value="">— escolha —</option>
          {opcoes.filter((e) => e.nivel <= nivel).map((e) => {
            const vezes = antes.filter((id) => id === e.id).length;
            const evo = vezes ? (e.evolucoes || [])[vezes - 1] : null;
            const label = vezes ? (evo ? `↑ ${e.nome} Nv ${evo.nivel}` : null) : `${e.nome} (Nv ${e.nivel})`;
            if (!label && e.id !== atual) return null;
            const disabled = vezes > 0 && (!evo || evo.nivel > nivel) && e.id !== atual;
            return <option key={e.id} value={e.id} disabled={disabled}>{label || e.nome}</option>;
          })}
        </select>
        <input value={nomes[slot] || ''} onChange={(e) => setNome(slot, e.target.value)} placeholder="Nome do jutsu (opcional)" className={`${inputClass} px-2 py-1 text-xs`} />
      </div>;
    })}
    {problemas.map((p) => <p key={p} className="text-[10px] font-bold text-amber-300">⚠ {p}</p>)}
  </div>;
}

/** Mochila: compra itens da tabela (pág. 140) e conta os compartimentos (pág. 126). */
function InventarioPanel({ inventario, ryo, onChange, onRyo }) {
  const [escolha, setEscolha] = useState(ITENS_GERAIS[0].id);
  const comp = compartimentos(inventario);
  const info = findItem(escolha);
  const mudar = (id, delta) => {
    const atual = inventario.find((i) => i.id === id);
    const qtd = Math.max(0, Number(atual?.qtd || 0) + delta);
    const resto = inventario.filter((i) => i.id !== id);
    onChange(qtd ? [...resto, { id, qtd }] : resto);
  };
  const comprar = () => {
    if (!info) return;
    if (ryo < info.preco) { alert(`Faltam ${info.preco - ryo} Ryos.`); return; }
    onRyo(ryo - info.preco);
    if (ITENS_GERAIS.includes(info)) mudar(info.id, 1);
  };

  return <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">
    <h3 className="mb-1 text-sm font-bold text-red-300">🎒 Itens e compras</h3>
    <p className="mb-2 text-[10px] text-zinc-500">Compartimentos ocupados: <b className={comp.excedentes ? 'text-amber-300' : 'text-zinc-300'}>{comp.ocupados}</b> · bolsas e mochila dão {comp.fornecidos}. Até 3 sem penalidade; cada um a mais: −3 m de deslocamento (mín. 10 m) e −1 nos testes de mobilidade, Força ou Agilidade (pág. 126). Armas que não são de arremesso ocupam 1 cada (conte à parte).</p>
    {comp.excedentes > 0 && <p className="mb-2 font-bold text-amber-300">⚠ {comp.excedentes} compartimento(s) a mais: −{3 * comp.excedentes} m e −{comp.excedentes} de precisão.</p>}
    <div className="flex gap-1">
      <select value={escolha} onChange={(e) => setEscolha(e.target.value)} className={`${inputClass} px-1 py-1 text-xs`}>
        <optgroup label="Itens">{ITENS_GERAIS.map((i) => <option key={i.id} value={i.id}>{i.nome} — {i.preco} Ryos</option>)}</optgroup>
        <optgroup label="Serviços e animais (só paga)">{SERVICOS.map((i) => <option key={i.id} value={i.id}>{i.nome} — {i.preco} Ryos</option>)}</optgroup>
      </select>
      <button type="button" onClick={comprar} className="shrink-0 rounded bg-emerald-700 px-3 font-bold text-white hover:bg-emerald-600">Comprar</button>
    </div>
    {inventario.length > 0 && <ul className="mt-2 space-y-1">
      {inventario.map((entrada) => {
        const i = findItem(entrada.id);
        return <li key={entrada.id} className="flex items-center justify-between gap-2 rounded bg-zinc-950 px-2 py-1">
          <span className="text-zinc-200">{i?.nome || entrada.id} <span className="text-zinc-500">×{entrada.qtd}</span></span>
          <span className="flex gap-1">
            <button type="button" onClick={() => mudar(entrada.id, -1)} title="Usar ou perder 1" className="rounded border border-zinc-700 px-2">−</button>
            <button type="button" onClick={() => mudar(entrada.id, 1)} title="Ganhou mais 1 (sem pagar)" className="rounded border border-zinc-700 px-2">+</button>
          </span>
        </li>;
      })}
    </ul>}
  </div>;
}

function VersatilidadePicker({ item, onChange }) {
  const level = Number(item.level || 1);
  const versateis = Array.isArray(item.versateis) ? item.versateis : ['', ''];
  const slots = Array.isArray(item.efeitos) ? item.efeitos : [];
  const problemas = validarVersatilidade(item);
  const setVersatil = (i, poder) => { const next = [versateis[0] || '', versateis[1] || '']; next[i] = poder; onChange({ versateis: next }); };
  const setNivel1 = (poder, id) => onChange({ nivel1: { ...(item.nivel1 || {}), [poder]: id } });
  const setSlot = (slot, valor) => { const next = Array.from({ length: level }, (_, i) => slots[i] || ''); next[slot] = valor; onChange({ efeitos: next }); };
  const escolhidos = versateis.filter((p) => ELEMENTOS[p]);

  return <div className="mt-2 space-y-1 rounded border border-zinc-800 bg-zinc-900/60 p-2">
    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Poderes versáteis</p>
    <div className="grid grid-cols-2 gap-1">
      {[0, 1].map((i) => (
        <select key={i} value={versateis[i] || ''} onChange={(e) => setVersatil(i, e.target.value)} className={`${inputClass} px-1 py-1 text-xs`}>
          <option value="">— escolha —</option>
          {PODERES_VERSATEIS.map((p) => <option key={p} value={p} disabled={versateis[1 - i] === p}>{ELEMENTOS[p].nome}</option>)}
        </select>
      ))}
    </div>
    {escolhidos.map((p) => (
      <div key={p} className="grid grid-cols-[2.2rem_1fr] items-center gap-1">
        <span className="text-[11px] font-bold text-zinc-400">Nv 1</span>
        <select value={item.nivel1?.[p] || 'canhao'} onChange={(e) => setNivel1(p, e.target.value)} className={`${inputClass} px-1 py-1 text-xs`}>
          {efeitosDoPoder(p).filter((e) => e.nivel <= 1).map((e) => <option key={e.id} value={e.id}>{ELEMENTOS[p].nome}: {e.nome}</option>)}
        </select>
      </div>
    ))}
    {Array.from({ length: Math.max(0, level - 1) }, (_, k) => {
      const slot = k + 1;
      return <div key={slot} className="grid grid-cols-[2.2rem_1fr] items-center gap-1">
        <span className="text-[11px] font-bold text-zinc-400">Nv {slot + 1}</span>
        <select value={slots[slot] || ''} onChange={(e) => setSlot(slot, e.target.value)} className={`${inputClass} px-1 py-1 text-xs`}>
          <option value="">— escolha —</option>
          {escolhidos.map((p) => (
            <optgroup key={p} label={`${ELEMENTOS[p].nome} versátil`}>
              {efeitosDoPoder(p).filter((e) => e.nivel <= slot + 1).map((e) => <option key={e.id} value={`${p}:${e.id}`}>{e.nome} (Nv {e.nivel})</option>)}
            </optgroup>
          ))}
        </select>
      </div>;
    })}
    {problemas.map((p) => <p key={p} className="text-[10px] font-bold text-amber-300">⚠ {p}</p>)}
  </div>;
}

function AptitudePicker({ title, list, fixedSlots = false, onlyFree = false, catalog, isGM, onCreate, onChange }) {
  const [creatingFor, setCreatingFor] = useState(null);

  const updateItem = (index, patch) => onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeItem = (index) => onChange(fixedSlots ? list.map((item, i) => (i === index ? { id: '', complemento: '' } : item)) : list.filter((_, i) => i !== index));
  const addItem = () => onChange([...list, { id: '', complemento: '' }]);

  const handleCreated = (newId) => {
    if (!newId) return;
    if (creatingFor === 'new') onChange([...list, { id: newId, complemento: '' }]);
    else updateItem(creatingFor, { id: newId, complemento: '' });
  };

  const options = catalog.filter((aptidao) => !onlyFree || aptidao.gratuita);

  return <div className="mb-3">
    <p className="mb-1 text-xs font-semibold text-zinc-400">{title}</p>
    <div className="space-y-2">
      {list.map((item, index) => {
        const aptidao = findAptitude(item.id, catalog);
        const categoria = aptidao ? CATEGORIAS_APTIDAO[aptidao.categoria] : null;

        return <div key={index} className="rounded border border-zinc-800 bg-zinc-950 p-2">
          <div className="flex gap-1">
            <select value={item.id} onChange={(e) => updateItem(index, { id: e.target.value, complemento: '' })} className={`${inputClass} min-w-0 flex-1 px-2`}>
              <option value="">— escolha uma aptidão —</option>
              {Object.entries(CATEGORIAS_APTIDAO).map(([key, cat]) => {
                const items = options.filter((apt) => !apt.custom && apt.categoria === key);
                return items.length ? <optgroup key={key} label={cat.nome}>{items.map((apt) => <option key={apt.id} value={apt.id}>{apt.nome}</option>)}</optgroup> : null;
              })}
              {options.some((apt) => apt.custom) && <optgroup label={CUSTOM_GROUP_LABEL}>
                {options.filter((apt) => apt.custom).map((apt) => <option key={apt.id} value={apt.id}>{apt.nome}</option>)}
              </optgroup>}
            </select>
            {isGM && <PlusButton title="Criar uma aptidão nova para esta mesa" onClick={() => setCreatingFor(index)} />}
            <RemoveButton onClick={() => removeItem(index)} />
          </div>

          {aptidao?.complemento && <ComplementInput aptidao={aptidao} value={item.complemento || ''} onChange={(value) => updateItem(index, { complemento: value })} />}

          {item.legacy && !aptidao && <p className="mt-1 text-[10px] font-bold text-amber-300">⚠ “{item.legacy}” (versão antiga) não foi encontrada no livro. Escolha na lista.</p>}
          {aptidao && <p className="mt-1 text-[10px] text-zinc-500">{aptidao.resumo} <span className="text-zinc-600">· {aptidao.custom ? 'criada pelo Mestre' : `${categoria?.nome} · pág. ${categoria?.pagina}+`}</span></p>}
        </div>;
      })}
    </div>

    {!fixedSlots && <div className="mt-2 flex gap-1">
      <button type="button" onClick={addItem} className="flex-1 rounded border border-dashed border-zinc-700 py-2 text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-white">+ Adicionar aptidão</button>
      {isGM && <button type="button" onClick={() => setCreatingFor('new')} className="rounded border border-dashed border-amber-800 px-3 text-xs font-bold text-amber-300 hover:border-amber-500">★ Nova aptidão</button>}
    </div>}

    {creatingFor !== null && <CatalogCreator kind="aptidao" onCreate={onCreate} onCreated={handleCreated} onClose={() => setCreatingFor(null)} />}
  </div>;
}

/** Aptidões genéricas: escolha da categoria (perícia, atributo ou texto). */
function ComplementInput({ aptidao, value, onChange }) {
  if (aptidao.complemento === 'pericia') {
    return <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1 px-2`}>
      <option value="">— escolha a perícia —</option>
      {SKILLS.map((skill) => <option key={skill.key} value={skill.label}>{skill.label}</option>)}
    </select>;
  }
  if (aptidao.complemento === 'atributo') {
    return <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1 px-2`}>
      <option value="">— escolha o atributo —</option>
      {ATTRIBUTES.map((attr) => <option key={attr.key} value={attr.label}>{attr.label}</option>)}
    </select>;
  }
  // Listas prontas no lugar de digitar (o nome precisa bater com a arma para tirar o −3).
  const choices = aptidao.nome === 'Usar Arma'
    ? ARMAS.filter((arma) => arma.categoria === 'marcial').map((arma) => arma.nome)
    : aptidao.nome === 'Especialista'
      ? Object.values(GRUPOS_DE_ARMA)
      : /\sou\s/.test(aptidao.dica || '') ? aptidao.dica.split(/\s+ou\s+|,\s*/) : null;
  if (choices) {
    return <div className="mt-1">
      <ListOrOther value={value} onChange={onChange} emptyLabel={`— escolha: ${aptidao.dica || 'opção'} —`}
        groups={[{ options: choices.map((choice) => ({ value: choice, label: choice })) }]} known={choices} placeholder={aptidao.dica || 'Categoria'} />
    </div>;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1`} placeholder={aptidao.dica || 'Categoria'} />;
}

/** Formulário do Mestre para criar um poder ou aptidão novo na mesa. */
function CatalogCreator({ kind, onCreate, onCreated, onClose }) {
  const isPower = kind === 'poder';
  const [form, setForm] = useState({
    nome: '',
    tipo: isPower ? 'geral' : 'gerais',
    resumo: '',
    gratuita: false,
    reqAttr: '',
    reqValue: 1,
  });
  const [saving, setSaving] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.nome.trim() || saving) return;

    setSaving(true);
    const requisitos = isPower && form.reqAttr ? { atributos: { [form.reqAttr]: Number(form.reqValue) } } : {};
    const newId = await onCreate({
      kind,
      nome: form.nome.trim(),
      tipo: form.tipo,
      resumo: form.resumo.trim(),
      gratuita: !isPower && form.gratuita,
      requisitos,
    });
    setSaving(false);

    if (newId) {
      onCreated(newId);
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-amber-800 bg-zinc-900 p-4 text-zinc-100 shadow-2xl">
        <div>
          <h3 className="text-base font-black text-amber-300">★ {isPower ? 'Novo poder' : 'Nova aptidão'} da mesa</h3>
          <p className="text-[11px] text-zinc-500">Fica disponível para todos os jogadores desta mesa.</p>
        </div>

        <Field label="Nome"><input autoFocus value={form.nome} onChange={(e) => set('nome', e.target.value)} className={inputClass} placeholder={isPower ? 'Ex.: Hyouton (Elemento Gelo)' : 'Ex.: Mestre das Marionetes'} /></Field>

        <Field label={isPower ? 'Tipo' : 'Categoria'}>
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputClass}>
            {isPower
              ? Object.entries(TIPOS_DE_PODER).map(([key, label]) => <option key={key} value={key}>{label}</option>)
              : Object.entries(CATEGORIAS_APTIDAO).map(([key, cat]) => <option key={key} value={key}>{cat.nome}</option>)}
          </select>
        </Field>

        <Field label="Descrição curta"><textarea value={form.resumo} onChange={(e) => set('resumo', e.target.value)} className={`${inputClass} min-h-16`} placeholder="O que faz, em uma frase" /></Field>

        {isPower && <Field label="Pré-requisito de atributo (opcional)">
          <div className="flex gap-1">
            <select value={form.reqAttr} onChange={(e) => set('reqAttr', e.target.value)} className={`${inputClass} flex-1`}>
              <option value="">Nenhum</option>
              {Object.entries(NOMES_DE_ATRIBUTOS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            {form.reqAttr && <input type="number" min="1" value={form.reqValue} onChange={(e) => set('reqValue', e.target.value)} className={`${inputClass} w-20`} />}
          </div>
        </Field>}

        {!isPower && <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={form.gratuita} onChange={(e) => set('gratuita', e.target.checked)} /> Pode ser escolhida como aptidão gratuita</label>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!form.nome.trim() || saving} className="flex-1 rounded bg-amber-600 py-2 text-sm font-bold text-black hover:bg-amber-500 disabled:opacity-50">{saving ? 'Criando...' : 'Criar'}</button>
          <button type="button" onClick={onClose} className="rounded border border-zinc-700 px-4 text-sm text-zinc-300 hover:text-white">Cancelar</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function PlusButton({ title, onClick }) {
  return <button type="button" onClick={onClick} title={title} className="rounded border border-amber-800 px-2 text-sm font-black text-amber-300 hover:border-amber-500">+</button>;
}

function RemoveButton({ onClick }) {
  return <button type="button" onClick={onClick} title="Remover" className="rounded border border-zinc-700 px-2 text-zinc-400 hover:border-red-600 hover:text-red-300">✕</button>;
}

/**
 * Modos e efeitos com duração (Portões Internos, Marca da Maldição, Modo Sábio…).
 * A cada turno do personagem no combate, o sistema desconta o dreno e a duração.
 */
function ModesPanel({ modes, onAdd, onRemove }) {
  const empty = { name: '', turns: '', chakra: '', hp: '' };
  const [form, setForm] = useState(null); // null = formulário fechado
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onAdd({
      name: form.name.trim(),
      turns: form.turns === '' ? null : Math.max(1, Number(form.turns)),
      drain: { chakra: Math.max(0, Number(form.chakra || 0)), hp: Math.max(0, Number(form.hp || 0)) },
    });
    setForm(null);
  };

  return <div className="rounded border border-zinc-800 bg-zinc-900 p-2">
    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Modos e efeitos</p>

    {modes.length === 0 && !form && <p className="text-[11px] text-zinc-600">Nenhum modo ativo.</p>}

    <div className="space-y-1">
      {modes.map((mode) => {
        const drain = [mode.drain?.chakra ? `−${mode.drain.chakra} CK` : null, mode.drain?.hp ? `−${mode.drain.hp} VIT` : null].filter(Boolean).join(' · ');
        return <div key={mode.id} className="flex items-center gap-2 rounded border border-sky-900/60 bg-sky-950/30 px-2 py-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-sky-200">{mode.name}</p>
            <p className="text-[10px] text-zinc-400">{mode.turns == null ? 'sem limite' : `${mode.turns} turno${mode.turns > 1 ? 's' : ''}`}{drain ? ` · ${drain}/turno` : ''}</p>
          </div>
          <button type="button" onClick={() => onRemove(mode.id)} title="Desativar" className="text-xs text-zinc-500 hover:text-red-400">✕</button>
        </div>;
      })}
    </div>

    {form ? <form onSubmit={submit} className="mt-2 space-y-1">
      <input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome (ex.: 1º Portão)" className={inputClass} />
      <div className="grid grid-cols-3 gap-1">
        <input type="number" min="1" value={form.turns} onChange={(e) => set('turns', e.target.value)} placeholder="Turnos" title="Duração em turnos (vazio = sem limite)" className={`${inputClass} px-2`} />
        <input type="number" min="0" value={form.chakra} onChange={(e) => set('chakra', e.target.value)} placeholder="−CK" title="Dreno de Chakra por turno" className={`${inputClass} px-2`} />
        <input type="number" min="0" value={form.hp} onChange={(e) => set('hp', e.target.value)} placeholder="−VIT" title="Dreno de Vitalidade por turno" className={`${inputClass} px-2`} />
      </div>
      <p className="text-[10px] text-zinc-600">O turno de ativação conta como o 1º. Vazio em Turnos = até desativar.</p>
      <div className="flex gap-1">
        <button type="submit" disabled={!form.name.trim()} className="flex-1 rounded bg-sky-700 py-1.5 text-xs font-bold hover:bg-sky-600 disabled:opacity-40">Ativar</button>
        <button type="button" onClick={() => setForm(null)} className="rounded border border-zinc-700 px-3 text-xs text-zinc-400 hover:text-white">Cancelar</button>
      </div>
    </form> : <button type="button" onClick={() => setForm(empty)} className="mt-2 w-full rounded border border-dashed border-zinc-700 py-1.5 text-xs font-bold text-zinc-400 hover:border-sky-600 hover:text-white">+ Ativar modo</button>}
  </div>;
}

function ResourceBar({ label, now, max, color, onAdjust }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (now / max) * 100)) : 0;
  return <div className="rounded border border-zinc-800 bg-zinc-900 p-2">
    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-bold text-zinc-300">{label}</span><span className="font-black tabular-nums">{now}/{max}</span></div>
    <div className="mb-2 h-2 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${percent}%` }} /></div>
    <div className="grid grid-cols-4 gap-1">
      {[-5, -1, 1, 5].map((delta) => <button key={delta} onClick={() => onAdjust(delta)} className="rounded border border-zinc-700 bg-zinc-950 py-1 text-xs font-bold text-zinc-300 hover:border-red-600">{delta > 0 ? `+${delta}` : delta}</button>)}
    </div>
  </div>;
}

const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-red-500';
const stepButton = 'h-7 w-7 rounded border border-zinc-700 bg-zinc-950 text-sm font-bold text-zinc-200 hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-30';

/**
 * Lista (combo box) com a opção "Outro…": só digita se não estiver na lista.
 * groups: [{ label?, options: [{ value, label }] }] · known: valores da lista
 */
function ListOrOther({ value, onChange, groups, known, emptyLabel = null, placeholder = '' }) {
  const isKnown = !value || known.includes(value);
  const [other, setOther] = useState(!isKnown);
  const selectValue = other ? '__outro__' : value || '';
  return <div className="space-y-1">
    <select value={selectValue} className={inputClass}
      onChange={(e) => {
        if (e.target.value === '__outro__') { setOther(true); onChange(''); return; }
        setOther(false);
        onChange(e.target.value);
      }}>
      {emptyLabel !== null && <option value="">{emptyLabel}</option>}
      {groups.map((group, index) => group.label
        ? <optgroup key={group.label} label={group.label}>{group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        : group.options.map((o) => <option key={`${index}-${o.value}`} value={o.value}>{o.label}</option>))}
      <option value="__outro__">Outro… (digitar)</option>
    </select>
    {other && <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder={placeholder} />}
  </div>;
}

function Field({ label, children }) {
  return <label className="mb-2 block text-xs font-semibold text-zinc-400">{label}<span className="mt-1 block">{children}</span></label>;
}
function PointsBar({ label, spent, total }) {
  const percent = Math.min(100, Math.max(0, (spent / total) * 100));
  return <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-bold text-zinc-200">{label}</span><span className={`text-xs font-black tabular-nums ${spent === total ? 'text-emerald-400' : spent > total ? 'text-red-400' : 'text-amber-300'}`}>{spent}/{total}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${spent === total ? 'bg-emerald-500' : spent > total ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${percent}%` }} /></div></div>;
}
function ResourceCard({ label, value }) {
  return <div className="rounded border border-zinc-800 bg-zinc-900 p-3"><p className="text-[10px] text-zinc-500">{label}</p><p className="text-2xl font-black text-red-300">{value}</p></div>;
}

// ---------------------------------------------------------------------
// Equipamento: armas e armadura (tabelas das págs. 137–139)
// ---------------------------------------------------------------------

const EMPTY_CUSTOM = { nome: '', dano: 2, ataque: 'cc', alcance: 0, critico: 15 };

function EquipmentEditor({ weaponItems, weaponsResolved, armorId, hasHeavyArmorAptitude, attackContext, isGM, onChange }) {
  const [pick, setPick] = useState('');
  const [custom, setCustom] = useState(null);

  const groups = ['simples', 'marcial'].flatMap((categoria) => Object.keys(GRUPOS_DE_ARMA)
    .filter((grupo) => grupo !== 'desarmado')
    .map((grupo) => ({ categoria, grupo, armas: ARMAS.filter((a) => a.categoria === categoria && a.grupo === grupo) }))
    .filter((g) => g.armas.length));

  const addWeapon = () => {
    if (!pick) return;
    const base = ARMAS.find((a) => a.id === pick);
    onChange({ weapons: [...weaponItems, { uid: uid(), id: pick, quantidade: base?.unidades || null, duasMaos: false }] });
    setPick('');
  };

  const addCustom = () => {
    if (!custom?.nome.trim()) return;
    onChange({
      weapons: [...weaponItems, {
        uid: uid(),
        custom: true,
        nome: custom.nome.trim(),
        dano: Number(custom.dano) || 0,
        ataque: custom.ataque,
        alcance: custom.ataque === 'cc' ? null : Number(custom.alcance) || 0,
        critico: Number(custom.critico) || 15,
        grupo: custom.ataque === 'cc' ? 'mediana' : 'arremesso',
      }],
    });
    setCustom(null);
  };

  const updateItem = (uid, changes) => onChange({ weapons: weaponItems.map((item) => (item.uid === uid ? { ...item, ...changes } : item)) });
  const removeItem = (uid) => onChange({ weapons: weaponItems.filter((item) => item.uid !== uid) });

  return (
    <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-3">
      <div>
        <h3 className="mb-1 text-sm font-bold text-red-300">Armas</h3>
        <p className="mb-2 text-[10px] text-zinc-500">
          Dano base = metade da FOR (corpo a corpo) ou da DES (à distância), arredondada para cima, + dano da arma.
          Armas marciais sem a aptidão Usar Arma têm −3 de precisão. 1 bloco = {METROS_POR_BLOCO} m.
        </p>

        <div className="flex gap-1">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputClass}>
            <option value="">Escolher arma do livro…</option>
            {groups.map((g) => (
              <optgroup key={`${g.categoria}-${g.grupo}`} label={`${g.categoria === 'simples' ? 'Simples' : 'Marciais'} · ${GRUPOS_DE_ARMA[g.grupo]}`}>
                {g.armas.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.semDano ? '' : ` (${a.danoFixo != null ? `dano ${a.danoFixo}` : `+${a.dano}`})`}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={addWeapon} disabled={!pick} className="shrink-0 rounded bg-red-700 px-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40">Adicionar</button>
        </div>

        {isGM && !custom && (
          <button type="button" onClick={() => setCustom({ ...EMPTY_CUSTOM })} className="mt-1 w-full rounded border border-dashed border-zinc-700 py-1 text-[11px] font-bold text-zinc-400 hover:border-red-600 hover:text-white">
            + Arma personalizada (Mestre)
          </button>
        )}
        {isGM && custom && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-[11px]">
            <input value={custom.nome} onChange={(e) => setCustom({ ...custom, nome: e.target.value })} placeholder="Nome da arma" className={`${inputClass} col-span-2`} />
            <label className="text-zinc-500">Dano de arma
              <input type="number" value={custom.dano} onChange={(e) => setCustom({ ...custom, dano: e.target.value })} className={inputClass} />
            </label>
            <label className="text-zinc-500">Ataque
              <select value={custom.ataque} onChange={(e) => setCustom({ ...custom, ataque: e.target.value })} className={inputClass}>
                <option value="cc">Corpo a corpo (CC)</option>
                <option value="cd">À distância (CD)</option>
                <option value="cc_cd">Os dois</option>
              </select>
            </label>
            {custom.ataque !== 'cc' && (
              <label className="text-zinc-500">Alcance (m)
                <input type="number" value={custom.alcance} onChange={(e) => setCustom({ ...custom, alcance: e.target.value })} className={inputClass} />
              </label>
            )}
            <label className="text-zinc-500">Crítico a partir de
              <select value={custom.critico} onChange={(e) => setCustom({ ...custom, critico: e.target.value })} className={inputClass}>
                <option value={15}>15 (padrão)</option>
                <option value={14}>14</option>
                <option value={13}>13</option>
              </select>
            </label>
            <div className="col-span-2 flex gap-1">
              <button type="button" onClick={addCustom} className="flex-1 rounded bg-red-700 py-1 font-bold text-white hover:bg-red-600">Adicionar</button>
              <button type="button" onClick={() => setCustom(null)} className="rounded border border-zinc-700 px-2 text-zinc-400">Cancelar</button>
            </div>
          </div>
        )}

        <ul className="mt-2 space-y-1">
          {weaponsResolved.filter((entry) => entry.uid !== 'desarmado').map(({ uid, item, arma }) => {
            const modes = attackModes(arma, { ...attackContext, quantidade: item.quantidade, duasMaos: item.duasMaos });
            return (
              <li key={uid} className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{arma.nome} {arma.custom && <span className="text-[9px] text-amber-400">PERSONALIZADA</span>}</p>
                    <p className="text-[10px] text-zinc-500">
                      {[arma.categoria === 'marcial' ? 'Marcial' : 'Simples', GRUPOS_DE_ARMA[arma.grupo], arma.tipo,
                        arma.critico ? `crítico ${arma.critico}-16` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeItem(uid)} className="px-1 font-bold text-zinc-500 hover:text-red-400" title="Remover">✕</button>
                </div>

                {arma.unidades && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                    <label className="flex items-center gap-1">Lançar
                      <input type="number" min="1" max="18" value={item.quantidade ?? arma.unidades}
                        onChange={(e) => updateItem(uid, { quantidade: Number(e.target.value) || 1 })}
                        className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 text-white" />
                      por mão (mínimo {arma.unidades} para dar dano)
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={Boolean(item.duasMaos)} onChange={(e) => updateItem(uid, { duasMaos: e.target.checked })} />
                      Com as duas mãos
                    </label>
                  </div>
                )}

                {arma.semDano && <p className="mt-1 text-[10px] text-zinc-500">Sem dano direto{arma.area ? ` · área de ${arma.area} m de diâmetro` : ''}{arma.nota ? ` · ${arma.nota}` : ''}.</p>}
                {modes.map((modo) => (
                  <p key={modo.tipo} className="mt-1 text-[10px] text-zinc-400">
                    <b className="text-zinc-200">{modo.rotulo}</b>: precisão {modo.precisao} · dano base <b className="text-red-300">{modo.danoBase}</b> ({modo.formula})
                    {' · '}alcance {modo.alcanceM} m ({modo.alcanceBlocos} bl.)
                    {modo.area ? ` · área ${modo.area} m` : ''}
                    {modo.avisos.length > 0 && <span className="block text-amber-400/90">⚠ {modo.avisos.join(' · ')}</span>}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-bold text-red-300">Armadura</h3>
        <select value={armorId} onChange={(e) => onChange({ armor: e.target.value })} className={inputClass}>
          {ARMADURAS.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.absorcao ? ` (absorção ${a.absorcao})` : ''}</option>)}
        </select>
        {(() => {
          const a = ARMADURAS.find((item) => item.id === armorId) || ARMADURAS[0];
          const pen = a.tipo === 'pesada' && !hasHeavyArmorAptitude ? a.penalidadeSem : a.penalidade;
          return (
            <p className="mt-1 text-[10px] text-zinc-500">
              Absorção {a.absorcao} (funciona como Vitalidade extra; acaba primeiro) · penalidade {pen}
              {a.tipo === 'pesada' && !hasHeavyArmorAptitude ? ' (sem a aptidão Usar Armaduras Pesadas)' : ''}
              {pen ? ' na Esquiva e em Agilidade, Acrobacia, Atletismo, Escapar e Furtividade.' : '.'}
            </p>
          );
        })()}
      </div>
    </div>
  );
}

/** Defesas do livro (pág. 256): Esquiva é passiva; Bloquear e Antecipar são testes resistidos. */
function DefensePanel({ defenses, armor, onRoll, compact = false }) {
  const { esquiva, bloqueio, antecipar } = defenses;
  return (
    <div className={`rounded border border-zinc-800 ${compact ? 'bg-zinc-900/60 p-2' : 'bg-zinc-900 p-3'}`}>
      <p className={`${compact ? 'mb-1 text-[10px] uppercase tracking-wider text-zinc-500' : 'mb-2 text-sm text-red-300'} font-bold`}>Defesas</p>
      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded border border-zinc-800 bg-zinc-950 px-1 py-1.5" title="Reação sem teste: o atacante precisa tirar 9 + sua Esquiva">
          <p className="text-[10px] text-zinc-500">Esquiva</p>
          <p className="font-black text-sky-300">Dif {esquiva.dificuldade}</p>
          {esquiva.penalidade ? <p className="text-[9px] text-amber-400">{armor.nome}: {esquiva.penalidade}</p> : null}
        </div>
        <button type="button" disabled={!bloqueio.possivel} onClick={() => onRoll('Bloquear (CC)', bloqueio.precisao)}
          title={bloqueio.possivel ? 'Teste resistido: 2d8 + Combate Corporal' : 'Precisa de uma arma ou manopla nas mãos'}
          className="rounded border border-zinc-800 bg-zinc-950 px-1 py-1.5 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-40">
          <p className="text-[10px] text-zinc-500">🎲 Bloquear</p>
          <p className="font-black">2d8+{bloqueio.precisao}</p>
        </button>
        <button type="button" onClick={() => onRoll('Antecipar (LM)', antecipar.precisao)} title="Teste resistido: 2d8 + Ler Movimento"
          className="rounded border border-zinc-800 bg-zinc-950 px-1 py-1.5 hover:border-red-700">
          <p className="text-[10px] text-zinc-500">🎲 Antecipar</p>
          <p className="font-black">2d8+{antecipar.precisao}</p>
        </button>
      </div>
      {!compact && <p className="mt-1 text-[10px] text-zinc-500">Esquiva: sem teste, o atacante precisa de 9 + ESQ. Bloquear e Antecipar: quem tirar mais vence; empate vai para a maior precisão.</p>}
    </div>
  );
}

/** Botões de ataque: rola 2d8 + precisão e mostra o grau e o dano (dano base × grau). */
function AttackPanel({ weaponsResolved, attackContext, onAttack, lastAttack, onClear, compact = false }) {
  const entries = weaponsResolved.flatMap(({ uid, item, arma }) =>
    attackModes(arma, { ...attackContext, quantidade: item.quantidade, duasMaos: item.duasMaos })
      .map((modo) => ({ key: `${uid}-${modo.tipo}`, arma, modo })));

  return (
    <div className={`rounded border border-zinc-800 ${compact ? 'bg-zinc-900/60 p-2' : 'bg-zinc-900 p-3'}`}>
      <p className={`${compact ? 'mb-1 text-[10px] uppercase tracking-wider text-zinc-500' : 'mb-2 text-sm text-red-300'} font-bold`}>Ataques</p>
      <div className="space-y-1">
        {entries.map(({ key, arma, modo }) => (
          <button key={key} type="button" onClick={() => onAttack(arma, modo)}
            className="flex w-full items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-left text-xs hover:border-red-700">
            <span className="min-w-0">
              <span className="font-bold">⚔️ {arma.nome}</span>
              <span className="block truncate text-[10px] text-zinc-500">{modo.rotulo} · {modo.alcanceBlocos} bl.{modo.avisos.some((a) => a.startsWith('Sem Usar')) ? ' · −3' : ''}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="block font-black text-red-300">2d8+{modo.precisao}</span>
              <span className="block text-[10px] text-zinc-400">base {modo.danoBase}</span>
            </span>
          </button>
        ))}
      </div>

      {lastAttack && (
        <div className={`mt-2 rounded border p-2 text-xs ${lastAttack.falhaCritica ? 'border-zinc-700 bg-zinc-950' : lastAttack.critico ? 'border-amber-600 bg-amber-950/40' : 'border-red-900 bg-red-950/30'}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">{lastAttack.arma} · {lastAttack.modo}</p>
            <button type="button" onClick={onClear} className="text-zinc-500 hover:text-white">✕</button>
          </div>
          <p className="text-zinc-400">Dados [{lastAttack.dice.join(', ')}] → total <b className="text-white">{lastAttack.total}</b></p>
          {lastAttack.falhaCritica ? (
            <p className="font-bold text-zinc-300">Falha crítica! O ataque dá errado.</p>
          ) : (
            <>
              <p>
                {lastAttack.critico ? <b className="text-amber-300">ACERTO CRÍTICO! O alvo não pode se defender e fica sangrando. </b> : null}
                Grau {lastAttack.grau}: {lastAttack.danoBase} × {lastAttack.grau} = <b className="text-lg text-red-300">{lastAttack.dano}</b> de dano
              </p>
              {!lastAttack.critico && <p className="text-[10px] text-zinc-500">Acerta se o total ({lastAttack.total}) for ≥ à Dif da Esquiva do alvo, ou vencer o teste de Bloquear/Antecipar dele.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
