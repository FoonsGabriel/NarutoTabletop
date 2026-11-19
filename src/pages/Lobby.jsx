import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate, useParams } from 'react-router-dom';
import { acharSistema, sistemaDaMesa } from '../sistemas/Sistemas';
import FundoShinobi from '../sistemas/shinobi/components/FundoShinobi';

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
  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none';
  const mestre = rooms.filter((r) => r.role === 'gm');
  const jogador = rooms.filter((r) => r.role !== 'gm');

  // Cada mesa é um rolo de pergaminho (makimono).
  const cartaoMesa = (room) => (
    <div key={room.id} className="rolo flex flex-col px-5 pb-4 pt-4">
      <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-extrabold ${room.role === 'gm' ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-300 text-zinc-900'}`}>
        {room.role === 'gm' ? 'Mestre' : 'Jogador'}
      </span>
      <h3 className="titulo-shinobi mt-2 truncate text-2xl leading-tight">{room.name}</h3>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-2 text-sm text-zinc-600">
        <span>Código</span>
        <span className="select-all font-mono font-bold text-red-700">{room.invite_code}</span>
        <button type="button" onClick={() => copiarCodigo(room.invite_code)} className="font-bold text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline" title="Copiar o código para mandar aos jogadores">
          {copiado === room.invite_code ? 'copiado ✓' : 'copiar'}
        </button>
      </div>
      <button
        onClick={() => navigate(`/room/${room.id}`)}
        className="mt-auto w-full rounded-md bg-red-600 py-2.5 text-base font-extrabold text-zinc-50 transition-colors hover:bg-red-700"
      >
        Abrir a mesa
      </button>
    </div>
  );

  return (
    <FundoShinobi>
      <header className="faixa-bandana">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="hanko h-8 w-8 text-lg" aria-hidden="true">忍</span>
            <span className="titulo-shinobi text-xl text-zinc-100 sm:text-2xl">Shinobi no Sho</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => navigate('/lobby')} className="rounded-md border border-zinc-700 px-3 py-1.5 font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white" title="Voltar para a escolha do sistema" aria-label="Trocar de sistema">
              ⇄ <span className="hidden sm:inline">Trocar de sistema</span>
            </button>
            <button onClick={handleLogout} className="rounded-md border border-zinc-700 px-3 py-1.5 font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 pb-40 sm:py-10">
        <h1 className="titulo-shinobi text-4xl leading-tight text-zinc-50 sm:text-5xl">Olá, {playerName}</h1>
        <p className="mt-1 text-zinc-400">Suas mesas de Naruto: Shinobi no Sho.</p>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Mesas */}
          <section className="min-w-0">
            {rooms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
                <p className="titulo-shinobi text-xl text-zinc-100">Nenhuma mesa ainda</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">Peça o código ao Mestre e entre por “Entrar numa mesa”, ou crie a sua mesa ao lado.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {[['Mestrando', mestre], ['Jogando', jogador]].filter(([, lista]) => lista.length).map(([titulo, lista]) => (
                  <div key={titulo}>
                    <h2 className="titulo-shinobi mb-5 text-xl text-zinc-300">{titulo}</h2>
                    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2">
                      {lista.map(cartaoMesa)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ações */}
          <aside className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-5">
              <h2 className="titulo-shinobi text-xl text-zinc-100">Entrar numa mesa</h2>
              <p className="mb-3 mt-0.5 text-sm text-zinc-400">O Mestre passa o código da mesa.</p>
              <form onSubmit={handleJoinRoom} className="space-y-2">
                <label htmlFor="codigo-mesa" className="block text-sm font-bold text-zinc-300">Código do Mestre</label>
                <input
                  id="codigo-mesa"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Ex.: K7Q2XA"
                  className={inputClass}
                />
                <button type="submit" disabled={loading} className="w-full rounded-md border-2 border-red-600 py-2 font-extrabold text-red-100 transition-colors hover:bg-red-600/20 disabled:opacity-50">
                  Entrar
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-5">
              <h2 className="titulo-shinobi text-xl text-zinc-100">Criar mesa</h2>
              <p className="mb-3 mt-0.5 text-sm text-zinc-400">Você vira o Mestre da mesa nova.</p>
              <form onSubmit={handleCreateRoom} className="space-y-2">
                <label htmlFor="nome-mesa" className="block text-sm font-bold text-zinc-300">Nome da mesa</label>
                <input
                  id="nome-mesa"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ex.: Exame Chunin"
                  className={inputClass}
                />
                <button type="submit" disabled={loading} className="w-full rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 transition-colors hover:bg-red-700 disabled:opacity-50">
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
