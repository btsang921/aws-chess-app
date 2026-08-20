import { Server } from "socket.io";
import { Chess } from "chess.js";
import { pool } from "./db.js";
import { authenticateSocket } from "./auth.js";

const rooms = new Map();

function publicState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  return {
    roomCode,
    fen: room.chess.fen(),
    turn: room.chess.turn(),
    pgn: room.chess.pgn(),
    isGameOver: room.chess.isGameOver(),
    isCheck: room.chess.inCheck(),
    players: {
      w: room.players.w ? { id: room.players.w.id, username: room.players.w.username } : null,
      b: room.players.b ? { id: room.players.b.id, username: room.players.b.username } : null
    },
    lastMove: room.lastMove || null,
    message: room.message || null
  };
}

async function saveMatch(room, result, winnerUserId = null) {
  if (room.saved) return;
  room.saved = true;

  await pool.query(
    `INSERT INTO matches
      (white_user_id, black_user_id, winner_user_id, result, pgn, final_fen)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      room.players.w?.id || null,
      room.players.b?.id || null,
      winnerUserId,
      result,
      room.chess.pgn(),
      room.chess.fen()
    ]
  );
}

function getGameResult(room) {
  const chess = room.chess;
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    const loserColor = chess.turn();
    const winnerColor = loserColor === "w" ? "b" : "w";
    return {
      result: winnerColor === "w" ? "1-0" : "0-1",
      winnerUserId: room.players[winnerColor]?.id || null
    };
  }

  return { result: "1/2-1/2", winnerUserId: null };
}

export function configureSockets(httpServer, clientOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.on("join-room", ({ roomCode }) => {
      const code = String(roomCode || "").trim().slice(0, 40);
      if (!code) {
        socket.emit("error-message", "Room code is required");
        return;
      }

      if (!rooms.has(code)) {
        rooms.set(code, {
          chess: new Chess(),
          players: { w: null, b: null },
          sockets: new Map(),
          saved: false,
          createdAt: new Date()
        });
      }

      const room = rooms.get(code);
      let color = null;

      if (room.players.w?.id === socket.user.id) color = "w";
      else if (room.players.b?.id === socket.user.id) color = "b";
      else if (!room.players.w) {
        color = "w";
        room.players.w = socket.user;
      } else if (!room.players.b) {
        color = "b";
        room.players.b = socket.user;
      } else {
        socket.emit("error-message", "Room is full. Try another room code.");
        return;
      }

      room.sockets.set(socket.id, color);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.color = color;

      socket.emit("joined", { roomCode: code, color });
      io.to(code).emit("game-state", publicState(code));
    });

    socket.on("make-move", async ({ from, to, promotion = "q" }) => {
      const code = socket.data.roomCode;
      const color = socket.data.color;
      const room = rooms.get(code);

      if (!room) return;

      if (room.chess.isGameOver()) {
        socket.emit("error-message", "The game is already over.");
        return;
      }

      if (room.chess.turn() !== color) {
        socket.emit("error-message", "It is not your turn.");
        return;
      }

      const piece = room.chess.get(from);

      if (!piece) {
        socket.emit("error-message", `There is no piece on ${from}.`);
        return;
      }

      if (piece.color !== color) {
        socket.emit("error-message", "You can only move your own pieces.");
        return;
      }

      const pieceNames = {
        p: "pawn",
        n: "knight",
        b: "bishop",
        r: "rook",
        q: "queen",
        k: "king"
      };

      const pieceName = pieceNames[piece.type] || "piece";

      try {
        const move = room.chess.move({ from, to, promotion });

        if (!move) {
          socket.emit("error-message", `${pieceName} cannot move from ${from} to ${to}.`);
          return;
        }

        room.lastMove = move;

        const result = getGameResult(room);

        if (result) {
          await saveMatch(room, result.result, result.winnerUserId);
          room.message = `Game over: ${result.result}`;
        }

        io.to(code).emit("game-state", publicState(code));
      } catch (err) {
        socket.emit("error-message", `${pieceName} cannot move from ${from} to ${to}.`);
      }
    });

    socket.on("resign", async () => {
      const code = socket.data.roomCode;
      const color = socket.data.color;
      const room = rooms.get(code);
      if (!room || room.saved) return;

      const winnerColor = color === "w" ? "b" : "w";
      const result = winnerColor === "w" ? "1-0" : "0-1";
      await saveMatch(room, `resignation ${result}`, room.players[winnerColor]?.id || null);
      room.message = `${socket.user.username} resigned. Result: ${result}`;
      io.to(code).emit("game-state", publicState(code));
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      const room = rooms.get(code);
      if (!room) return;
      room.sockets.delete(socket.id);
      // Keep players assigned so users can refresh/reconnect without losing their color.
    });
  });
}
