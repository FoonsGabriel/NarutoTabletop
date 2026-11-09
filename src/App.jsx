import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login.jsx';

// A sala (mapa, PixiJS, fichas) é o pedaço pesado: só baixa quando alguém entra nela.
// Assim a tela de login abre rápido, principalmente no celular.
const Lobby = lazy(() => import('./pages/Lobby.jsx'));
const Room = lazy(() => import('./pages/Room.jsx'));

function Carregando() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-300">
      <p className="titulo-shinobi animate-pulse text-2xl text-red-500">Carregando…</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/room/:id" element={<Room />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
