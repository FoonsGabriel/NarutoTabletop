import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase/client';
import { useNavigate } from 'react-router-dom';

export default function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Pega os dados do jogador logado
  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName');

  useEffect(() => {
    if (!playerId) {
      navigate('/'); // Se não tiver logado, chuta pro login
      return;
    }
    loadRooms();
  }, [playerId, navigate]);

  const loadRooms = async () => {
    // Busca as salas que este jogador faz parte
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        role,
        rooms ( id, name, invite_code, gm_id )
      `)
      .eq('player_id', playerId);

    if (!error && data) {
      // Limpa os dados para facilitar no React
      const formattedRooms = data.map(item => ({
        ...item.rooms,
        role: item.role
      }));
      setRooms(formattedRooms);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName) return;
    setLoading(true);

    try {
      // 1. Cria a sala
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert([{ name: newRoomName, gm_id: playerId }])
        .select()
        .single();

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

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-zinc-700 pb-4">
          <h1 className="text-3xl font-bold text-red-500">Shinobi VTT</h1>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">Logado como: <strong className="text-white">{playerName}</strong></span>
            <button onClick={handleLogout} className="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded transition-colors">
              Sair
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Painel Esquerdo: Ações */}
          <div className="space-y-8">
            {/* Criar Sala */}
            <div className="bg-zinc-800 p-6 rounded-lg border border-zinc-700">
              <h2 className="text-xl font-bold mb-4">Criar Nova Mesa (Mestre)</h2>
              <form onSubmit={handleCreateRoom} className="flex gap-2">
                <input 
                  type="text" 
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Nome da Campanha"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded p-2 focus:outline-none focus:border-red-500"
                />
                <button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold transition-colors">
                  Criar
                </button>
              </form>
            </div>

            {/* Entrar em Sala */}
            <div className="bg-zinc-800 p-6 rounded-lg border border-zinc-700">
              <h2 className="text-xl font-bold mb-4">Entrar em uma Mesa (Jogador)</h2>
              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <input 
                  type="text" 
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Código de Convite"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded p-2 focus:outline-none focus:border-red-500"
                />
                <button type="submit" disabled={loading} className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded font-bold transition-colors">
                  Entrar
                </button>
              </form>
            </div>
          </div>

          {/* Painel Direito: Lista de Salas */}
          <div className="bg-zinc-800 p-6 rounded-lg border border-zinc-700">
            <h2 className="text-xl font-bold mb-4">Suas Mesas</h2>
            {rooms.length === 0 ? (
              <p className="text-zinc-400 text-center py-8">Você ainda não está em nenhuma mesa.</p>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-zinc-900 border border-zinc-700 p-4 rounded flex justify-between items-center hover:border-red-500 transition-colors">
                    <div>
                      <h3 className="font-bold text-lg">{room.name}</h3>
                      <p className="text-xs text-zinc-400">
                        {room.role === 'gm' ? 'Você é o Mestre' : 'Você é Jogador'} 
                        {' • '} Código: <span className="font-mono text-red-400 select-all">{room.invite_code}</span>
                      </p>
                    </div>
                    <button 
                      onClick={() => navigate(`/room/${room.id}`)}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold text-sm transition-colors"
                    >
                      Jogar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}