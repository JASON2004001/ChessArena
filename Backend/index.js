import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Atlas Connected Successfully!"))
  .catch((err) => console.error("MongoDB Connection Failed:", err));

// Auth Routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "Username already taken" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "Registration successful", username: newUser.username });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid username or password" });
    }
    res.json({ message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Realtime Matchmaking & Timer Logic
let waitingPlayer = null;
const rooms = new Map(); // roomId -> { whiteTimer, blackTimer, turn, timerInterval, whiteSocketId, blackSocketId }
const MATCH_DURATION = 10 * 60; // 10 minutes

function runRoomClock(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.timerInterval = setInterval(() => {
    if (room.turn === "w") {
      room.whiteTimer -= 1;
      if (room.whiteTimer <= 0) {
        clearInterval(room.timerInterval);
        io.to(roomId).emit("time_out", { loserColor: "w" });
        rooms.delete(roomId);
        return;
      }
    } else {
      room.blackTimer -= 1;
      if (room.blackTimer <= 0) {
        clearInterval(room.timerInterval);
        io.to(roomId).emit("time_out", { loserColor: "b" });
        rooms.delete(roomId);
        return;
      }
    }

    io.to(roomId).emit("clock_tick", {
      whiteTimer: room.whiteTimer,
      blackTimer: room.blackTimer,
      turn: room.turn
    });
  }, 1000);
}

io.on("connection", (socket) => {
  socket.on("find_match", ({ username }) => {
    socket.username = username || `Player #${socket.id.slice(0, 4)}`;

    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      const roomId = `room_${waitingPlayer.id}_${socket.id}`;

      waitingPlayer.join(roomId);
      socket.join(roomId);

      waitingPlayer.currentRoom = roomId;
      socket.currentRoom = roomId;

      const isWaitingPlayerWhite = Math.random() < 0.5;
      const whiteSocket = isWaitingPlayerWhite ? waitingPlayer : socket;
      const blackSocket = isWaitingPlayerWhite ? socket : waitingPlayer;

      const roomData = {
        whiteTimer: MATCH_DURATION,
        blackTimer: MATCH_DURATION,
        turn: "w",
        timerInterval: null,
        whiteSocketId: whiteSocket.id,
        blackSocketId: blackSocket.id
      };
      rooms.set(roomId, roomData);

      whiteSocket.emit("match_found", {
        roomId,
        color: "w",
        opponentName: blackSocket.username,
        initialTimer: MATCH_DURATION
      });

      blackSocket.emit("match_found", {
        roomId,
        color: "b",
        opponentName: whiteSocket.username,
        initialTimer: MATCH_DURATION
      });

      runRoomClock(roomId);
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
    }
  });

  socket.on("cancel_search", () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
  });

  // Relay move and toggle turn
  socket.on("make_move", ({ roomId, move }) => {
    const targetRoomId = roomId || socket.currentRoom;
    if (!targetRoomId) return;

    const room = rooms.get(targetRoomId);
    if (room) {
      room.turn = room.turn === "w" ? "b" : "w";
    }

    socket.to(targetRoomId).emit("opponent_move", move);
  });

  // End match immediately upon checkmate
  socket.on("game_over_checkmate", ({ loserColor }) => {
    const targetRoomId = socket.currentRoom;
    if (!targetRoomId) return;

    const room = rooms.get(targetRoomId);
    if (room && room.timerInterval) {
      clearInterval(room.timerInterval);
      rooms.delete(targetRoomId);
    }

    io.to(targetRoomId).emit("checkmate_declared", { loserColor });
  });

  // Forfeit/Resign handler
  socket.on("forfeit_match", () => {
    const targetRoomId = socket.currentRoom;
    if (!targetRoomId) return;

    const room = rooms.get(targetRoomId);
    if (room && room.timerInterval) {
      clearInterval(room.timerInterval);
      rooms.delete(targetRoomId);
    }

    socket.emit("player_forfeited", { youForfeited: true });
    socket.to(targetRoomId).emit("player_forfeited", { youForfeited: false });
  });

  // Handle explicit Exit / Menu click
  socket.on("leave_game", () => {
    const roomId = socket.currentRoom;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room && room.timerInterval) {
      clearInterval(room.timerInterval);
      rooms.delete(roomId);
    }

    socket.to(roomId).emit("opponent_left");
    socket.leave(roomId);
    socket.currentRoom = null;
  });

  socket.on("disconnecting", () => {
    const roomId = socket.currentRoom;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      if (room && room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(roomId);
      socket.to(roomId).emit("opponent_left");
    }
  });

  socket.on("disconnect", () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});