import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { trackedUpdate } from '../services/Undo';
import { rollDice } from '../services/Rolls';
import { uid } from '../services/Uid';
import { normalizeModes } from '../services/Combat';
import { CONDICOES, findCondicao, novaCondicao } from '../data/Condicoes';

const ehSangramento = (m) => /^(sangrando|morrendo)/i.test(m.name || '');

/**
 * Condições prejudiciais no card do token (págs. 275–278).
 *  - Mestre: aplica e tira condições (com duração em turnos, ou até tirar).
 *  - Todos que veem o card: rolam a estabilização de quem sangra
 *    (Vigor dif 18 da própria vítima, ou Medicina dif 16 de quem ajuda).
 */
export default function CondicoesPanel({ character, engineRef, roomId, isGM, canAct, playerName }) {
  const [escolha, setEscolha] = useState('');
  const [turnos, setTurnos] = useState('');
  const [ajudante, setAjudante] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState('');

  const modes = normalizeModes(character.active_modes);
  const condicoes = modes.filter((m) => m.condicao);
  const sangramentos = modes.filter(ehSangramento);
  const info = escolha ? findCondicao(escolha) : null;

  // Quem pode ajudar com Medicina: fichas no mapa (maior Medicina primeiro).
  const medicos = Object.values(engineRef.current?.characters || {})
    .filter((c) => c.id !== character.id)
    .map((c) => ({ id: c.id, nome: c.name, medicina: Number(c.attributes?.skill_totals?.medicina || 0) }))
    .sort((a, b) => b.medicina - a.medicina);

  const salvar = async (nextModes, label, extra = {}) => {
    setBusy(true);
    const { error } = await trackedUpdate(character.id, { active_modes: nextModes, ...extra }, label);
    setBusy(false);
    if (error) setAviso(`Erro: ${error.message}`);
    return !error;
  };

  const avisarChat = (texto) => supabase.from('room_messages').insert({ room_id: roomId, player_name: '🩹 Condições', message: texto, is_roll: false });

  const aplicar = async () => {
    if (!info) return;
    const t = turnos === '' ? null : Math.max(1, Number(turnos) || 1);
    const ok = await salvar([...modes, novaCondicao(info.id, t, uid)], `${character.name}: ${info.nome}`);
    if (ok) {
      avisarChat(`${character.name} ficou ${info.nome.toLowerCase()}${t ? ` por ${t} turno(s)` : ''}.`);
      setEscolha('');
      setTurnos('');
    }
  };

  const tirar = async (mode) => {
    const ok = await salvar(modes.filter((m) => m.id !== mode.id), `${character.name}: sem ${mode.name}`);
    if (ok) avisarChat(`${character.name} não está mais ${mode.name.toLowerCase()}.`);
  };

  /** Estabilizar (pág. 278): cada sucesso tira 1 nível de sangramento. */
  const estabilizar = async (tipo) => {
    if (!sangramentos.length) return;
    const medico = medicos.find((m) => m.id === ajudante) || medicos[0];
    const precisao = tipo === 'vigor'
      ? Number(character.attributes?.attributes?.vigor ?? character.attributes?.npc?.atributos?.vigor ?? 0)
      : Number(medico?.medicina || 0);
    const dif = tipo === 'vigor' ? 18 : 16;
    const dados = rollDice(2, 8);
    const total = dados[0] + dados[1] + precisao;
    const soma = dados[0] + dados[1];
    const ok = soma >= 15 || (soma > 3 && total >= dif); // 15–16 sempre sucesso, 2–3 sempre falha (pág. 250)
    const quem = tipo === 'vigor' ? `${character.name} (Vigor)` : `${medico?.nome || playerName} (Medicina)`;
    let texto = `${quem}: ${dados.join('+')} + ${precisao} = ${total} contra ${dif} → ${ok ? 'estancou 1 nível de sangramento' : 'falhou'}.`;
    if (ok) {
      // Tira primeiro um "Sangrando"; o "Morrendo" sai por último.
      const alvo = sangramentos.find((m) => /^sangrando/i.test(m.name)) || sangramentos[0];
      let next = modes.filter((m) => m.id !== alvo.id);
      const hp = Number(character.hp_current ?? 0);
      if (!next.some(ehSangramento) && hp <= -11 && hp > -21 && !next.some((m) => m.condicao === 'estavel')) {
        next = [...next, novaCondicao('estavel', null, uid)];
        texto += ` ${character.name} está estável.`;
      }
      await salvar(next, `${character.name}: estabilização`);
    }
    avisarChat(texto);
    setAviso(texto);
  };

  if (!isGM && !condicoes.length && !sangramentos.length) return null;

  return (
    <div className="mt-1.5 space-y-1 rounded border border-zinc-800 bg-zinc-900/70 p-1.5 text-[11px]">
      {condicoes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {condicoes.map((mode) => {
            const c = findCondicao(mode.condicao);
            return (
              <span key={mode.id} title={c?.resumo} className="inline-flex items-center gap-1 rounded bg-red-950/70 px-1.5 py-0.5 font-bold text-red-200">
                {c?.icone} {mode.name}{mode.turns != null ? ` (${mode.turns})` : ''}
                {isGM && <button type="button" disabled={busy} onClick={() => tirar(mode)} className="text-red-300 hover:text-white" title="Tirar">✕</button>}
              </span>
            );
          })}
        </div>
      )}

      {sangramentos.length > 0 && canAct && (
        <div className="space-y-1">
          <p className="font-bold text-red-300">🩸 Sangrando ×{sangramentos.length}: estabilizar</p>
          <div className="flex gap-1">
            <button type="button" disabled={busy} onClick={() => estabilizar('vigor')} className="flex-1 rounded border border-red-800 px-1 py-1 font-bold text-red-200 hover:bg-red-950/50" title="Teste de Vigor da vítima, dificuldade 18 (reação no início do turno)">Vigor 18</button>
            <button type="button" disabled={busy || !medicos.length} onClick={() => estabilizar('medicina')} className="flex-1 rounded border border-emerald-800 px-1 py-1 font-bold text-emerald-200 hover:bg-emerald-950/50" title="Teste de Medicina de quem ajuda, dificuldade 16 (ação Padrão)">Medicina 16</button>
          </div>
          {medicos.length > 0 && (
            <select value={ajudante} onChange={(e) => setAjudante(e.target.value)} className="w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-[11px]">
              {medicos.map((m) => <option key={m.id} value={m.id}>Quem ajuda: {m.nome} (Medicina {m.medicina})</option>)}
            </select>
          )}
        </div>
      )}

      {isGM && (
        <div className="space-y-1">
          <div className="flex gap-1">
            <select value={escolha} onChange={(e) => setEscolha(e.target.value)} className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-1 py-1 text-[11px]">
              <option value="">＋ Condição…</option>
              {CONDICOES.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
            </select>
            <input value={turnos} onChange={(e) => setTurnos(e.target.value.replace(/\D/g, ''))} placeholder="turnos" inputMode="numeric"
              className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-1 text-center text-[11px]" title="Quantos turnos dura (vazio = até tirar)" />
            <button type="button" disabled={!info || busy} onClick={aplicar} className="rounded bg-red-700 px-2 font-bold text-white disabled:opacity-40">OK</button>
          </div>
          {info && <p className="text-zinc-400">{info.resumo} <span className="text-zinc-600">(pág. 276–278)</span></p>}
        </div>
      )}
      {aviso && <p className="text-zinc-300">{aviso}</p>}
    </div>
  );
}
