/**
 * Coke's Darts - Vanilla JS (Presas Edition V3)
 * Multiplayer Cricket Cut Throat
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Synthetic 8-Bit Audio Manager ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSynth(type, freqs, duration) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    let now = audioCtx.currentTime;
    if (Array.isArray(freqs)) {
        osc.frequency.setValueAtTime(freqs[0], now);
        for(let i=1; i<freqs.length; i++){
            osc.frequency.exponentialRampToValueAtTime(freqs[i], now + (duration * (i/(freqs.length-1))));
        }
    } else {
        osc.frequency.setValueAtTime(freqs, now);
    }
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.start(now);
    osc.stop(now + duration);
}

function playSound(soundKey) {
    if (soundKey === 'throw') playSynth('square', [800, 200], 0.15);
    else if (soundKey === 'hit') playSynth('square', [1200, 1600], 0.1);
    else if (soundKey === 'miss') playSynth('sawtooth', [150, 50], 0.3);
    else if (soundKey === 'turn') playSynth('square', [440, 659, 880], 0.3);
    else if (soundKey === 'speech') {
        playSynth('square', [800, 800], 0.05);
        setTimeout(() => playSynth('square', [800, 800], 0.05), 100);
        setTimeout(() => playSynth('square', [800, 800], 0.05), 200);
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Game States ---
const STATES = { INTRO: 0, MENU_PLAYERS: 1, GAME: 2, GAME_OVER: 3 };
let currentState = STATES.INTRO;

// --- Cricket Constants ---
const TARGETS = [15, 16, 17, 18, 19, 20, 25];
const BOARD_SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// --- Dialogues ---
const COKE_BRAGS = ["¡SOY EL MEJOR!", "¡EZ!", "¡APRENDED!", "¡DEMASIADO FACIL!", "¡NO SOIS RIVALES!"];
const COKE_FEAR = ["¡QUE FRIO!", "¡MIS MANOS!", "¡NO SIENTO LOS DEDOS!", "¡ME CONGELO!", "¡AAAY!"];
// Generic player dialogues
const PLAYER_BRAGS = ["Got 'em!", "That's how it's done!", "Boom!", "Nice shot!", "Take that!"];
const PLAYER_EXCUSES = ["Bad luck!", "The wind!", "My hand slipped!", "Bad angle!", "You cheated!"];

// --- Game Data ---
let numPlayersSelected = 2;
let tempNames = ["COKE", "P2", "P3", "P4"];

let players = [];
let currentPlayerIdx = 0;
let dartsLeft = 3;
let frameCount = 0;
let lastTime = 0;
let gameTurn = 1; // Global Turn Counter

let turnPhase = 0; 
let errorMargin = 0; // 0 to 1
let sweetSpotAngle = 0;
let needleAngle = 0;
let needleDir = 1;

let cursorTime = 0;
let cursorSpeed = 1;
let cursorPattern = 0;
let cursorPhaseOffset = 0;

let finalTarget = null;
let flyTimer = 0;
let cokeSpeechTimer = 0;
let cokeSpeechText = "";
// Generic player speech variables
let genericSpeechTimer = 0;
let genericSpeechText = "";
let pendingGameOver = false;

let cokeTriplesThisTurn = 0;
let cokeTripleDartIndex = 1;
let scoreAnimX = 0, scoreAnimY = 0, scoreAnimDestX = 0, scoreAnimDestY = 0, scoreAnimTimer = 0;
const DISPLAY_TARGETS = [20, 19, 18, 17, 16, 15, 25];

// --- Initialization ---
function initPlayers(numPlayers) {
    players = [];
    for(let i=0; i<numPlayers; i++) {
        players.push({
            id: i,
            name: i === 0 ? "COKE" : tempNames[i],
            isCoke: i === 0,
            isHero: i === 1,
            score: 0,
            marks: {15:0, 16:0, 17:0, 18:0, 19:0, 20:0, 25:0},
            turnsPlayed: 0
        });
    }
    currentPlayerIdx = 0;
    dartsLeft = 3;
    gameTurn = 1;
}

// --- Draw Helpers ---
function drawText(text, x, y, size = 10, color = "#fff", align = "center") {
    ctx.fillStyle = color;
    ctx.font = `${size}px "Press Start 2P"`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
}

function drawButton(text, x, y, w, h, isSelected) {
    ctx.fillStyle = isSelected ? "#0a0" : "#333";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    drawText(text, x + w/2, y + h/2, 14, "#fff");
}

// --- Main Loop ---
function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    frameCount++;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch(currentState) {
        case STATES.INTRO: drawIntro(dt); break;
        case STATES.MENU_PLAYERS: drawMenuPlayers(); break;
        case STATES.GAME: updateGame(dt); drawGame(); break;
        case STATES.GAME_OVER: drawGameOver(); break;
    }

    requestAnimationFrame(loop);
}

// --- Input Handling ---
canvas.addEventListener('mousedown', (e) => handleInteraction(e.clientX, e.clientY));
canvas.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

function handleInteraction(x, y) {
    if (currentState === STATES.INTRO) {
        currentState = STATES.MENU_PLAYERS;
        playSound('turn');
    } else if (currentState === STATES.MENU_PLAYERS) {
        // Simple hitboxes for 2, 3, 4 players
        if (y > 200 && y < 250) { numPlayersSelected = 2; startGame(); }
        else if (y > 270 && y < 320) { numPlayersSelected = 3; startGame(); }
        else if (y > 340 && y < 390) { numPlayersSelected = 4; startGame(); }
    } else if (currentState === STATES.GAME) {
        handleGameTap();
    } else if (currentState === STATES.GAME_OVER) {
        currentState = STATES.MENU_PLAYERS;
    }
}

function startGame() {
    initPlayers(numPlayersSelected);
    currentState = STATES.GAME;
    startTurn();
}

// --- Menus Drawing ---
let introY = canvas.height;
let introScrollY = canvas.height + 80;
let introMusicTimer = 0;
const introNotes = [261, 329, 392, 523, 392, 329, 261, 196]; 
let noteIdx = 0;

const introText = [
    "THE LEGEND OF COKE",
    "",
    "FROM DARTS TO COLD",
    "",
    "HE WAS ONCE A CHAMPION...",
    "UNTIL THE ICE TOOK OVER."
];

function drawIntro(dt) {
    introY -= 0.05 * dt;
    if (introY < -100) introY = canvas.height;
    
    introScrollY -= 0.03 * dt;
    if (introScrollY < -200) introScrollY = canvas.height + 80;
    
    introMusicTimer += dt;
    if (introMusicTimer > 250) {
        introMusicTimer = 0;
        playSynth('square', [introNotes[noteIdx], introNotes[noteIdx]], 0.1);
        noteIdx = (noteIdx + 1) % introNotes.length;
    }

    drawText("COKE'S DARTS", canvas.width/2, introY, 24, "#0ff");
    
    for(let i=0; i<introText.length; i++) {
        drawText(introText[i], canvas.width/2, introScrollY + (i*20), 10, "#fff");
    }
    
    if (frameCount % 60 < 30) drawText("TAP TO START", canvas.width/2, canvas.height - 50, 12, "#ff0");
}

function drawMenuPlayers() {
    drawText("SELECT PLAYERS", canvas.width/2, 100, 16, "#0ff");
    let cx = canvas.width/2;
    drawButton("2 PLAYERS", cx - 100, 200, 200, 50, false);
    drawButton("3 PLAYERS", cx - 100, 270, 200, 50, false);
    drawButton("4 PLAYERS", cx - 100, 340, 200, 50, false);
}

// --- Game Logic ---
function startTurn() { 
    turnPhase = 0; 
    cokeSpeechTimer = 0;
    cokeTriplesThisTurn = 0;
    cokeTripleDartIndex = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
    playSound('turn');
}

function countCokeClosedNumbers() {
    let count = 0;
    for(let t of TARGETS) {
        if (players[0].marks[t] >= 3) count++;
    }
    return count;
}

function getCokeScriptedTarget(cx, cy, maxRadius) {
    const p = players[0];
    
    let closedCount = countCokeClosedNumbers();

    // Condition: Si acierta mas por si mismo, en cuanto tenga 5 numeros cerrados debe fallar.
    // Also, turns 6+ must fail.
    if (closedCount >= 5 || p.turnsPlayed >= 5) {
        return { val: 0, mult: 1, x: -100, y: -100 }; 
    }

    // Must hit at least one triple in the first 5 turns per turn
    let unclosed = TARGETS.filter(t => p.marks[t] < 3);
    if (unclosed.length === 0) return { val: 0, mult: 1, x: -100, y: -100 };
    
    let targetNum = unclosed[0];
    
    // Strict logic: 1 triple per turn, the rest miss.
    if (dartsLeft === cokeTripleDartIndex) {
        cokeTriplesThisTurn++;
        return resolveVisualCoordinates(targetNum, 3, cx, cy, maxRadius);
    } else {
        // Intentional miss
        return { val: 0, mult: 1, x: -100, y: -100 };
    }
}

function getHeroScriptedTarget(cx, cy, maxRadius) {
    const p = players[1];
    const coke = players[0];
    for (let t of TARGETS) {
        if (p.marks[t] < 3) return resolveVisualCoordinates(t, 3, cx, cy, maxRadius);
    }
    for (let t of TARGETS) {
        if (coke.marks[t] < 3) return resolveVisualCoordinates(t, 3, cx, cy, maxRadius);
    }
    return resolveVisualCoordinates(20, 3, cx, cy, maxRadius);
}

function resolveVisualCoordinates(targetVal, targetMult, cx, cy, maxRadius) {
    if (targetVal === 25) {
        let r = targetMult === 2 ? maxRadius * 0.03 : maxRadius * 0.11;
        return { val: 25, mult: targetMult, x: cx, y: cy - r };
    }
    let segIdx = BOARD_SEGMENTS.indexOf(targetVal);
    let anglePerSegment = (Math.PI * 2) / 20;
    let angle = -Math.PI/2 + (segIdx * anglePerSegment);
    
    let dist = maxRadius * 0.3; 
    if (targetMult === 3) dist = maxRadius * 0.575;
    if (targetMult === 2) dist = maxRadius * 0.825;

    let x = cx + Math.cos(angle) * dist;
    let y = cy + Math.sin(angle) * dist;
    return { val: targetVal, mult: targetMult, x: x, y: y };
}

function handleGameTap() {
    if (cokeSpeechTimer > 0) return; // Block input while talking
    
    const p = players[currentPlayerIdx];
    let cx = canvas.width / 2;
    let cy = 380; 
    let radius = Math.min(canvas.width, 360) * 0.45;

    if (turnPhase === 0) {
        turnPhase = 1;
        sweetSpotAngle = Math.random() * Math.PI;
        needleAngle = 0;
        needleDir = 1;
    } else if (turnPhase === 1) {
        const diff = Math.abs(needleAngle - sweetSpotAngle);
        // Sweet spot is 10 degrees (~0.174 rads).
        let sweetSpotHalf = 0.174 / 2;
        if (diff <= sweetSpotHalf) {
            errorMargin = 0.01; // Perfect
        } else {
            errorMargin = (diff / Math.PI); // 0 to 1
        }
        
        // Speed ranges from very slow (perfect) to very fast (terrible)
        cursorSpeed = 0.001 + (errorMargin * 0.015);
        cursorPattern = Math.floor(Math.random() * 3); // 0: Lissajous, 1: Circle, 2: Figure-8
        cursorPhaseOffset = Math.random() * Math.PI * 2;
        
        turnPhase = 2;
        cursorTime = 0;
    } else if (turnPhase === 2) {
        turnPhase = 3;
        flyTimer = 0;
        
        let targetPos = getCursorPosition(cx, cy, radius, cursorTime, cursorSpeed, cursorPattern, cursorPhaseOffset);
        
        if (p.isCoke) {
            finalTarget = getCokeScriptedTarget(cx, cy, radius);
        } else if (p.isHero && p.turnsPlayed >= 14 && p.score >= players[0].score) {
            finalTarget = getHeroScriptedTarget(cx, cy, radius);
        } else {
            // Because errorMargin controls cursor speed, the dart hits exactly where the cursor is, 
            // but it's much harder to time it if it's moving fast!
            // We add a tiny micro-dispersion just to prevent perfect pixel stacking.
            let microError = radius * 0.02;
            finalTarget = calculateHit(targetPos.x + (Math.random()-0.5)*microError, targetPos.y + (Math.random()-0.5)*microError, cx, cy, radius);
        }
        playSound('throw');
    }
}

function getCursorPosition(cx, cy, radius, time, speed, pattern, offset) {
    let t = (time * speed) + offset;
    let x, y;
    if (pattern === 0) {
        // Lissajous 3:2
        x = cx + Math.sin(t * 3) * radius;
        y = cy + Math.sin(t * 2) * radius;
    } else if (pattern === 1) {
        // Rose curve (4 petals)
        let r = Math.cos(t * 2) * radius;
        x = cx + Math.cos(t) * r;
        y = cy + Math.sin(t) * r;
    } else {
        // Figure-8 (Lissajous 1:2)
        x = cx + Math.sin(t) * radius;
        y = cy + Math.sin(t * 2) * radius;
    }
    return { x, y };
}

function updateGame(dt) {
    if (cokeSpeechTimer > 0) {
        cokeSpeechTimer -= dt;
        if (cokeSpeechTimer <= 0) startTurn();
        return;
    }
    // Generic speech timer handling (similar to coke)
    if (genericSpeechTimer > 0) {
        genericSpeechTimer -= dt;
        if (genericSpeechTimer <= 0) {
            if (pendingGameOver) {
                currentState = STATES.GAME_OVER;
                pendingGameOver = false;
            }
        }
        return;
    }

    if (turnPhase === 1) {
        // Needle speed constant
        needleAngle += 0.003 * dt * needleDir;
        if (needleAngle > Math.PI) { needleAngle = Math.PI; needleDir = -1; }
        if (needleAngle < 0) { needleAngle = 0; needleDir = 1; }
    } else if (turnPhase === 2) {
        cursorTime += dt;
    } else if (turnPhase === 3) {
        flyTimer += dt;
        if (flyTimer > 1000) {
            processHit(finalTarget);
            
            const p = players[currentPlayerIdx];
            if (p.isCoke && finalTarget && finalTarget.mult === 3 && DISPLAY_TARGETS.includes(finalTarget.val)) {
                turnPhase = 4;
                scoreAnimTimer = 0;
                scoreAnimX = finalTarget.x;
                scoreAnimY = finalTarget.y;
                let tIdx = DISPLAY_TARGETS.indexOf(finalTarget.val);
                let mx = canvas.width * 0.18; // Left matrix X center
                scoreAnimDestX = (mx - 36) + (tIdx * 12);
                scoreAnimDestY = 70; // Coke's bottom dot Y
            } else {
                nextDart();
            }
        }
    } else if (turnPhase === 4) {
        scoreAnimTimer += dt;
        if (scoreAnimTimer > 800) {
            nextDart();
        }
    }
}

function processHit(hit) {
    if (!hit || hit.val === 0) {
        // Miss: play sound and trigger excuse phrase for current player
        playSound('miss');
        const p = players[currentPlayerIdx];
        genericSpeechTimer = 3000;
        genericSpeechText = PLAYER_EXCUSES[Math.floor(Math.random() * PLAYER_EXCUSES.length)];
        playSound('speech');
        return;
    }
    playSound('hit');
    const p = players[currentPlayerIdx];
    let hitsRemaining = hit.mult;
    let currentMarks = p.marks[hit.val];
    let marksToAdd = Math.min(3 - currentMarks, hitsRemaining);
    p.marks[hit.val] += marksToAdd;
    hitsRemaining -= marksToAdd;
    if (hitsRemaining > 0) {
        const points = hit.val * hitsRemaining;
        players.forEach(op => {
            if (op.id !== p.id && op.marks[hit.val] < 3) op.score += points;
        });
    }
}

function nextDart() {
    dartsLeft--;
    if (dartsLeft === 0) {
        let p = players[currentPlayerIdx];
        p.turnsPlayed++;
        
        // Setup dialogue if Coke
        if (p.isCoke) {
            cokeSpeechTimer = 3000;
            playSound('speech');
            if (p.turnsPlayed <= 5 && countCokeClosedNumbers() < 5) {
                cokeSpeechText = COKE_BRAGS[Math.floor(Math.random() * COKE_BRAGS.length)];
            } else {
                cokeSpeechText = COKE_FEAR[Math.floor(Math.random() * COKE_FEAR.length)];
            }
        }

        currentPlayerIdx = (currentPlayerIdx + 1) % players.length;
        dartsLeft = 3;
        if (currentPlayerIdx === 0) gameTurn++;
        
        if (!p.isCoke) startTurn(); // Only block if Coke is talking
    } else {
        turnPhase = 0;
    }
    
    // Win check
    for (let p of players) {
        let allClosed = TARGETS.every(t => p.marks[t] === 3);
        if (allClosed) {
            let lowestScore = Math.min(...players.map(pl => pl.score));
            if (p.score === lowestScore) {
                // Trigger brag before ending the game
                genericSpeechTimer = 3000;
                genericSpeechText = PLAYER_BRAGS[Math.floor(Math.random() * PLAYER_BRAGS.length)];
                playSound('speech');
                pendingGameOver = true;
                return;
            }
        }
    }
}

function calculateHit(tx, ty, cx, cy, maxRadius) {
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > maxRadius) return { val: 0, mult: 1, x: tx, y: ty };
    if (dist <= maxRadius * 0.07) return { val: 25, mult: 2, x: tx, y: ty };
    if (dist <= maxRadius * 0.15) return { val: 25, mult: 1, x: tx, y: ty };

    let angle = Math.atan2(dy, dx) + Math.PI/2;
    if (angle < 0) angle += Math.PI * 2;
    const anglePerSegment = (Math.PI * 2) / 20;
    angle += anglePerSegment / 2;
    if (angle > Math.PI * 2) angle -= Math.PI * 2;

    const segmentIdx = Math.floor(angle / anglePerSegment);
    const val = BOARD_SEGMENTS[segmentIdx];
    
    let mult = 1;
    if (dist > maxRadius * 0.55 && dist <= maxRadius * 0.6) mult = 3;
    else if (dist > maxRadius * 0.8 && dist <= maxRadius * 0.85) mult = 2;

    if (!TARGETS.includes(val)) return { val: 0, mult: 1, x: tx, y: ty };
    return { val, mult, x: tx, y: ty };
}

// --- Draw Functions ---

function drawLEDMarquee() {
    const w = canvas.width;
    const h = 180;
    
    // Background and border mimicking Presas machine
    ctx.fillStyle = "#111"; 
    ctx.fillRect(0, 0, w, h);
    
    // Burgundy top arc/border
    ctx.strokeStyle = "#500000"; 
    ctx.lineWidth = 6; 
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // --- Center Scores Area ---
    const cx = w / 2;
    // Score boxes
    let scorePoses = [
        {x: cx - 60, y: 50},  // P1 (Coke)
        {x: cx + 60, y: 50},  // P2
        {x: cx - 60, y: 110}, // P3
        {x: cx + 60, y: 110}  // P4
    ];

    drawText(`TURN ${gameTurn}`, cx, 80, 10, "#ff0");
    drawText(`DART ${4 - dartsLeft}`, cx, 95, 8, "#fff");

    players.forEach((p, idx) => {
        let pos = scorePoses[idx];
        if (!pos) return;

        // Player Name
        drawText(p.name, pos.x, pos.y - 15, 8, "#fff");
        
        // Red LED Score Box
        ctx.fillStyle = "#200";
        ctx.fillRect(pos.x - 30, pos.y - 5, 60, 25);
        if (idx === currentPlayerIdx) {
            ctx.strokeStyle = "#ff0";
            ctx.lineWidth = 2;
            ctx.strokeRect(pos.x - 30, pos.y - 5, 60, 25);
        }
        drawText(p.score.toString().padStart(3, '0'), pos.x, pos.y + 8, 16, "#f00");
    });

    // --- Cricket Matrices (Left and Right) ---
    // Left: P1 (Top), P3 (Bottom)
    // Right: P2 (Top), P4 (Bottom)
    
    function drawMatrix(side, topPlayerIdx, bottomPlayerIdx) {
        let mx = side === 'left' ? w * 0.18 : w * 0.82;
        
        // Title
        drawText("CRICKET", mx, 25, 8, "#fd0");
        
        // Numbers
        let numStrX = mx - 36;
        DISPLAY_TARGETS.forEach(t => {
            let label = t === 25 ? "B" : t.toString();
            drawText(label, numStrX, 40, 7, "#fff");
            numStrX += 12;
        });

        // Function to draw 3 vertical dots for a player's marks
        const drawPlayerDots = (pIdx, startY) => {
            const p = players[pIdx];
            if (!p) return;
            let colX = mx - 36;
            DISPLAY_TARGETS.forEach(t => {
                let marks = p.marks[t];
                // 3 dots vertically. Bottom to top.
                for (let dot = 0; dot < 3; dot++) {
                    let dotY = startY - (dot * 8); 
                    // dot=0 is bottom (1 mark), dot=1 is middle (2 marks), dot=2 is top (3 marks)
                    let isLit = marks >= (dot + 1);
                    ctx.beginPath();
                    ctx.arc(colX, dotY, 2.5, 0, Math.PI*2);
                    ctx.fillStyle = isLit ? "#f00" : "#333";
                    ctx.fill();
                }
                colX += 12;
            });
        };

        // Draw top grid (P1 or P2)
        drawPlayerDots(topPlayerIdx, 70);
        
        // Draw bottom grid (P3 or P4)
        // If there's no P3 or P4, just draw empty unlit dots
        drawPlayerDots(bottomPlayerIdx, 130);
        
        // Draw unlit grid if player doesn't exist
        if (!players[bottomPlayerIdx]) {
            let colX = mx - 36;
            DISPLAY_TARGETS.forEach(t => {
                for (let dot = 0; dot < 3; dot++) {
                    let dotY = 130 - (dot * 8); 
                    ctx.beginPath();
                    ctx.arc(colX, dotY, 2.5, 0, Math.PI*2);
                    ctx.fillStyle = "#333";
                    ctx.fill();
                }
                colX += 12;
            });
        }
        
        // Numbers again for bottom grid
        let numStrX2 = mx - 36;
        DISPLAY_TARGETS.forEach(t => {
            let label = t === 25 ? "B" : t.toString();
            drawText(label, numStrX2, 145, 7, "#fff");
            numStrX2 += 12;
        });
    }

    drawMatrix('left', 0, 2);  // Coke (0) and P3 (2)
    drawMatrix('right', 1, 3); // P2 (1) and P4 (3)
}

function drawGame() {
    drawLEDMarquee();

    const cx = canvas.width / 2;
    const cy = 380; 
    const radius = Math.min(canvas.width, 360) * 0.45;
    const p = players[currentPlayerIdx];

    // 1. Draw Presas Board
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.15, 0, Math.PI*2); ctx.fillStyle = '#601010'; ctx.fill();
    for(let i=0; i<20; i++) {
        let angStart = -Math.PI/2 - (Math.PI/20) + (i * Math.PI/10);
        let angEnd = angStart + (Math.PI/10);
        
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius * 0.8, angStart, angEnd);
        ctx.fillStyle = i%2===0 ? '#111' : '#ffe4b5'; ctx.fill(); ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, cy, radius*0.6, angStart, angEnd); ctx.arc(cx, cy, radius*0.55, angEnd, angStart, true);
        ctx.fillStyle = i%2===0 ? '#d00' : '#0a0'; ctx.fill(); ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, cy, radius*0.85, angStart, angEnd); ctx.arc(cx, cy, radius*0.8, angEnd, angStart, true);
        ctx.fillStyle = i%2===0 ? '#d00' : '#0a0'; ctx.fill(); ctx.stroke();

        let numAngle = angStart + (Math.PI/20); let numDist = radius * 1.02;
        drawText(BOARD_SEGMENTS[i].toString(), cx + Math.cos(numAngle)*numDist, cy + Math.sin(numAngle)*numDist, 12, "#fff");
    }
    
    ctx.beginPath(); ctx.arc(cx, cy, radius*0.15, 0, Math.PI*2); ctx.fillStyle = '#0a0'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius*0.07, 0, Math.PI*2); ctx.fillStyle = '#d00'; ctx.fill(); ctx.stroke();

    // 2. Draw Phases UI
    if (turnPhase === 0 && cokeSpeechTimer <= 0) {
        drawText("TAP TO AIM", cx, cy + radius * 1.25, 14, "#ff0");
    } 
    else if (turnPhase === 1) {
        const ox = cx, oy = cy + radius * 1.25, or = 80;
        ctx.beginPath(); ctx.arc(ox, oy, or, Math.PI, 0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        
        // Sweet spot (10 degrees)
        let swAngleStart = Math.PI + sweetSpotAngle - 0.087;
        let swAngleEnd = Math.PI + sweetSpotAngle + 0.087;
        ctx.beginPath(); ctx.arc(ox, oy, or, swAngleStart, swAngleEnd); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 6; ctx.stroke();
        
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(Math.PI + needleAngle)*or, oy + Math.sin(Math.PI + needleAngle)*or); ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.stroke();
    }
    else if (turnPhase === 2) {
        let targetPos = getCursorPosition(cx, cy, radius, cursorTime, cursorSpeed, cursorPattern, cursorPhaseOffset);
        ctx.beginPath(); ctx.moveTo(targetPos.x - 10, targetPos.y); ctx.lineTo(targetPos.x + 10, targetPos.y);
        ctx.moveTo(targetPos.x, targetPos.y - 10); ctx.lineTo(targetPos.x, targetPos.y + 10); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    else if (turnPhase === 3) {
        if (finalTarget.x !== -100) {
            ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(finalTarget.x, finalTarget.y, 4, 0, Math.PI*2); ctx.fill();
        }
    }
    else if (turnPhase === 4) {
        let t = scoreAnimTimer / 800; // 0 to 1
        let easeT = 1 - Math.pow(1 - t, 3); // Ease out cubic
        let currX = scoreAnimX + (scoreAnimDestX - scoreAnimX) * easeT;
        let currY = scoreAnimY + (scoreAnimDestY - scoreAnimY) * easeT;
        
        // Draw trailing line effect
        ctx.strokeStyle = "rgba(255, 255, 0, 0.5)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(scoreAnimX, scoreAnimY); ctx.lineTo(currX, currY); ctx.stroke();
        
        // Draw floating dot
        ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(currX, currY, 5, 0, Math.PI*2); ctx.fill();
    }

    // 3. Draw Avatars
    drawAvatars();
    
    if (cokeSpeechTimer > 0) {
        // Coke Speech Bubble
        let bx = 100; let by = canvas.height - 230;
        ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, 180, 40);
        ctx.beginPath(); ctx.moveTo(bx + 20, by + 40); ctx.lineTo(bx + 10, by + 50); ctx.lineTo(bx + 40, by + 40); ctx.fill();
        drawText(cokeSpeechText, bx + 90, by + 20, 8, "#000");
    }
    if (genericSpeechTimer > 0) {
        // Generic Player Speech Bubble (shows current player's name)
        let bx = canvas.width - 280; let by = canvas.height - 230;
        ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, 180, 40);
        ctx.beginPath(); ctx.moveTo(bx + 140, by + 40); ctx.lineTo(bx + 130, by + 50); ctx.lineTo(bx + 160, by + 40); ctx.fill();
        const speaker = players[currentPlayerIdx].name;
        drawText(`${speaker}: ${genericSpeechText}`, bx + 90, by + 20, 8, "#000");
    }
    
    if (cokeSpeechTimer <= 0) {
        drawText(`DARTS: ${'➤'.repeat(dartsLeft)}`, cx, canvas.height - 30, 12, "#fff");
    }
}

const SHIRT_COLORS = ["#f00", "#0088ff", "#0a0", "#ff0"]; // Coke Red, Blue, Green, Yellow

function drawAvatars() {
    let ay = canvas.height - 180;
    
    // 1. Draw Coke Giant Avatar on Left
    drawLargeCokeAvatar(30, ay, players[0].turnsPlayed, countCokeClosedNumbers(), currentPlayerIdx === 0);
    
    // 2. Draw Other Players on Right
    let numOthers = players.length - 1;
    if (numOthers > 0) {
        let rightSpace = canvas.width - 160; 
        let spacing = rightSpace / (numOthers + 1);
        
        for (let i = 1; i < players.length; i++) {
            let pX = 160 + spacing * i;
            drawSmallAvatar(players[i], pX, ay + 30, currentPlayerIdx === i);
        }
    }
}

function drawSmallAvatar(p, x, y, isActive) {
    let scale = 2; 
    if (isActive) {
        let bounce = Math.sin(frameCount * 0.1) * 5;
        drawText("V", x + 10*scale, y - 10 + bounce, 12, "#ff0");
    }
    
    ctx.fillStyle = "#f5d0b5"; ctx.fillRect(x, y, 20*scale, 20*scale); // Face
    ctx.fillStyle = "#000"; ctx.fillRect(x + 4*scale, y + 6*scale, 2*scale, 2*scale); ctx.fillRect(x + 14*scale, y + 6*scale, 2*scale, 2*scale);
    ctx.fillStyle = SHIRT_COLORS[p.id % 4]; ctx.fillRect(x - 4*scale, y + 20*scale, 28*scale, 20*scale); // Shirt
    drawText(p.name, x + 10*scale, y + 48*scale, 10, "#fff"); // Name
}

function drawLargeCokeAvatar(x, y, turns, closedCount, isActive) {
    let scale = 3.5; 
    ctx.fillStyle = "#f5d0b5"; ctx.fillRect(x, y, 20*scale, 20*scale);
    ctx.fillStyle = "#000"; ctx.fillRect(x + 4*scale, y + 6*scale, 2*scale, 2*scale); ctx.fillRect(x + 14*scale, y + 6*scale, 2*scale, 2*scale);
    ctx.fillStyle = "#f00"; ctx.fillRect(x - 4*scale, y + 20*scale, 28*scale, 20*scale);
    
    // "SAPO" text
    drawText("SAPO", x + 10*scale, y + 28*scale, 6*scale, "#000");
    drawText(players[0].name, x + 10*scale, y + 48*scale, 10*scale, "#fff"); // Name below Coke
    
    if (isActive) {
        let bounce = Math.sin(frameCount * 0.1) * 5;
        drawText("V", x + 10*scale, y - 15 + bounce, 20, "#ff0");
    }
    
    if (turns >= 5 || closedCount >= 5) {
        let iceTurns = turns;
        if (closedCount >= 5 && turns < 5) iceTurns = 5; // Force freeze start if closed early
        
        let freezeLvl = Math.min(1.0, (iceTurns - 4) / 15); 
        ctx.fillStyle = `rgba(0, 255, 255, ${0.4 + (freezeLvl*0.5)})`; 
        let iceHeight = (20*scale) * freezeLvl;
        let startY = (y + 20*scale + 20*scale) - iceHeight;
        ctx.fillRect(x - 4*scale, startY, 28*scale, iceHeight);
        
        if (freezeLvl >= 1.0) drawText("FROZEN!", x + 10*scale, y - 10*scale, 16, "#0ff");
    }
    
    // --- COKE CLOTHES (Turns 6, 7, 8, 9) ---
    if (turns >= 6) { // Gorro
        ctx.fillStyle = "#00f"; ctx.fillRect(x + 2*scale, y - 6*scale, 16*scale, 8*scale);
        ctx.fillStyle = "#fff"; ctx.fillRect(x + 8*scale, y - 10*scale, 4*scale, 4*scale);
    }
    if (turns >= 7) { // Bufanda
        ctx.fillStyle = "#ff0"; ctx.fillRect(x - 2*scale, y + 16*scale, 24*scale, 6*scale);
        ctx.fillRect(x + 16*scale, y + 22*scale, 6*scale, 10*scale);
    }
    if (turns >= 8) { // Guantes
        ctx.fillStyle = "#0a0"; ctx.fillRect(x - 6*scale, y + 25*scale, 6*scale, 8*scale);
        ctx.fillRect(x + 20*scale, y + 25*scale, 6*scale, 8*scale);
    }
    if (turns >= 9) { // Abrigo
        ctx.fillStyle = "#8b4513"; 
        ctx.fillRect(x - 6*scale, y + 20*scale, 10*scale, 22*scale); // Left
        ctx.fillRect(x + 16*scale, y + 20*scale, 10*scale, 22*scale); // Right
    }
}

function drawGameOver() {
    drawText("GAME OVER", canvas.width/2, canvas.height/2 - 40, 24, "#ff0");
    drawText("TAP TO MENU", canvas.width/2, canvas.height/2 + 40, 14, "#fff");
}

requestAnimationFrame(loop);
