import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const pieceSymbols = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
  P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔"
};

function squareName(row, col, color) {
  const rank = color === "b" ? row + 1 : 8 - row;
  const file = color === "b" ? files[7 - col] : files[col];
  return `${file}${rank}`;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`${API_URL}/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Auth failed");
      return;
    }
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    onAuth(data.user, data.token);
  }

  return (
    <div className="card auth-card">
      <h1>AWS Chess</h1>
      <p className="muted">Log in or register to play real-time chess.</p>
      <form onSubmit={submit}>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" />
        {error && <div className="error">{error}</div>}
        <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
      </form>
      <button className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
      </button>
    </div>
  );
}

function Board({ fen, color, onMove }) {
  const [selected, setSelected] = useState(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = chess.board();

  function handleClick(square) {
    if (!selected) {
      const piece = chess.get(square);
      if (piece) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    onMove(selected, square);
    setSelected(null);
  }

  return (
    <div className="board">
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 8 }).map((_, col) => {
          const square = squareName(row, col, color);
          const piece = chess.get(square);
          const isLight = (row + col) % 2 === 0;
          return (
            <button
              key={square}
              className={`square ${isLight ? "light" : "dark"} ${selected === square ? "selected" : ""}`}
              onClick={() => handleClick(square)}
              title={square}
            >
              <span>{piece ? pieceSymbols[piece.color === "w" ? piece.type.toUpperCase() : piece.type] : ""}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function MatchHistory({ token, refreshKey }) {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/matches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setMatches(data.matches || []))
      .catch(() => setMatches([]));
  }, [token, refreshKey]);

  return (
    <div className="card">
      <h2>Match History</h2>
      {matches.length === 0 ? <p className="muted">No completed matches yet.</p> : (
        <div className="history">
          {matches.map(m => (
            <div className="history-row" key={m.id}>
              <strong>{m.white_username || "Unknown"} vs {m.black_username || "Unknown"}</strong>
              <span>Result: {m.result}</span>
              <span>Winner: {m.winner_username || "Draw / none"}</span>
              <small>{new Date(m.ended_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));
  const [socket, setSocket] = useState(null);
  const [roomCode, setRoomCode] = useState("demo-room");
  const [joinedCode, setJoinedCode] = useState("");
  const [color, setColor] = useState("w");
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    const s = io(API_URL, { auth: { token }, transports: ["websocket", "polling"] });
    s.on("connect", () => setMessage("Connected"));
    s.on("joined", data => { setColor(data.color); setJoinedCode(data.roomCode); });
    s.on("game-state", data => { setState(data); if (data.isGameOver || data.message) setHistoryKey(k => k + 1); });
    s.on("error-message", msg => setMessage(msg));
    s.on("connect_error", err => setMessage(err.message));
    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  function logout() {
    localStorage.clear();
    setToken(null);
    setUser(null);
    socket?.disconnect();
  }

  if (!token || !user) {
    return <main><Auth onAuth={(u, t) => { setUser(u); setToken(t); }} /></main>;
  }

  function joinRoom() {
    socket?.emit("join-room", { roomCode });
  }

  function makeMove(from, to) {
    socket?.emit("make-move", { from, to, promotion: "q" });
  }

  function resign() {
    socket?.emit("resign");
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>AWS Chess</h1>
          <p className="muted">Signed in as {user.username}</p>
        </div>
        <button onClick={logout}>Log out</button>
      </header>

      <section className="layout">
        <div className="card game-card">
          <div className="room-controls">
            <input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="Room code" />
            <button onClick={joinRoom}>Join Room</button>
            <button className="danger" onClick={resign} disabled={!joinedCode}>Resign</button>
          </div>
          <p className="muted">Room: {joinedCode || "not joined"} | You are: {color === "w" ? "White" : "Black"}</p>
          {message && <p className="status">{message}</p>}
          {state ? (
            <>
              <Board fen={state.fen} color={color} onMove={makeMove} />
              <div className="game-info">
                <p>Turn: {state.turn === "w" ? "White" : "Black"}</p>
                <p>White: {state.players.w?.username || "waiting..."}</p>
                <p>Black: {state.players.b?.username || "waiting..."}</p>
                {state.message && <p>{state.message}</p>}
              </div>
            </>
          ) : <p>Join a room to start playing.</p>}
        </div>
        <MatchHistory token={token} refreshKey={historyKey} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
