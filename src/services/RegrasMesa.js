// =====================================================================
// Regras da mesa (PLANEJAMENTO-IA seção 5): regras e liberações do Mestre.
//
// Tabela `regras_mesa` (SQL no DEPLOY.md):
//   room_id   → a mesa; vazio = vale para TODAS as mesas desse Mestre
//   tipo      → 'livre' (texto que a IA e os jogadores consultam; o Mestre arbitra)
//               'liberar' (automático: libera poderes/aptidões de outro clã)
//   dados     → para 'liberar': { itens: [ids], personagem_id: id ou null (= todos da mesa) }
//   visivel   → false = só o Mestre vê na tela (a IA usa mesmo assim, sem dizer que é do Mestre)
//
// "Oculta" é só na tela: o login do site não usa contas do Supabase, então o banco não sabe
// quem pede. Por isso o site nunca pede as ocultas para o jogador (só o Mestre lista tudo).
// =====================================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase/client';

const TABELA = 'regras_mesa';

/** Mensagem simples quando a tabela ainda não existe no Supabase. */
export function erroDasRegras(error) {
  if (!error) return '';
  if (/regras_mesa|relation|does not exist|schema cache/i.test(error.message || '')) {
    return 'A tabela de regras ainda não existe no Supabase. Rode o SQL "Regras da mesa" do DEPLOY.md.';
  }
  return error.message || 'Erro ao falar com o banco.';
}

/**
 * Regras que valem nesta mesa: as dela + as "todas as minhas mesas" do Mestre.
 * Jogador: só visíveis e liberações (a liberação precisa chegar na ficha de quem foi liberado).
 */
export async function listarRegras(roomId, gmId, { souMestre = false } = {}) {
  let consulta = supabase.from(TABELA).select('*').order('created_at', { ascending: true });
  consulta = gmId
    ? consulta.or(`room_id.eq.${roomId},and(room_id.is.null,mestre_id.eq.${gmId})`)
    : consulta.eq('room_id', roomId);
  if (!souMestre) consulta = consulta.or('visivel.eq.true,tipo.eq.liberar');
  const { data, error } = await consulta;
  if (error) throw new Error(erroDasRegras(error));
  return data || [];
}

export async function criarRegra(regra) {
  const { data, error } = await supabase.from(TABELA).insert(regra).select().single();
  if (error) throw new Error(erroDasRegras(error));
  return data;
}

export async function editarRegra(id, mudancas) {
  const { data, error } = await supabase.from(TABELA).update(mudancas).eq('id', id).select().single();
  if (error) throw new Error(erroDasRegras(error));
  return data;
}

export async function apagarRegra(id) {
  const { error } = await supabase.from(TABELA).delete().eq('id', id);
  if (error) throw new Error(erroDasRegras(error));
}

/** Ids liberados para este personagem pelas regras 'liberar' (para ele ou para todos). */
export function liberadosPara(regras, characterId) {
  const ids = new Set();
  (regras || []).forEach((r) => {
    if (r.tipo !== 'liberar') return;
    const alvo = r.dados?.personagem_id || null;
    if (alvo && alvo !== characterId) return;
    (r.dados?.itens || []).forEach((id) => ids.add(id));
  });
  return ids;
}

/**
 * Liberações que valem para a ficha (atualiza sozinho quando o Mestre muda as regras).
 * Devolve { liberados: Set, regras: [...] } — vazio fora de mesa ou sem a tabela.
 */
export function useLiberacoes(roomId, characterId) {
  const [estado, setEstado] = useState({ liberados: new Set(), regras: [] });

  useEffect(() => {
    if (!roomId) return undefined;
    let ativo = true;
    const carregar = async () => {
      try {
        const { data: sala } = await supabase.from('rooms').select('gm_id').eq('id', roomId).single();
        const regras = (await listarRegras(roomId, sala?.gm_id, { souMestre: false })).filter((r) => r.tipo === 'liberar');
        if (ativo) setEstado({ liberados: liberadosPara(regras, characterId), regras });
      } catch {
        if (ativo) setEstado({ liberados: new Set(), regras: [] }); // sem a tabela: ficha funciona como antes
      }
    };
    carregar();
    const canal = supabase.channel(`liberacoes_${roomId}_${characterId || 'novo'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABELA }, carregar)
      .subscribe();
    return () => { ativo = false; supabase.removeChannel(canal); };
  }, [roomId, characterId]);

  return estado;
}
