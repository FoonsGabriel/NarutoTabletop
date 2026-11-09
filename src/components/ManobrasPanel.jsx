import { useMemo, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { trackedUpdate } from '../services/Undo';
import { rollDice } from '../services/Rolls';
import { uid } from '../services/Uid';
import { slotsFor, useAction as registerAction } from '../services/Combat';
import { applySituation, combatProfile, forecast, resolveAttack } from '../services/Attack';
import { condicoesDe, novaCondicao } from '../data/Condicoes';
import { sizeAttackBonus, sizeInfo, sizeOf } from '../data/Tamanhos';

// =====================================================================
// Manobras de combate (Livro Básico, págs. 261–268) que não são um ataque comum.
// Cada uma gasta a ação do livro e aplica a condição certa no alvo ou em quem usou.
// =====================================================================

const MANOBRAS = [
  { id: 'defesa_total', nome: 'Defesa total', icone: '🧱', acao: 'padrao', pagina: 265,
    texto: '+3 na Esquiva e no Antecipar até o seu próximo turno. Não ataca e só anda com Passo Seguro.' },
  { id: 'fintar', nome: 'Fintar', icone: '🎭', acao: 'padrao', alvo: true, pagina: 263,
    texto: 'Agilidade contra a Prontidão do alvo. Se ganhar, ele fica fintado (−2 na defesa) contra o seu próximo ataque corpo a corpo. Uma vez por rodada.' },
  { id: 'agarrar', nome: 'Agarrar', icone: '🤼', acao: 'padrao', alvo: true, especial: true, pagina: 268,
    texto: 'CC −2 contra a defesa do alvo (mãos livres). Ele fica agarrado (impedido); você fica lento e gasta a Padrão para manter.' },
  { id: 'derrubar', nome: 'Derrubar', icone: '🦵', acao: 'padrao', alvo: true, especial: true, pagina: 268,
    texto: 'CC −2 contra a defesa do alvo. Ele fica caído.' },
  { id: 'empurrar', nome: 'Empurrar', icone: '👐', acao: 'padrao', alvo: true, especial: true, pagina: 268,
    texto: 'CC −2 contra a defesa. Empurra 1 m, +1 m a cada 4 pontos de diferença (você avança junto).' },
  { id: 'desarmar', nome: 'Desarmar', icone: '🗡️', acao: 'padrao', alvo: true, especial: true, pagina: 268,
    texto: 'CC −2 contra a defesa. O item cai a 3 m, +1 m a cada 4 pontos de diferença. Pegar do chão = ação Parcial.' },
  { id: 'levantar', nome: 'Levantar', icone: '🧍', acao: 'movimento', requer: 'caido', pagina: 277,
    texto: 'Fica de pé (tira a condição caído).' },
  { id: 'soltar_se', nome: 'Soltar-se', icone: '⛓️', acao: 'padrao', requer: 'agarrado', pagina: 268,
    texto: 'Teste resistido de CC (ou Força) contra quem segura. Ganhando, fica livre.' },
  { id: 'soltar', nome: 'Soltar quem segura', icone: '✋', acao: 'livre', requer: 'segurando', pagina: 268,
    texto: 'Larga a pessoa agarrada.' },
  { id: 'preparar', nome: 'Preparar ação', icone: '⏳', acao: 'padrao', pagina: 265,
    texto: 'Diga o que vai fazer e quando. A ação acontece como reação antes do seu próximo turno.' },
  { id: 'sacar', nome: 'Sacar arma ou objeto', icone: '🎒', acao: 'parcial', pagina: 266,
    texto: 'Sacar ou guardar arma, kunais (3 por mão), explosivos ou munição.' },
  { id: 'ajudar', nome: 'Ajudar aliado', icone: '🤝', acao: 'padrao', pagina: 267,
    texto: 'Teste de LM: segurar quem cai, entrar na frente de um ataque… O Mestre decide o resultado.' },
];

// Jutsus básicos (págs. 123–125): todo genin sabe, de graça. Kawarimi fica na defesa.
const JUTSUS_BASICOS = [
  { id: 'bunshin', nome: 'Bunshin no Jutsu', icone: '👥', acao: 'movimento', custo: 1, pagina: 123,
    texto: 'Cria 1 ou 2 clones ilusórios (só imagem: não atacam nem usam jutsus; somem ao serem tocados).' },
  { id: 'bunshin_finta', nome: 'Bunshin (fintar)', icone: '👥', acao: 'padrao', custo: 4, alvo: true, pagina: 124,
    texto: 'Prestidigitação contra a Prontidão do alvo. Ganhando, ele fica fintado contra seu próximo ataque corporal ou arremesso.' },
  { id: 'henge', nome: 'Henge no Jutsu', icone: '🎭', acao: 'movimento', custo: 1, pagina: 124,
    texto: 'Vira outra pessoa, animal ou objeto do seu tamanho. Quem interagir testa Percepção (Dif 7 + seus Disfarces) para notar.' },
  { id: 'shunshin', nome: 'Shunshin no Jutsu', icone: '💨', acao: 'livre', custo: 1, pagina: 125,
    texto: 'Movimento em alta velocidade (só aparência): pague e arraste o token usando o seu Movimento.' },
  { id: 'kinobori', nome: 'Kinobori', icone: '🌳', acao: 'livre', custo: 1, pagina: 125,
    texto: 'Anda em paredes, árvores e teto pela cena toda.' },
  { id: 'tadayou', nome: 'Tadayou', icone: '🌊', acao: 'livre', custo: 1, pagina: 126,
    texto: 'Anda sobre a água (ou líquido não inflamável nem ácido) enquanto quiser.' },
  { id: 'kai', nome: 'Kai', icone: '✋', acao: 'padrao', custo: 0, pagina: 124,
    texto: 'Liberta alguém de um Genjutsu: Espírito ou Inteligência contra a dificuldade dele; custa o mesmo chakra do Genjutsu (em si mesmo, de graça, depois de notar o Genjutsu).' },
  { id: 'pilula', nome: 'Pílula do soldado', icone: '💊', acao: 'parcial', custo: 0, pagina: 260,
    texto: 'Recupera chakra = metade do Espírito. Depois de 1 hora: 1 pílula = fatigado, 2 = exausto, 3 = inconsciente. Mais de 3: intoxicação.' },
];

const ACAO_LABEL = { padrao: 'Padrão', movimento: 'Movimento', parcial: 'Parcial', livre: 'Livre' };

const precisaoCC = (profile) => Number(profile?.combat?.cc ?? profile?.attacks?.find((a) => a.modo.tipo === 'cc')?.modo.precisao ?? 0);
const atributo = (character, key) => Number(character?.attributes?.attributes?.[key] ?? 0);
const pericia = (character, key) => Number(character?.attributes?.skill_totals?.[key] ?? character?.attributes?.npc?.pericias?.[key] ?? 0);

/** Teste resistido 2d8 + precisão (empate: maior precisão; persistindo, rola de novo — pág. 249). */
function resistido(precA, precB) {
  for (let i = 0; i < 6; i += 1) {
    const a = rollDice(2, 8);
    const b = rollDice(2, 8);
    const ta = a[0] + a[1] + precA;
    const tb = b[0] + b[1] + precB;
    if (ta !== tb || precA !== precB) return { a, b, ta, tb, venceu: ta > tb || (ta === tb && precA > precB) };
  }
  return { a: [0, 0], b: [0, 0], ta: 0, tb: 0, venceu: false };
}

export default function ManobrasPanel({ actor, profile, engineRef, actionState, strict, currentCombatant, onActionsSaved, postChat, onBack }) {
  const [escolha, setEscolha] = useState(null);
  const [alvoId, setAlvoId] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState('');

  const minhas = condicoesDe(actor).map((c) => c.id);
  const modes = Array.isArray(actor.active_modes) ? actor.active_modes : [];
  const minhasPosturas = modes.map((m) => m.condicao);

  // Alvos: fichas no mapa (menos a própria).
  const alvos = useMemo(() => Object.values(engineRef.current?.tokens || {})
    .filter((t) => t.data.character_id && t.data.character_id !== actor.id && t.mode !== 'prop')
    .map((t) => ({ tokenId: t.data.id, character: engineRef.current.characters[t.data.character_id] }))
    .filter((t) => t.character), [engineRef, actor.id]);

  const chakra = Number(actor.chakra_current ?? 0);
  const disponivel = (m) => {
    if (m.custo && chakra < m.custo) return false;
    if (m.requer && !minhas.includes(m.requer) && !minhasPosturas.includes(m.requer)) return false;
    if (m.acao === 'livre' || !strict) return true;
    return slotsFor(m.acao, actionState) !== null;
  };

  const gastarAcao = async (m) => {
    if (m.acao === 'livre') return true;
    const next = registerAction(m.acao, actionState, strict);
    if (!next) return false;
    await onActionsSaved(currentCombatant, next);
    return true;
  };

  const lerModes = async (id) => {
    const { data } = await supabase.from('characters').select('active_modes, name').eq('id', id).single();
    return Array.isArray(data?.active_modes) ? data.active_modes : [];
  };
  const comCondicao = async (character, id, extra = {}, turns = null) => {
    const atuais = await lerModes(character.id);
    await trackedUpdate(character.id, { active_modes: [...atuais, { ...novaCondicao(id, turns, uid), ...extra }] }, `${character.name}: ${id}`);
  };
  const semCondicao = async (character, filtro) => {
    const atuais = await lerModes(character.id);
    await trackedUpdate(character.id, { active_modes: atuais.filter((m) => !filtro(m)) }, `${character.name}: condição removida`);
  };

  /** Manobra especial: CC −2 contra a melhor defesa do alvo (alvo maior: +1, +1 por categoria acima). */
  const especial = (alvo) => {
    const tProfile = combatProfile(alvo.character);
    const modoBase = { tipo: 'cc', precisao: precisaoCC(profile) - 2, danoBase: 0, critico: 15 };
    const sit = applySituation(profile, modoBase, tProfile);
    const diff = sizeInfo(sizeOf(alvo.character)).ordem - sizeInfo(sizeOf(actor)).ordem;
    const bonusAlvo = diff > 0 ? 1 + diff : 0;
    const modo = { ...sit.modo, precisao: sit.modo.precisao - sizeAttackBonus(sizeOf(actor), sizeOf(alvo.character)) };
    const d = sit.target.defenses;
    const target = {
      ...sit.target,
      defenses: {
        esquiva: { ...d.esquiva, dificuldade: d.esquiva.dificuldade + bonusAlvo },
        bloqueio: { ...d.bloqueio, precisao: d.bloqueio.precisao + bonusAlvo },
        antecipar: { ...d.antecipar, precisao: d.antecipar.precisao + bonusAlvo },
      },
    };
    // O alvo usa a defesa em que tem mais chance.
    const opcoes = ['esquiva', 'antecipar', ...(target.defenses.bloqueio.possivel ? ['bloqueio'] : [])];
    const defesa = opcoes.sort((x, y) => forecast({ modo, target, defense: x }).hit - forecast({ modo, target, defense: y }).hit)[0];
    const res = resolveAttack({ modo, target, defense: defesa });
    const defTotal = res.defenseTotal ?? 0;
    return { res, defesa, diferenca: Math.max(0, res.attackTotal - defTotal), bonusAlvo };
  };

  const executar = async () => {
    const m = escolha;
    if (!m || busy) return;
    const alvo = alvos.find((a) => a.tokenId === alvoId);
    if (m.alvo && !alvo) { setResultado('Escolha o alvo.'); return; }
    setBusy(true);
    setResultado('');
    try {
      if (!(await gastarAcao(m))) { setResultado(`Sem ação ${ACAO_LABEL[m.acao]} disponível.`); return; }
      let texto = '';
      if (m.custo) {
        const { data: fresh } = await supabase.from('characters').select('chakra_current').eq('id', actor.id).single();
        await trackedUpdate(actor.id, { chakra_current: Number(fresh?.chakra_current ?? chakra) - m.custo }, `${actor.name}: ${m.nome} (−${m.custo} CK)`);
      }
      const marcar = async (nome, turns = null) => {
        const atuais = await lerModes(actor.id);
        await trackedUpdate(actor.id, { active_modes: [...atuais.filter((x) => x.name !== nome), { id: uid(), name: nome, turns, drain: { chakra: 0, hp: 0 } }] }, `${actor.name}: ${nome}`);
      };

      if (m.id === 'bunshin') {
        await marcar('Bunshin (clones ilusórios)');
        texto = `${actor.name} criou clones ilusórios (−1 CK).`;
      } else if (m.id === 'bunshin_finta') {
        const precA = pericia(actor, 'prestidigitacao');
        const precB = pericia(alvo.character, 'prontidao');
        const r = resistido(precA, precB);
        texto = `${actor.name} usou Bunshin para fintar ${alvo.character.name} (−4 CK): ${r.ta} contra ${r.tb} → ${r.venceu ? 'fintado' : 'não caiu'}.`;
        if (r.venceu) await comCondicao(alvo.character, 'fintado', { por: actor.id }, 1);
      } else if (m.id === 'henge') {
        await marcar('Henge (transformado)');
        texto = `${actor.name} usou Henge (−1 CK). Para notar: Percepção Dif ${7 + pericia(actor, 'disfarces')}.`;
      } else if (m.id === 'kinobori') {
        await marcar('Kinobori (cena)');
        texto = `${actor.name} usou Kinobori (−1 CK): anda em paredes e árvores nesta cena.`;
      } else if (m.id === 'tadayou') {
        await marcar('Tadayou (sobre a água)');
        texto = `${actor.name} usou Tadayou (−1 CK): anda sobre a água.`;
      } else if (m.id === 'shunshin') {
        texto = `${actor.name} usou Shunshin no Jutsu (−1 CK). Arraste o token usando o Movimento.`;
      } else if (m.id === 'pilula') {
        const atuais = await lerModes(actor.id);
        const antes = atuais.find((x) => x.pilulas);
        const total = Number(antes?.pilulas || 0) + 1;
        const ganho = total > 3 ? 0 : Math.ceil(atributo(actor, 'espirito') / 2);
        const { data: fresh } = await supabase.from('characters').select('chakra_current').eq('id', actor.id).single();
        await trackedUpdate(actor.id, {
          chakra_current: Number(fresh?.chakra_current ?? chakra) + ganho,
          active_modes: [...atuais.filter((x) => !x.pilulas), { id: uid(), name: `Pílulas do soldado ×${total}`, turns: null, drain: { chakra: 0, hp: 0 }, pilulas: total }],
        }, `${actor.name}: pílula do soldado`);
        const efeito = total > 3 ? 'intoxicação: inconsciente por 1 hora e exausto por 20 dias' : `daqui a 1 hora fica ${['', 'fatigado', 'exausto', 'inconsciente'][total]}`;
        texto = `${actor.name} tomou uma pílula do soldado (${total}ª): +${ganho} CK; ${efeito}.`;
      } else if (m.id === 'kai') {
        texto = `${actor.name} usou Kai (o Mestre diz a dificuldade e o custo do Genjutsu).`;
      } else if (m.id === 'defesa_total') {
        await comCondicao(actor, 'defesa_total', {}, 1);
        texto = `${actor.name} entrou em Defesa total (+3 Esquiva e Antecipar até o próximo turno).`;
      } else if (m.id === 'fintar') {
        const precA = atributo(actor, 'agilidade');
        const precB = pericia(alvo.character, 'prontidao');
        const r = resistido(precA, precB);
        texto = `${actor.name} fintou ${alvo.character.name}: Agilidade ${r.a.join('+')}+${precA}=${r.ta} contra Prontidão ${r.b.join('+')}+${precB}=${r.tb} → ${r.venceu ? 'fintado (−2 na defesa contra o próximo ataque corpo a corpo)' : 'não caiu'}.`;
        if (r.venceu) await comCondicao(alvo.character, 'fintado', { por: actor.id }, 1);
      } else if (m.especial) {
        const { res, defesa, diferenca, bonusAlvo } = especial(alvo);
        const nomeDef = { esquiva: 'Esquiva', bloqueio: 'Bloqueio', antecipar: 'Antecipar' }[defesa];
        const base = `${actor.name} tentou ${m.nome.toLowerCase()} ${alvo.character.name}: ${res.attackDice.join('+')} → ${res.attackTotal} contra ${nomeDef} ${res.defenseTotal ?? ''}${bonusAlvo ? ` (alvo maior: +${bonusAlvo})` : ''}`;
        if (!res.hit) {
          texto = `${base} → falhou.`;
        } else if (m.id === 'agarrar') {
          await comCondicao(alvo.character, 'agarrado', { por: actor.id });
          await comCondicao(actor, 'segurando', { alvo: alvo.character.id });
          texto = `${base} → agarrou! ${alvo.character.name} está agarrado (impedido).`;
        } else if (m.id === 'derrubar') {
          await comCondicao(alvo.character, 'caido');
          texto = `${base} → derrubou! ${alvo.character.name} está caído.`;
        } else if (m.id === 'empurrar') {
          texto = `${base} → empurrou ${1 + Math.floor(diferenca / 4)} m (mova os dois no mapa).`;
        } else if (m.id === 'desarmar') {
          texto = `${base} → desarmou! O item caiu a ${3 + Math.floor(diferenca / 4)} m.`;
        }
      } else if (m.id === 'levantar') {
        await semCondicao(actor, (x) => x.condicao === 'caido');
        texto = `${actor.name} se levantou.`;
      } else if (m.id === 'soltar_se') {
        const preso = modes.find((x) => x.condicao === 'agarrado');
        const quem = preso?.por ? engineRef.current?.characters?.[preso.por] : null;
        const minha = Math.max(precisaoCC(profile), atributo(actor, 'forca'));
        const dele = quem ? precisaoCC(combatProfile(quem)) : 0;
        const r = resistido(minha, dele);
        texto = `${actor.name} tentou se soltar${quem ? ` de ${quem.name}` : ''}: ${r.ta} contra ${r.tb} → ${r.venceu ? 'livre!' : 'continua preso'}.`;
        if (r.venceu) {
          await semCondicao(actor, (x) => x.condicao === 'agarrado');
          if (quem) await semCondicao(quem, (x) => x.condicao === 'segurando' && x.alvo === actor.id);
        }
      } else if (m.id === 'soltar') {
        const segurando = modes.find((x) => x.condicao === 'segurando');
        await semCondicao(actor, (x) => x.condicao === 'segurando');
        const vitima = segurando?.alvo ? engineRef.current?.characters?.[segurando.alvo] : null;
        if (vitima) await semCondicao(vitima, (x) => x.condicao === 'agarrado' && x.por === actor.id);
        texto = `${actor.name} soltou ${vitima?.name || 'quem segurava'}.`;
      } else if (m.id === 'preparar') {
        const atuais = await lerModes(actor.id);
        await trackedUpdate(actor.id, { active_modes: [...atuais, { id: uid(), name: 'Ação preparada', turns: 1, drain: { chakra: 0, hp: 0 } }] }, `${actor.name}: preparou`);
        texto = `${actor.name} preparou uma ação (acontece como reação antes do próximo turno dele).`;
      } else {
        texto = `${actor.name}: ${m.nome}.`;
      }
      setResultado(texto);
      await postChat(texto);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {MANOBRAS.filter((m) => !m.requer || minhas.includes(m.requer) || minhasPosturas.includes(m.requer)).map((m) => {
          const ok = disponivel(m);
          return (
            <button key={m.id} type="button" disabled={!ok} onClick={() => { setEscolha(m); setResultado(''); }}
              className={`rounded-lg border p-2 text-left text-xs ${escolha?.id === m.id ? 'border-orange-500 bg-orange-950/40' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'} disabled:opacity-40`}>
              <span className="font-bold">{m.icone} {m.nome}</span>
              <span className="block text-[10px] text-zinc-400">{ACAO_LABEL[m.acao]}{!ok ? ' · sem ação' : ''}</span>
            </button>
          );
        })}
      </div>

      <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">🍥 Jutsus básicos (todo genin sabe)</p>
      <div className="grid grid-cols-2 gap-1.5">
        {JUTSUS_BASICOS.map((m) => {
          const ok = disponivel(m);
          return (
            <button key={m.id} type="button" disabled={!ok} onClick={() => { setEscolha(m); setResultado(''); }}
              className={`rounded-lg border p-2 text-left text-xs ${escolha?.id === m.id ? 'border-orange-500 bg-orange-950/40' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'} disabled:opacity-40`}>
              <span className="font-bold">{m.icone} {m.nome}</span>
              <span className="block text-[10px] text-zinc-400">{ACAO_LABEL[m.acao]}{m.custo ? ` · ${m.custo} CK` : ''}{!ok ? (m.custo && chakra < m.custo ? ' · sem chakra' : ' · sem ação') : ''}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-500">Kawarimi aparece como defesa quando você é atacado (1× por cena).</p>

      {escolha && (
        <div className="space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-900/80 p-2 text-xs">
          <p><b>{escolha.icone} {escolha.nome}</b> <span className="text-zinc-500">(ação {ACAO_LABEL[escolha.acao]}{escolha.custo ? `, ${escolha.custo} de chakra` : ''}, pág. {escolha.pagina})</span></p>
          <p className="text-zinc-300">{escolha.texto}</p>
          {escolha.alvo && (
            <select value={alvoId} onChange={(e) => setAlvoId(e.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-1">
              <option value="">Escolha o alvo…</option>
              {alvos.map((a) => <option key={a.tokenId} value={a.tokenId}>{a.character.name}</option>)}
            </select>
          )}
          <button type="button" disabled={busy || (escolha.alvo && !alvoId)} onClick={executar}
            className="w-full rounded-lg bg-red-700 py-2 font-bold text-white hover:bg-red-600 disabled:opacity-40">
            {busy ? 'Rolando…' : `Usar ${escolha.nome}`}
          </button>
        </div>
      )}
      {resultado && <p className="rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200">{resultado}</p>}
      <button type="button" onClick={onBack} className="w-full rounded-lg bg-zinc-800 py-1.5 text-xs font-bold hover:bg-zinc-700">← Voltar</button>
    </div>
  );
}
