import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { aceitarPedido, erroDeBanco, negarPedido, pedidosPendentes } from '../services/Fichas';

/** Hook: pedidos de ficha pendentes desta mesa, ao vivo (só o Mestre usa). */
export function usePedidosFicha(roomId, ativo) {
  const [pedidos, setPedidos] = useState([]);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    if (!ativo || !roomId) return;
    try { setPedidos(await pedidosPendentes(roomId)); setErro(''); } catch (e) { setErro(erroDeBanco(e)); setPedidos([]); }
  }, [roomId, ativo]);

  useEffect(() => {
    if (!ativo || !roomId) return undefined;
    carregar();
    const canal = supabase.channel(`pedidos_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_ficha', filter: `room_id=eq.${roomId}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [roomId, ativo, carregar]);

  return { pedidos, erro, carregar };
}

/** Painel do Mestre: aceitar ou negar fichas que os jogadores pediram para trazer à mesa. */
export default function PedidosFicha({ pedidos, erro, recarregar }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');

  const responder = async (pedido, aceitar) => {
    setOcupado(pedido.id);
    setMsg('');
    try {
      if (aceitar) await aceitarPedido(pedido);
      else await negarPedido(pedido);
      setMsg(aceitar ? `${pedido.ficha_nome || 'A ficha'} entrou na mesa.` : 'Pedido negado.');
      await recarregar();
    } catch (e) {
      setMsg(erroDeBanco(e));
    }
    setOcupado('');
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      <p className="text-sm text-zinc-400">Fichas que os jogadores montaram fora da mesa e pediram para trazer. O pedido fica aqui até você responder.</p>
      {erro && <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}
      {msg && <p role="status" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">{msg}</p>}
      {!erro && pedidos.length === 0 && <p className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">Nenhum pedido esperando.</p>}
      {pedidos.map((p) => (
        <div key={p.id} className="rounded-md border border-zinc-700 bg-zinc-950 p-3">
          <p className="font-bold text-zinc-50">{p.ficha_nome || 'Ficha sem nome'}</p>
          <p className="text-sm text-zinc-400">
            de {p.player_name || 'um jogador'} · {p.modo === 'original'
              ? 'original (o que mudar aqui muda a ficha salva do jogador)'
              : 'cópia (a ficha salva do jogador não muda)'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={ocupado === p.id} onClick={() => responder(p, false)} className="rounded-md border border-zinc-600 py-1.5 text-sm font-bold text-zinc-200 hover:border-zinc-400 disabled:opacity-50">Negar</button>
            <button type="button" disabled={ocupado === p.id} onClick={() => responder(p, true)} className="rounded-md bg-red-600 py-1.5 text-sm font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">Aceitar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
