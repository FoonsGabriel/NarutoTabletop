import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { acharSistema } from '../sistemas/Sistemas';
import FundoShinobi from '../sistemas/shinobi/components/FundoShinobi';
import MenuSessao from '../components/MenuSessao';
import Chatbot from '../components/Chatbot';
import {
  apagarFicha, cancelarPedido, erroDeBanco, listarMinhasFichas, meusPedidos, minhasMesas, pedirParaMesa, tirarDaMesa,
} from '../services/Fichas';

/**
 * Minhas fichas (fora da mesa) de um sistema: criar, editar, levar para uma mesa.
 * PLANEJAMENTO-IA seção 10. Por enquanto só o Shinobi tem ficha.
 */
export default function MinhasFichas() {
  const navigate = useNavigate();
  const { sistema: sistemaId } = useParams();
  const sistema = acharSistema(sistemaId);
  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName');
  const [fichas, setFichas] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [erro, setErro] = useState('');
  const [levar, setLevar] = useState(null); // ficha escolhida para levar a uma mesa
  const [chat, setChat] = useState(false); // chatbot de regras

  useEffect(() => {
    if (!playerId) navigate('/');
    else if (!sistema?.disponivel) navigate('/lobby');
  }, [playerId, sistema, navigate]);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setFichas(await listarMinhasFichas(playerId, sistemaId));
    } catch (e) {
      setErro(erroDeBanco(e));
      setFichas([]);
    }
    try {
      setPedidos(await meusPedidos(playerId));
    } catch {
      setPedidos([]); // banco sem a tabela de pedidos: a lista de fichas continua
    }
  }, [playerId, sistemaId]);

  useEffect(() => { if (playerId) carregar(); }, [carregar, playerId]);

  const agir = async (acao) => {
    setErro('');
    try { await acao(); await carregar(); } catch (e) { setErro(erroDeBanco(e)); }
  };

  const sair = () => { localStorage.clear(); navigate('/'); };

  return (
    <FundoShinobi>
      <header className="faixa-bandana">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <MenuSessao itens={[
            { id: 'mesas', icone: '🏯', label: 'Minhas mesas', onClick: () => navigate(`/lobby/${sistemaId}`) },
            { id: 'chatbot', icone: '💬', label: 'Chatbot (dúvidas de regras)', onClick: () => setChat(true) },
            { id: 'sistema', icone: '⇄', label: 'Trocar de sistema', onClick: () => navigate('/lobby') },
            { id: 'sair', icone: '🚪', label: 'Sair', onClick: sair },
          ]} />
          <span className="hanko h-8 w-8 text-lg" aria-hidden="true">忍</span>
          <span className="titulo-shinobi text-xl text-zinc-100 sm:text-2xl">Minhas fichas</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 pb-32">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="titulo-shinobi text-3xl text-zinc-50 sm:text-4xl">Fichas salvas</h1>
            <p className="mt-1 max-w-xl text-zinc-400">Monte o personagem aqui, fora de qualquer mesa, e depois peça ao Mestre para levar para a mesa dele.</p>
          </div>
          <button type="button" onClick={() => navigate(`/fichas/${sistemaId}/nova`)}
            className="rounded-md bg-red-600 px-4 py-2.5 font-extrabold text-zinc-50 hover:bg-red-700">+ Nova ficha</button>
        </div>

        {erro && <p role="alert" className="mt-5 rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}

        {fichas === null ? (
          <p className="mt-8 text-zinc-400">Carregando…</p>
        ) : fichas.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-zinc-700 p-8 text-center">
            <p className="titulo-shinobi text-xl text-zinc-100">Nenhuma ficha salva</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">Crie a primeira em “+ Nova ficha”.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2">
            {fichas.map((f) => {
              const pendentes = pedidos.filter((p) => p.character_id === f.id && p.status === 'pendente');
              return (
                <div key={f.id} className="rolo flex flex-col px-5 pb-4 pt-4">
                  <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-extrabold ${f.room_id ? 'bg-red-700 text-zinc-50' : 'bg-zinc-300 text-zinc-900'}`}>
                    {f.room_id ? `Original na mesa ${f.mesaNome}` : 'Salva'}
                  </span>
                  <h2 className="titulo-shinobi mt-2 truncate text-2xl">{f.name || 'Sem nome'}</h2>
                  <p className="text-sm text-zinc-600">{[f.clan, f.rank, `NC ${f.level || 4}`].filter(Boolean).join(', ')}</p>
                  {pendentes.map((p) => (
                    <p key={p.id} className="mt-2 text-sm text-zinc-700">
                      📨 {p.modo === 'original' ? 'Original' : 'Cópia'} pedida para uma mesa, esperando o Mestre.{' '}
                      <button type="button" onClick={() => agir(() => cancelarPedido(p.id))} className="font-bold underline">Cancelar pedido</button>
                    </p>
                  ))}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => navigate(`/fichas/${sistemaId}/${f.id}`)} className="rounded-md border-2 border-zinc-900 py-2 font-extrabold text-zinc-900 hover:bg-zinc-900 hover:text-zinc-50">Editar</button>
                    <button type="button" onClick={() => setLevar(f)} className="rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700">Levar para mesa</button>
                  </div>
                  <div className="mt-2 flex justify-end gap-4 text-sm">
                    {f.room_id
                      ? <button type="button" onClick={() => window.confirm(`Tirar ${f.name} da mesa ${f.mesaNome}? O token sai do mapa e a ficha volta a ficar só salva.`) && agir(() => tirarDaMesa(f))} className="font-bold text-zinc-700 underline-offset-2 hover:underline">Tirar da mesa</button>
                      : <button type="button" onClick={() => window.confirm(`Apagar a ficha de ${f.name}? Não dá para desfazer.`) && agir(() => apagarFicha(f))} className="font-bold text-red-800 underline-offset-2 hover:underline">Apagar</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {levar && (
        <LevarParaMesa ficha={levar} sistemaId={sistemaId} playerId={playerId} playerName={playerName}
          onFechar={() => setLevar(null)} onEnviado={() => { setLevar(null); carregar(); }} />
      )}
      {chat && <Chatbot onClose={() => setChat(false)} />}
    </FundoShinobi>
  );
}

function LevarParaMesa({ ficha, sistemaId, playerId, playerName, onFechar, onEnviado }) {
  const [mesas, setMesas] = useState(null);
  const [mesa, setMesa] = useState('');
  const [modo, setModo] = useState('copia');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    minhasMesas(playerId, sistemaId).then((l) => { setMesas(l); setMesa(l[0]?.id || ''); }).catch((e) => { setErro(erroDeBanco(e)); setMesas([]); });
  }, [playerId, sistemaId]);

  const enviar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await pedirParaMesa({ ficha, roomId: mesa, modo, playerId, playerName });
      onEnviado();
    } catch (e) {
      setErro(erroDeBanco(e));
    }
    setEnviando(false);
  };

  const opcao = (id, titulo, texto, desabilitada) => (
    <label className={`flex gap-3 rounded-md border p-3 ${modo === id ? 'border-red-600 bg-red-950/40' : 'border-zinc-700'} ${desabilitada ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name="modo" value={id} checked={modo === id} disabled={desabilitada} onChange={() => setModo(id)} className="mt-1" />
      <span><b className="block text-zinc-50">{titulo}</b><span className="text-sm text-zinc-400">{texto}</span></span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="levar-titulo" className="w-full max-w-md space-y-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="levar-titulo" className="titulo-shinobi text-2xl text-zinc-50">Levar {ficha.name} para uma mesa</h2>
        {mesas === null ? <p className="text-zinc-400">Carregando suas mesas…</p> : mesas.length === 0 ? (
          <p className="text-zinc-300">Você ainda não está em nenhuma mesa do Shinobi. Entre numa mesa com o código do Mestre e volte aqui.</p>
        ) : (
          <>
            <label className="block text-sm font-bold text-zinc-300">
              Mesa
              <select value={mesa} onChange={(e) => setMesa(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50">
                {mesas.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === 'gm' ? ' (você é o Mestre)' : ''}</option>)}
              </select>
            </label>
            <div className="space-y-2">
              {opcao('copia', 'Cópia', 'A mesa recebe uma cópia. A ficha salva aqui não muda.')}
              {opcao('original', 'Original',
                ficha.room_id ? 'A original já está numa mesa.' : 'A própria ficha vai para a mesa: o que acontecer lá muda esta ficha. Ela só pode estar em uma mesa por vez.',
                Boolean(ficha.room_id))}
            </div>
            {modo === 'original' && <p className="rounded-md border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-100">⚠️ Dano, EXP, itens e tudo o que mudar na mesa vai mudar esta ficha salva.</p>}
            <p className="text-sm text-zinc-400">O Mestre da mesa recebe o pedido e aceita ou nega. O pedido fica guardado até ele responder.</p>
          </>
        )}
        {erro && <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onFechar} className="flex-1 rounded-md border border-zinc-600 py-2 font-bold text-zinc-200">Cancelar</button>
          <button type="button" disabled={!mesa || enviando} onClick={enviar} className="flex-1 rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">
            {enviando ? 'Enviando…' : 'Pedir ao Mestre'}
          </button>
        </div>
      </div>
    </div>
  );
}
