import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate, useParams } from 'react-router-dom';
import { acharSistema, sistemaDaMesa } from '../sistemas/Sistemas';
import FundoShinobi, { Shuriken } from '../sistemas/shinobi/components/FundoShinobi';

export default function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState('');
  const navigate = useNavigate();
  const { sistema: sistemaId } = useParams();
  const sistema = acharSistema(sistemaId);

  // Pega os dados do jogador logado
  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName');

  useEffect(() => {
    if (!playerId) {
      navigate('/'); // Se não tiver logado, chuta pro login
      return;
    }
    if (!sistema?.disponivel) {
      navigate('/lobby'); // sistema que não existe (ou "em breve"): volta para a escolha
      return;
    }
    loadRooms();
  }, [playerId, navigate, sistemaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRooms = async () => {
    // Busca as salas que este jogador faz parte
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        role,
        rooms ( * )
      `)
      .eq('player_id', playerId);

    if (!error && data) {
      // Limpa os dados para facilitar no React
      // Filtra itens cujo `rooms` é null (sala deletada com referência órfã em room_members)
      const formattedRooms = data
        .filter(item => item && item.rooms)
        .map(item => ({
          ...item.rooms,
          role: item.role
        }))
        // Só as mesas deste sistema (mesas antigas, sem o campo, são do Shinobi).
        .filter((room) => sistemaDaMesa(room) === sistemaId);
      setRooms(formattedRooms);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName) return;
    setLoading(true);

    try {
      // 1. Cria a sala
      let { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert([{ name: newRoomName, gm_id: playerId, sistema: sistemaId }])
        .select()
        .single();
      // Banco ainda sem a coluna `sistema` (SQL do N1 não rodado): cria sem ela (vale Shinobi).
      if (roomError && /sistema/.test(roomError.message || '')) {
        ({ data: room, error: roomError } = await supabase
          .from('rooms')
          .insert([{ name: newRoomName, gm_id: playerId }])
          .select()
          .single());
      }

      if (roomError) throw roomError;

      // 2. Coloca o criador como membro (Mestre/gm)
      const { error: memberError } = await supabase
        .from('room_members')
        .insert([{ room_id: room.id, player_id: playerId, role: 'gm' }]);

      if (memberError) throw memberError;

      setNewRoomName('');
      loadRooms(); // Recarrega a lista
    } catch (err) {
      alert('Erro ao criar sala: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!inviteCode) return;
    setLoading(true);

    try {
      // 1. Acha a sala pelo código
      const { data: room, error: findError } = await supabase
        .from('rooms')
        .select('id')
        .eq('invite_code', inviteCode)
        .single();

      if (findError || !room) throw new Error('Código inválido ou sala não encontrada.');

      // 2. Adiciona o jogador na sala
      const { error: joinError } = await supabase
        .from('room_members')
        .insert([{ room_id: room.id, player_id: playerId, role: 'player' }]);

      // Se der erro de duplicidade (já tá na sala), a gente ignora
      if (joinError && !joinError.message.includes('duplicate key')) {
        throw joinError;
      }

      setInviteCode('');
      loadRooms(); // Recarrega a lista
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const copiarCodigo = async (codigo) => {
    try { await navigator.clipboard.writeText(codigo); setCopiado(codigo); setTimeout(() => setCopiado(''), 1500); } catch { /* sem permissão: o código continua selecionável */ }
  };
  const inputClass = 'min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none';
  const mestre = rooms.filter((r) => r.role === 'gm');
  const jogador = rooms.filter((r) => r.role !== 'gm');

  const cartaoMesa = (room) => (
    <div key={room.id} className="group flex flex-col justify-between rounded-xl border border-zinc-700/80 bg-zinc-900/85 p-4 shadow-lg shadow-black/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-red-500">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-lg font-black">{room.name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${room.role === 'gm' ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-200'}`}>
          {room.role === 'gm' ? 'Mestre' : 'Jogador'}
        </span>
      </div>
      <div className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
        <span>Código:</span>
        <span className="select-all rounded bg-zinc-950 px-2 py-0.5 font-mono text-red-300">{room.invite_code}</span>
        <button type="button" onClick={() => copiarCodigo(room.invite_code)} className="text-zinc-500 hover:text-white" title="Copiar o código para mandar aos jogadores">
          {copiado === room.invite_code ? '✓ copiado' : '📋 copiar'}
        </button>
      </div>
      <button
        onClick={() => navigate(`/room/${room.id}`)}
        className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-black text-white transition-colors hover:bg-red-500"
      >
        ▶ Jogar
      </button>
    </div>
  );

  return (
    <FundoShinobi>
      <header className="faixa-bandana">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Shuriken className="h-6 w-6 text-red-500" />
            <span className="titulo-shinobi text-2xl text-red-500">Shinobi VTT</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button type="button" onClick={() => navigate('/lobby')} className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 font-bold text-zinc-300 transition-colors hover:border-red-500 hover:text-white" title="Voltar para a escolha do sistema">
              ⇄ <span className="hidden sm:inline">Trocar de sistema</span>
            </button>
            <span className="hidden text-zinc-400 sm:inline">Logado como <strong className="text-white">{playerName}</strong></span>
            <button onClick={handleLogout} className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 font-bold transition-colors hover:border-red-500">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 pb-40">
        <h1 className="titulo-shinobi text-4xl text-zinc-50 sm:text-5xl">Olá, {playerName}!</h1>
        <p className="mt-1 text-zinc-400">Escolha uma mesa para jogar, crie a sua ou entre com o código do Mestre.</p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Mesas */}
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-red-300">Suas mesas</h2>
            {rooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 p-8 text-center backdrop-blur">
                <Shuriken className="mx-auto mb-3 h-12 w-12 text-zinc-700" />
                <p className="font-bold text-zinc-200">Você ainda não está em nenhuma mesa.</p>
                <p className="mt-1 text-sm text-zinc-400">Peça o código ao Mestre e use “Entrar com código”, ou crie a sua mesa ao lado.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {[['Mestrando', mestre], ['Jogando', jogador]].filter(([, lista]) => lista.length).map(([titulo, lista]) => (
                  <div key={titulo}>
                    {mestre.length > 0 && jogador.length > 0 && <p className="mb-2 text-xs font-bold text-zinc-500">{titulo}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {lista.map(cartaoMesa)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ações */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/85 p-5 shadow-lg shadow-black/40 backdrop-blur">
              <h2 className="text-lg font-black">🎴 Entrar com código</h2>
              <p className="mb-3 text-xs text-zinc-400">Para jogadores: o Mestre passa o código da mesa.</p>
              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Código de convite"
                  className={inputClass}
                />
                <button type="submit" disabled={loading} className="rounded-lg bg-zinc-700 px-4 font-black transition-colors hover:bg-zinc-600 disabled:opacity-50">
                  Entrar
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/85 p-5 shadow-lg shadow-black/40 backdrop-blur">
              <h2 className="text-lg font-black">📜 Criar nova mesa</h2>
              <p className="mb-3 text-xs text-zinc-400">Para o Mestre: você vira o Mestre da mesa nova.</p>
              <form onSubmit={handleCreateRoom} className="flex gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Nome da campanha"
                  className={inputClass}
                />
                <button type="submit" disabled={loading} className="rounded-lg bg-red-600 px-4 font-black transition-colors hover:bg-red-500 disabled:opacity-50">
                  Criar
                </button>
              </form>
            </div>
          </aside>
        </div>
      </main>
    </FundoShinobi>
  );
}
