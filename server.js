const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const questions = require('./questions.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const TEAM_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#8338ec', '#ffb703', '#06d6a0', '#ef476f'];
const TRACK_LENGTH = 32; // index 0 = START, index TRACK_LENGTH-1 = FINISH
const QUESTION_SECONDS = 60;

const rooms = {}; // code -> room state

function genCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

function stepsForTime(seconds) {
  if (seconds <= 5) return 6;
  if (seconds <= 10) return 5;
  if (seconds <= 20) return 4;
  if (seconds <= 30) return 3;
  if (seconds <= 45) return 2;
  return 1;
}

function publicRoomState(room) {
  return {
    code: room.code,
    trackLength: TRACK_LENGTH,
    teams: room.teams.map((t) => ({
      name: t.name,
      color: t.color,
      position: t.position,
      score: t.score,
      players: t.players.map((p) => p.name),
      finished: t.finished
    })),
    currentTeamIndex: room.currentTeamIndex,
    phase: room.phase, // 'lobby' | 'question' | 'reveal' | 'finished'
    winner: room.winner || null
  };
}

function makeTeams(n) {
  const teams = [];
  for (let i = 0; i < n; i++) {
    teams.push({
      name: `Kelompok ${i + 1}`,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      position: 0,
      score: 0,
      players: [],
      finished: false
    });
  }
  return teams;
}

function advanceTurn(room) {
  const n = room.teams.length;
  let next = room.currentTeamIndex;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (!room.teams[next].finished) {
      room.currentTeamIndex = next;
      return;
    }
  }
}

function endTurn(room, correct, elapsedSec, teamIndexOverride) {
  const teamIndex = teamIndexOverride ?? room.currentTeamIndex;
  const team = room.teams[teamIndex];
  let steps = 0;

  if (correct) {
    steps = stepsForTime(elapsedSec);
    team.score += 1;
    team.position = Math.min(TRACK_LENGTH - 1, team.position + steps);
    if (team.position >= TRACK_LENGTH - 1) {
      team.finished = true;
      if (!room.winner) room.winner = team.name;
    }
  }

  room.phase = 'reveal';

  io.to(room.code).emit('turn:result', {
    teamIndex,
    teamName: team.name,
    correct,
    steps,
    correctIndex: room.currentQuestion.correctIndex,
    position: team.position,
    finished: team.finished
  });

  if (room.teams.every((t) => t.finished)) {
    room.phase = 'finished';
  }

  advanceTurn(room);
  io.to(room.code).emit('room:update', publicRoomState(room));
}

io.on('connection', (socket) => {
  socket.on('host:create', (numTeams, cb) => {
    const code = genCode();
    const n = Math.max(2, Math.min(8, Number(numTeams) || 4));
    rooms[code] = {
      code,
      hostId: socket.id,
      teams: makeTeams(n),
      currentTeamIndex: 0,
      phase: 'lobby',
      usedQuestions: [],
      currentQuestion: null,
      questionStartedAt: null,
      answeredThisTurn: false,
      winner: null,
      timer: null
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    cb({ code });
    io.to(code).emit('room:update', publicRoomState(rooms[code]));
  });

  socket.on('player:join', ({ code, name, teamIndex }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ error: 'Kode room tidak ditemukan.' });
    if (room.phase === 'finished') return cb({ error: 'Permainan sudah selesai.' });
    const team = room.teams[teamIndex];
    if (!team) return cb({ error: 'Kelompok tidak valid.' });

    team.players.push({ id: socket.id, name: (name || '').trim() || 'Pemain' });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.teamIndex = teamIndex;

    cb({ ok: true, teamIndex, teamName: team.name, color: team.color });
    io.to(code).emit('room:update', publicRoomState(room));
  });

  socket.on('host:startQuestion', (code) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.phase === 'finished') return;

    const available = questions.map((_, i) => i).filter((i) => !room.usedQuestions.includes(i));
    const pool = available.length ? available : questions.map((_, i) => i);
    if (!available.length) room.usedQuestions = [];
    const qi = pool[Math.floor(Math.random() * pool.length)];
    room.usedQuestions.push(qi);

    room.currentQuestion = questions[qi];
    room.questionStartedAt = Date.now();
    room.phase = 'question';
    room.answeredThisTurn = false;

    const team = room.teams[room.currentTeamIndex];
    io.to(code).emit('question:show', {
      text: room.currentQuestion.text,
      options: room.currentQuestion.options,
      teamIndex: room.currentTeamIndex,
      teamName: team.name,
      duration: QUESTION_SECONDS
    });
    io.to(code).emit('room:update', publicRoomState(room));

    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      if (room.phase === 'question' && !room.answeredThisTurn) {
        room.answeredThisTurn = true;
        endTurn(room, false, null);
      }
    }, QUESTION_SECONDS * 1000);
  });

  socket.on('player:answer', ({ code, choiceIndex }) => {
    const room = rooms[code];
    if (!room || room.phase !== 'question' || room.answeredThisTurn) return;
    if (socket.data.teamIndex !== room.currentTeamIndex) return;

    room.answeredThisTurn = true;
    clearTimeout(room.timer);
    const elapsedSec = (Date.now() - room.questionStartedAt) / 1000;
    const correct = choiceIndex === room.currentQuestion.correctIndex;
    endTurn(room, correct, elapsedSec, socket.data.teamIndex);
  });

  socket.on('host:continue', (code) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.phase = room.phase === 'finished' ? 'finished' : 'lobby';
    io.to(code).emit('room:update', publicRoomState(room));
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;

    if (socket.data.isHost) {
      io.to(code).emit('room:closed');
      clearTimeout(room.timer);
      delete rooms[code];
    } else if (socket.data.teamIndex != null) {
      const team = room.teams[socket.data.teamIndex];
      if (team) team.players = team.players.filter((p) => p.id !== socket.id);
      io.to(code).emit('room:update', publicRoomState(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));
