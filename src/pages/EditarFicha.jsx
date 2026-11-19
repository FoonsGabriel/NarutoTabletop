import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { acharSistema } from '../sistemas/Sistemas';
import { FichaPersonagem } from '../sistemas/shinobi/Index.js';

/** Editar (ou criar) uma ficha fora da mesa — a ficha completa do sistema, em tela cheia. */
export default function EditarFicha() {
  const navigate = useNavigate();
  const { sistema: sistemaId, fichaId } = useParams();
  const playerId = localStorage.getItem('playerId');
  const playerName = localStorage.getItem('playerName');
  const sistema = acharSistema(sistemaId);

  useEffect(() => {
    if (!playerId) navigate('/');
    else if (!sistema?.disponivel) navigate('/lobby');
  }, [playerId, sistema, navigate]);

  const voltar = () => navigate(`/fichas/${sistemaId}`);

  return (
    <div className="h-[100dvh] bg-zinc-950">
      <div className="mx-auto h-full max-w-4xl">
        <FichaPersonagem
          foraDaMesa
          fichaId={fichaId === 'nova' ? null : fichaId}
          playerId={playerId}
          playerName={playerName}
          onFechar={voltar}
          // Ficha nova salva: a página passa a editar a ficha criada (o endereço ganha o id).
          onSalvo={(row) => { if (fichaId === 'nova') navigate(`/fichas/${sistemaId}/${row.id}`, { replace: true }); }}
        />
      </div>
    </div>
  );
}
