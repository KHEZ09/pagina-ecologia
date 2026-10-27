const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const sessions = new Map();

const questions = [
  { id: 1, text: '¿Qué es la gamificación?', options: ['Usar elementos de juego en contextos no lúdicos', 'Crear videojuegos profesionales', 'Eliminar todas las reglas'], answer: 0, explanation: 'La gamificación usa puntos, niveles, rankings u otros elementos de juego en actividades que no son juegos.' },
  { id: 2, text: '¿Cuál es una métrica de vanidad?', options: ['Toneladas pesadas en báscula', 'Descargas de una app', 'Kg reciclados frente a un grupo control'], answer: 1, explanation: 'Las descargas pueden crecer sin demostrar un cambio de comportamiento.' },
  { id: 3, text: '¿Qué redujo Opower en promedio?', options: ['2,0 % del consumo de energía', '26 kWh diarios', '90 % de los residuos'], answer: 0, explanation: 'Los informes de energía redujeron el consumo promedio en 2,0 %.' },
  { id: 4, text: 'Para evaluar una app ambiental, ¿qué conviene medir primero?', options: ['El color de sus insignias', 'El número de seguidores', 'Un resultado real y verificable'], answer: 2, explanation: 'La medición debe conectarse con kg, kWh o CO₂ verificados.' },
  { id: 5, text: 'Verdadero o falso: una app por sí sola garantiza un cambio duradero.', options: ['Verdadero', 'Falso'], answer: 1, explanation: 'Los efectos suelen ser pequeños o temporales si no existe una infraestructura real que los sostenga.' },
  { id: 6, text: '¿Cuál es una señal de posible maquillaje verde digital?', options: ['Publicar la metodología de cálculo', 'Medir con un grupo de comparación', 'Mostrar impacto sin explicar cómo se calculó'], answer: 2, explanation: 'Una cifra sin metodología impide verificar si el impacto es real.' },
  { id: 7, text: '¿Qué conecta mejor una app de reciclaje con la realidad?', options: ['Una colección de stickers', 'Recogida y pesaje por recicladores', 'Un ranking sin entregas'], answer: 1, explanation: 'La logística y el pesaje convierten la interacción digital en un resultado físico.' },
  { id: 8, text: '¿Qué significa nudge?', options: ['Un empujoncito que cambia la presentación de una decisión', 'Una multa ambiental', 'Una contraseña de acceso'], answer: 0, explanation: 'Un nudge orienta una decisión sin prohibir opciones ni aumentar precios.' },
  { id: 9, text: '¿Qué debería hacer una propuesta responsable para quienes tienen poca conectividad?', options: ['Exigir siempre una app', 'Ofrecer alternativas como WhatsApp o SMS', 'Excluirlos del piloto'], answer: 1, explanation: 'El diseño debe contemplar baja conectividad y reducir la brecha digital.' },
  { id: 10, text: '¿Cuál sería un buen criterio de éxito para el piloto de Neiva?', options: ['Conseguir muchas descargas', 'Superar una meta frente a un barrio de control', 'Tener un logo atractivo'], answer: 1, explanation: 'El éxito debe definirse antes y compararse con un grupo de control.' }
];

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let s = ''; req.on('data', c => s += c); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); }); }
function resultsFor(s) { return [...s.players.values()].map(p => ({ name: p.name, score: s.questions.reduce((a, q, i) => a + (p.answers?.[i] === q.answer ? 1 : 0), 0), total: s.questions.length })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); }
function csvValue(value) { return '"' + String(value ?? '').replaceAll('"', '""') + '"'; }
function backupCsv(s) { const header = ['Nombre', ...s.questions.map((q, i) => `P${i + 1}`), 'Puntaje', 'Total']; const rows = [...s.players.values()].map(p => [p.name, ...s.questions.map((q, i) => p.answers?.[i] === undefined ? '' : p.answers[i] === q.answer ? 'Correcta' : 'Incorrecta'), p.answers ? s.questions.reduce((a, q, i) => a + (p.answers[i] === q.answer ? 1 : 0), 0) : 0, s.questions.length]); return '\uFEFF' + [header, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n'); }
function publicState(session, role, id) {
  const q = session.questions[session.questionIndex];
  const player = id ? session.players.get(id) : null;
  const feedback = role === 'player' && player && q && player.answers?.[session.questionIndex] !== undefined ? { selected: player.answers[session.questionIndex], correct: player.answers[session.questionIndex] === q.answer, correctAnswer: q.answer, explanation: q.explanation, score: session.questions.reduce((a, item, i) => a + (player.answers?.[i] === item.answer ? 1 : 0), 0) } : null;
  return { role, code: session.code, phase: session.phase, questionIndex: session.questionIndex, total: session.questions.length, question: role === 'host' ? q : (session.phase === 'question' || session.phase === 'review' ? { id: q.id, text: q.text, options: q.options } : null), currentAnswered: Boolean(player && player.answer !== undefined), players: [...session.players.values()].map(p => ({ id: p.id, name: p.name, answered: p.answer !== undefined })), answered: [...session.players.values()].filter(p => p.answer !== undefined).length, hostStarted: session.phase !== 'lobby', feedback, results: session.phase === 'finished' ? resultsFor(session) : session.results };
}
function code() { let c; do c = String(Math.floor(100000 + Math.random() * 900000)); while (sessions.has(c)); return c; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/session' && req.method === 'POST') { const c = code(); sessions.set(c, { code: c, phase: 'lobby', questionIndex: -1, questions, players: new Map(), results: null }); return json(res, 200, { code: c, state: publicState(sessions.get(c), 'host') }); }
    if (url.pathname === '/api/join' && req.method === 'POST') { const { code: c, name } = await body(req); const s = sessions.get(String(c)); if (!s || !name?.trim()) return json(res, 400, { error: 'Sala o nombre inválido.' }); const id = crypto.randomUUID(); s.players.set(id, { id, name: name.trim().slice(0, 24) }); return json(res, 200, { id, state: publicState(s, 'player', id) }); }
    const match = url.pathname.match(/^\/api\/session\/(\d+)\/state$/); if (match && req.method === 'GET') { const s = sessions.get(match[1]); if (!s) return json(res, 404, { error: 'Sala no encontrada.' }); const role = url.searchParams.get('role') || 'player'; return json(res, 200, publicState(s, role, url.searchParams.get('id'))); }
    const backup = url.pathname.match(/^\/api\/session\/(\d+)\/backup\.(csv|json)$/); if (backup && req.method === 'GET') { const s = sessions.get(backup[1]); if (!s) return json(res, 404, { error: 'Sala no encontrada.' }); const ext = backup[2]; const content = ext === 'csv' ? backupCsv(s) : JSON.stringify({ code: s.code, exportedAt: new Date().toISOString(), questions: s.questions, participants: [...s.players.values()] }, null, 2); res.writeHead(200, { 'Content-Type': ext === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="ecotrivia-${s.code}.${ext}"`, 'Cache-Control': 'no-store' }); return res.end(content); }
    const action = url.pathname.match(/^\/api\/session\/(\d+)\/(start|next|answer|finish)$/); if (action && req.method === 'POST') { const s = sessions.get(action[1]); if (!s) return json(res, 404, { error: 'Sala no encontrada.' }); const op = action[2]; const data = await body(req);
      if (op === 'start') { s.phase = 'question'; s.questionIndex = 0; }
      if (op === 'next') { s.questionIndex++; s.players.forEach(p => delete p.answer); s.phase = s.questionIndex >= s.questions.length ? 'finished' : 'question'; }
      if (op === 'answer') { const p = s.players.get(data.id); if (!p || s.phase !== 'question' || p.answer !== undefined) return json(res, 400, { error: 'Respuesta no válida.' }); p.answer = Number(data.answer); p.answers = p.answers || {}; p.answers[s.questionIndex] = p.answer; p.correct = p.answer === s.questions[s.questionIndex].answer; p.at = Date.now(); if ([...s.players.values()].length && [...s.players.values()].every(x => x.answer !== undefined)) s.phase = 'review'; }
      if (op === 'finish') { s.phase = 'finished'; s.results = resultsFor(s); }
      return json(res, 200, publicState(s, data.role || (op === 'answer' ? 'player' : 'host'), data.id));
    }
    let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1); file = path.join(PUBLIC, file); if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return json(res, 404, { error: 'No encontrado.' }); const ext = path.extname(file); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, 500, { error: e.message }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Trivia lista en http://localhost:${PORT}`));
