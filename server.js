const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const QUESTION_SECONDS = 8;
const QUESTION_COUNT = 30;

if (!ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. Admin API is disabled until you set it.');
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const initialState = () => ({
  groups: [], questions: [], players: {}, status: 'lobby', currentIndex: -1,
  questionEndsAt: null, startedAt: null, finishedAt: null, lastQuestionCorrect: null
});
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...initialState(), ...s, players: s.players || {} };
  } catch { return initialState(); }
}
let state = loadState();
let advanceTimer = null;
let tickTimer = null;

function saveState() {
  const temp = STATE_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STATE_FILE);
}
function publicQuestion(q) {
  if (!q) return null;
  return { text: q.text, options: q.options };
}
function scorePlayer(p) {
  return { id: p.id, name: p.name, group: p.group, score: p.score, correct: p.correct, answered: p.answered };
}
function snapshot() {
  const players = Object.values(state.players).map(scorePlayer);
  const groups = state.groups.map(g => {
    const members = players.filter(p => p.group === g.name);
    return { name: g.name, count: members.length, score: members.reduce((a, p) => a + p.score, 0), correct: members.reduce((a, p) => a + p.correct, 0) };
  });
  const q = state.status === 'playing' ? state.questions[state.currentIndex] : null;
  return {
    status: state.status,
    groups,
    players: players.sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'vi')),
    playerCount: players.length,
    questionCount: state.questions.length,
    currentIndex: state.currentIndex,
    questionEndsAt: state.questionEndsAt,
    serverNow: Date.now(),
    question: publicQuestion(q),
    // Correct answer is only revealed after the entire quiz to avoid leaking it.
    results: state.status === 'finished' ? state.questions.map((q, i) => ({ number: i + 1, text: q.text, correctIndex: q.correctIndex, correctText: q.options[q.correctIndex] })) : null
  };
}
function broadcast() { io.emit('state', snapshot()); }
function clearAdvance() { if (advanceTimer) clearTimeout(advanceTimer); advanceTimer = null; }
function scheduleAdvance() {
  clearAdvance();
  const delay = Math.max(0, state.questionEndsAt - Date.now());
  advanceTimer = setTimeout(() => advanceQuestion(), delay);
}
function advanceQuestion() {
  if (state.status !== 'playing') return;
  state.lastQuestionCorrect = state.questions[state.currentIndex]?.correctIndex ?? null;
  state.currentIndex += 1;
  if (state.currentIndex >= state.questions.length) {
    state.status = 'finished'; state.questionEndsAt = null; state.finishedAt = Date.now();
    clearAdvance(); saveState(); broadcast(); return;
  }
  state.questionEndsAt = Date.now() + QUESTION_SECONDS * 1000;
  saveState(); broadcast(); scheduleAdvance();
}
function requireAdmin(req, res, next) {
  const pass = req.get('x-admin-password');
  if (!ADMIN_PASSWORD || pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Mật khẩu quản trị không đúng.' });
  next();
}
function cleanText(v, max = 300) { return String(v ?? '').trim().slice(0, max); }

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/state', (_req, res) => res.json(snapshot()));
app.get('/api/admin/config', requireAdmin, (_req, res) => res.json({ groups: state.groups, questions: state.questions, status: state.status, questionSeconds: QUESTION_SECONDS, questionCount: QUESTION_COUNT }));
app.post('/api/admin/groups', requireAdmin, (req, res) => {
  if (state.status === 'playing') return res.status(409).json({ error: 'Không thể sửa nhóm khi bài thi đang diễn ra.' });
  const names = Array.isArray(req.body.groups) ? req.body.groups.map(x => cleanText(x, 60)).filter(Boolean) : [];
  const unique = [...new Set(names)];
  if (!unique.length) return res.status(400).json({ error: 'Nhập ít nhất một tên nhóm.' });
  if (unique.length > 50) return res.status(400).json({ error: 'Tối đa 50 nhóm.' });
  const existing = new Set(unique);
  const oldPlayers = Object.values(state.players);
  state.groups = unique.map(name => ({ name }));
  // Players assigned to removed groups are disconnected from the roster until they rejoin.
  oldPlayers.forEach(p => { if (!existing.has(p.group)) p.group = ''; });
  saveState(); broadcast(); res.json({ ok: true, groups: state.groups });
});
app.post('/api/admin/questions', requireAdmin, (req, res) => {
  if (state.status === 'playing') return res.status(409).json({ error: 'Không thể sửa câu hỏi khi bài thi đang diễn ra.' });
  const qs = Array.isArray(req.body.questions) ? req.body.questions : [];
  if (qs.length !== QUESTION_COUNT) return res.status(400).json({ error: `Cần nhập đủ ${QUESTION_COUNT} câu hỏi. Hiện có ${qs.length} câu.` });
  const normalized = [];
  for (let i = 0; i < qs.length; i++) {
    const text = cleanText(qs[i].text, 500);
    const options = Array.isArray(qs[i].options) ? qs[i].options.map(x => cleanText(x, 250)) : [];
    const correctIndex = Number(qs[i].correctIndex);
    if (!text || options.length !== 4 || options.some(x => !x) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return res.status(400).json({ error: `Câu ${i + 1}: cần nội dung, đủ 4 đáp án và chọn đáp án đúng.` });
    }
    normalized.push({ text, options, correctIndex });
  }
  state.questions = normalized;
  saveState(); broadcast(); res.json({ ok: true, count: normalized.length });
});
app.post('/api/admin/start', requireAdmin, (_req, res) => {
  if (state.status === 'playing') return res.status(409).json({ error: 'Bài thi đang diễn ra.' });
  if (state.groups.length === 0) return res.status(400).json({ error: 'Hãy tạo nhóm trước.' });
  if (state.questions.length !== QUESTION_COUNT) return res.status(400).json({ error: `Cần lưu đủ ${QUESTION_COUNT} câu hỏi trước khi bắt đầu.` });
  Object.values(state.players).forEach(p => { p.score = 0; p.correct = 0; p.answered = 0; p.answers = {}; });
  state.status = 'playing'; state.currentIndex = 0; state.startedAt = Date.now(); state.finishedAt = null;
  state.questionEndsAt = Date.now() + QUESTION_SECONDS * 1000;
  saveState(); broadcast(); scheduleAdvance(); res.json({ ok: true });
});
app.post('/api/admin/reset', requireAdmin, (_req, res) => {
  clearAdvance();
  state.status = 'lobby'; state.currentIndex = -1; state.questionEndsAt = null; state.startedAt = null; state.finishedAt = null; state.lastQuestionCorrect = null;
  Object.values(state.players).forEach(p => { p.score = 0; p.correct = 0; p.answered = 0; p.answers = {}; });
  saveState(); broadcast(); res.json({ ok: true });
});

io.on('connection', socket => {
  socket.emit('state', snapshot());
  socket.on('join', payload => {
    if (state.status !== 'lobby') return socket.emit('notice', 'Bài thi đã bắt đầu hoặc kết thúc. Bạn không thể tham gia lúc này.');
    const name = cleanText(payload?.name, 80);
    const group = cleanText(payload?.group, 60);
    if (name.length < 2) return socket.emit('notice', 'Họ và tên cần có ít nhất 2 ký tự.');
    if (!state.groups.some(g => g.name === group)) return socket.emit('notice', 'Hãy chọn một nhóm hợp lệ.');
    const duplicate = Object.values(state.players).some(p => p.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));
    if (duplicate) return socket.emit('notice', 'Tên này đã có người sử dụng. Hãy nhập tên kèm ký tự phân biệt.');
    const player = { id: socket.id, name, group, score: 0, correct: 0, answered: 0, answers: {}, connected: true };
    state.players[socket.id] = player; socket.data.playerId = socket.id;
    saveState(); socket.emit('joined', { id: socket.id, name, group }); broadcast();
  });
  socket.on('answer', payload => {
    const p = state.players[socket.data.playerId];
    if (!p || state.status !== 'playing') return;
    const idx = state.currentIndex;
    if (Date.now() > state.questionEndsAt || p.answers[idx] !== undefined) return;
    const answerIndex = Number(payload?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;
    const q = state.questions[idx];
    const correct = answerIndex === q.correctIndex;
    p.answers[idx] = { answerIndex, correct, at: Date.now() };
    p.answered += 1;
    if (correct) {
      // Faster correct answers earn a small speed bonus; base score is 1000.
      const remaining = Math.max(0, state.questionEndsAt - Date.now());
      p.score += 1000 + Math.round(remaining / (QUESTION_SECONDS * 1000) * 500);
      p.correct += 1;
    }
    saveState(); socket.emit('answerAck', { accepted: true }); broadcast();
  });
  socket.on('disconnect', () => {
    const p = state.players[socket.data.playerId];
    if (p) { p.connected = false; saveState(); broadcast(); }
  });
});

// Keep clients' countdown display aligned with the server clock.
tickTimer = setInterval(() => { if (state.status === 'playing') io.emit('clock', { now: Date.now(), endsAt: state.questionEndsAt }); }, 500);
server.listen(PORT, () => {
  console.log(`Quiz Live running on port ${PORT}`);
  // Resume the authoritative timer after a process restart.
  if (state.status === 'playing' && state.questionEndsAt) scheduleAdvance();
});
