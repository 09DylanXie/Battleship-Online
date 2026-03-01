import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCqWr-wl0dF5opg9-Llp9cuupJCHBI2ph8",
    authDomain: "battleship-command-a9077.firebaseapp.com",
    databaseURL: "https://battleship-command-a9077-default-rtdb.firebaseio.com",
    projectId: "battleship-command-a9077",
    storageBucket: "battleship-command-a9077.firebasestorage.app",
    messagingSenderId: "210783131740",
    appId: "1:210783131740:web:85e15a2e22d8dafd7dae99"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

window.switchTab = function(tabId, event) {
    document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).style.display = 'flex';
    event.currentTarget.classList.add('active');
};

const BOARD_WIDTH = 16; const BOARD_HEIGHT = 16;
const boardElement = document.getElementById('game-board');

const GEM_MOUNTAINS = ["7,7", "8,7", "7,8", "8,8"]; 
const RESOURCE_MOUNTAINS = ["4,4", "11,4", "4,11", "11,11", "2,7", "13,8"]; 
const MOUNTAINS = [...GEM_MOUNTAINS, ...RESOURCE_MOUNTAINS];

const UNIT_STATS = {
    "Base": { maxHp: 30, range: 2, move: 0, minDmg: 2, maxDmg: 4, costG: 0, costS: 0, turns: 0, typeClass: "Aircraft" },
    "Aircraft Carrier": { maxHp: 7, range: 4, move: 1, minDmg: 3, maxDmg: 10, costG: 100, costS: 10, turns: 3, typeClass: "Aircraft" },
    "Battleship": { maxHp: 13, range: 3, move: 1, minDmg: 2, maxDmg: 7, costG: 90, costS: 9, turns: 2, typeClass: "Shell" },
    "Cruiser": { maxHp: 9, range: 2, move: 2, minDmg: 2, maxDmg: 4, costG: 50, costS: 5, turns: 1, typeClass: "Shell" },
    "Destroyer": { maxHp: 5, range: 2, move: 2, minDmg: 1, maxDmg: 3, costG: 30, costS: 3, turns: 0, typeClass: "Shell" },
    "Torpedo Boat": { maxHp: 3, range: 1, move: 1, minDmg: 2, maxDmg: 7, costG: 40, costS: 2, turns: 0, typeClass: "Torpedo" },
    "Submarine": { maxHp: 3, range: 1, move: 1, minDmg: 7, maxDmg: 7, costG: 40, costS: 2, turns: 0, typeClass: "Torpedo" },
    "Decoy": { maxHp: 1, range: 0, move: 1, minDmg: 0, maxDmg: 0, costG: 20, costS: 0, turns: 0, typeClass: "Decoy" }
};

let currentSelection = null; let selectedShipCoord = null; let isTargeting = false; let currentPlayer = null; 
let deployingFromReserve = false;

function getFreshPlayerState() {
    return {
        gold: 150, steel: 10, gems: 0, basePlaced: false, freeDestroyerPlaced: false, activeShips: 0, baseCoord: null, 
        buildings: { goldMine: 0, steelFactory: 0, shipyard: 0, baseDefense: 0 },
        buildQueue: [], readyToDeploy: [], reserveFleet: [], minedMountains: [] 
    };
}

let gameState = { 
    turn: 1, matchStarted: false, joinedPlayers: [], activePlayerIndex: 0, 
    players: { p1: getFreshPlayerState(), p2: getFreshPlayerState(), p3: getFreshPlayerState(), p4: getFreshPlayerState() }, 
    grid: {} 
};

const playerNames = { p1: "Player 1 (Cyan)", p2: "Player 2 (Red)", p3: "Player 3 (Yellow)", p4: "Player 4 (Purple)" };

window.claimPlayer = function(playerId) {
    currentPlayer = playerId; 
    sessionStorage.setItem('battleshipPlayerRole', playerId);
    if (!gameState.joinedPlayers.includes(playerId)) { gameState.joinedPlayers.push(playerId); set(gameRef, gameState); }
    document.getElementById('role-modal').style.display = 'none';
    document.getElementById('player-badge').innerText = `Commander: ${playerNames[playerId]}`;
    document.getElementById('player-badge').className = playerId; updateUI(); renderBoard();
};

const savedRole = sessionStorage.getItem('battleshipPlayerRole');
if (savedRole) {
    currentPlayer = savedRole; 
    document.getElementById('role-modal').style.display = 'none';
    document.getElementById('player-badge').innerText = `Commander: ${playerNames[savedRole]}`;
    document.getElementById('player-badge').className = savedRole;
}

window.startMatch = function() {
    if (gameState.joinedPlayers.length < 2) return alert("Waiting for at least 2 Commanders to join the Lobby!");
    gameState.matchStarted = true; gameState.activePlayerIndex = 0; set(gameRef, gameState);
};

// --- FIX 1: THE DEEP CLEAN FIREBASE FAILSAFE ---
const gameRef = ref(db, 'battleship-match-1');
onValue(gameRef, (snapshot) => { 
    if (snapshot.val()) { 
        gameState = snapshot.val(); 
        
        // Force missing arrays to exist to prevent Turn Tracker crashes
        if(!gameState.joinedPlayers) gameState.joinedPlayers = [];
        if(!gameState.grid) gameState.grid = {}; 
        if(!gameState.players) gameState.players = {};

        ['p1', 'p2', 'p3', 'p4'].forEach(p => {
            if(!gameState.players[p]) gameState.players[p] = getFreshPlayerState();
            if(!gameState.players[p].buildQueue) gameState.players[p].buildQueue = [];
            if(!gameState.players[p].readyToDeploy) gameState.players[p].readyToDeploy = [];
            if(!gameState.players[p].reserveFleet) gameState.players[p].reserveFleet = [];
            if(!gameState.players[p].minedMountains) gameState.players[p].minedMountains = [];
            if(!gameState.players[p].buildings) gameState.players[p].buildings = { goldMine: 0, steelFactory: 0, shipyard: 0, baseDefense: 0 };
        });

        if (currentPlayer && !gameState.matchStarted && !gameState.joinedPlayers.includes(currentPlayer)) {
            sessionStorage.removeItem('battleshipPlayerRole'); currentPlayer = null;
            document.getElementById('role-modal').style.display = 'flex';
            document.getElementById('player-badge').innerText = `Commander: Awaiting...`;
            document.getElementById('player-badge').className = '';
        }
        handleAutomatedFogChecks(); renderBoard(); updateUI(); 
    } 
});

function getHexDistance(x1, y1, x2, y2) { let q1 = x1 - Math.floor(y1 / 2); let r1 = y1; let q2 = x2 - Math.floor(y2 / 2); let r2 = y2; return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2; }
function cubeLerp(a, b, t) { return { q: a.q + (b.q - a.q) * t, r: a.r + (b.r - a.r) * t, s: a.s + (b.s - a.s) * t }; }
function cubeRound(f) { let q = Math.round(f.q), r = Math.round(f.r), s = Math.round(f.s); let qd = Math.abs(q - f.q), rd = Math.abs(r - f.r), sd = Math.abs(s - f.s); if (qd > rd && qd > sd) q = -r - s; else if (rd > sd) r = -q - s; else s = -q - r; return {q, r, s}; }
function hexToCube(x, y) { return { q: x - Math.floor(y / 2), r: y, s: -(x - Math.floor(y / 2)) - y }; }
function cubeToHex(q, r, s) { return `${q + Math.floor(r / 2)},${r}`; }

function checkLineOfSight(x1, y1, x2, y2, attackType) {
    if (attackType === "Aircraft") return true; 
    let a = hexToCube(x1, y1); let b = hexToCube(x2, y2); let dist = getHexDistance(x1, y1, x2, y2);
    for (let i = 1; i < dist; i++) { let f = cubeLerp(a, b, i / dist); let r = cubeRound(f); if (MOUNTAINS.includes(cubeToHex(r.q, r.r, r.s))) return false; }
    return true;
}

function checkBaseZone(player, x, y) {
    if (player === 'p1') return y >= 14 && x >= 6 && x <= 9; 
    if (player === 'p2') return y <= 1 && x >= 6 && x <= 9;  
    if (player === 'p3') return x <= 1 && y >= 6 && y <= 9;  
    if (player === 'p4') return x >= 14 && y >= 6 && y <= 9; 
    return false;
}

function isVisibleTo(targetX, targetY, targetType, viewerPlayerId) {
    const viewerUnits = Object.entries(gameState.grid).filter(([_, data]) => data.player === viewerPlayerId);
    for (const [coord, data] of viewerUnits) {
        const [vx, vy] = coord.split(',').map(Number); const dist = getHexDistance(vx, vy, targetX, targetY);
        let reqDist = (targetType === 'Base' || targetType === 'Submarine') ? 1 : 2;
        if (dist <= reqDist) return true;
    }
    return false; 
}

function handleAutomatedFogChecks() {
    let boardChanged = false;
    for (const [coord, data] of Object.entries(gameState.grid)) {
        if (data.type === 'Decoy') {
            const [dx, dy] = coord.split(',').map(Number);
            ['p1', 'p2', 'p3', 'p4'].forEach(enemy => {
                if (enemy !== data.player && isVisibleTo(dx, dy, 'Decoy', enemy)) {
                    if (data.player === currentPlayer) alert(`Enemy spotted your Decoy at ${coord}! It has been destroyed.`);
                    delete gameState.grid[coord]; boardChanged = true;
                }
            });
        }
    }
    if (boardChanged && currentPlayer === 'p1') set(gameRef, gameState); 
}

function createBoard() {
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        const rowElement = document.createElement('div'); rowElement.classList.add('hex-row');
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const tile = document.createElement('div'); tile.classList.add('tile');
            tile.dataset.x = x; tile.dataset.y = y;
            if (GEM_MOUNTAINS.includes(`${x},${y}`)) tile.classList.add('mountain', 'gem-mountain');
            else if (RESOURCE_MOUNTAINS.includes(`${x},${y}`)) tile.classList.add('mountain');
            tile.addEventListener('click', () => handleTileClick(x, y)); rowElement.appendChild(tile);
        }
        boardElement.appendChild(rowElement);
    }
}

function renderBoard() {
    document.querySelectorAll('.unit-icon').forEach(el => el.remove());
    if (!gameState.grid || !currentPlayer) return;
    for (const [coord, data] of Object.entries(gameState.grid)) {
        const [x, y] = coord.split(',').map(Number);
        if (data.player === currentPlayer || isVisibleTo(x, y, data.type, currentPlayer)) {
            const tile = document.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
            if (tile) {
                const unitMarker = document.createElement('div');
                unitMarker.className = `unit-icon unit-${data.type.replace(/\s+/g, '-')} ${data.player}`;
                if (coord === selectedShipCoord) unitMarker.classList.add(isTargeting ? 'targeting-unit' : 'selected-unit');

                const hpText = document.createElement('span');
                hpText.classList.add('hp-text'); hpText.innerText = data.hp;
                if(data.type === "Destroyer") { hpText.style.top = "2px"; hpText.style.left = "-2px"; }

                unitMarker.appendChild(hpText); tile.appendChild(unitMarker);
            }
        }
    }
}

function createRosterCard(data, x, y, isEnemy) {
    const maxHp = UNIT_STATS[data.type].maxHp; const hpPct = (data.hp / maxHp) * 100;
    const hpColor = hpPct <= 30 ? '#ff5252' : '#00e676';
    const cardClass = isEnemy ? 'roster-card enemy' : 'roster-card';
    
    let iconClass = `unit-${data.type.replace(/\s+/g, '-')}`;
    let iconHTML = `<div class="unit-icon-relative ${iconClass} ${data.player}"></div>`;
    if(data.type === "Destroyer") iconHTML = `<div class="${iconClass} ${data.player}"></div>`;

    return `
        <div class="${cardClass}">
            <div class="roster-card-icon-wrapper">${iconHTML}</div>
            <div class="roster-details">
                <div class="roster-title"><span>${data.type}</span><span style="font-size: 11px; color:#aaa;">Hex (${x},${y})</span></div>
                <div class="hp-bar-bg"><div class="hp-fill" style="width: ${hpPct}%; background: ${hpColor};"></div></div>
                <div class="roster-stats">${data.hp} / ${maxHp} HP</div>
            </div>
        </div>
    `;
}

function updateUI() {
    if (!currentPlayer) return; 
    const pData = gameState.players[currentPlayer];
    if(!pData) return; 
    
    const overlay = document.getElementById('purgatory-overlay');
    const startBtn = document.getElementById('btn-start-match');
    const globalTurnDisplay = document.getElementById('global-turn');
    
    if (!gameState.matchStarted) {
        overlay.style.display = 'flex';
        document.getElementById('purgatory-msg').innerText = `Lobby Phase: ${gameState.joinedPlayers.length} Commanders Joined.`;
        startBtn.style.display = gameState.joinedPlayers.length >= 2 ? 'block' : 'none';
        globalTurnDisplay.innerText = `Turn: 1 | Pre-Game Lobby`;
    } else {
        startBtn.style.display = 'none';
        const activeCommanderId = gameState.joinedPlayers[gameState.activePlayerIndex];
        globalTurnDisplay.innerText = `Turn: ${gameState.turn} | Active: ${playerNames[activeCommanderId]}`;
        
        if (activeCommanderId !== currentPlayer) {
            overlay.style.display = 'flex';
            document.getElementById('purgatory-msg').innerText = `Waiting for ${playerNames[activeCommanderId]} to finish their turn...`;
        } else overlay.style.display = 'none'; 
    }

    document.getElementById('resources').innerText = `Gold: ${pData.gold} | Steel: ${pData.steel} | Gems: ${pData.gems}`;
    document.getElementById('fleet-status').innerText = `Active Ships: ${pData.activeShips}/7 | Reserve: ${pData.reserveFleet.length}/3`;
    
    let actionText = "Awaiting Orders...";
    document.getElementById('unit-controls').style.display = 'none';
    document.getElementById('btn-repair').style.display = 'none';
    document.getElementById('btn-recall').style.display = 'none';

    let selType = typeof currentSelection === 'object' ? currentSelection.type : currentSelection;
    if (currentSelection) actionText = `Deploying ${selType}...`;
    else if (selectedShipCoord) {
        let unit = gameState.grid[selectedShipCoord];
        document.getElementById('unit-controls').style.display = 'flex';
        
        let rangeDisplay = UNIT_STATS[unit.type].range;
        if (unit.type === 'Base' && pData.buildings.baseDefense === 0) rangeDisplay = 0; 

        document.getElementById('unit-stats').innerText = `${unit.type} | HP: ${unit.hp} | Range: ${rangeDisplay}`;
        
        if (unit.player === currentPlayer && unit.type !== 'Base' && unit.type !== 'Decoy') {
            const [sx, sy] = selectedShipCoord.split(',').map(Number);
            if (pData.baseCoord && getHexDistance(sx, sy, pData.baseCoord.x, pData.baseCoord.y) <= 1) {
                if (pData.buildings.shipyard > 0 && unit.hp < UNIT_STATS[unit.type].maxHp) {
                    document.getElementById('btn-repair').style.display = 'inline-block';
                }
                document.getElementById('btn-recall').style.display = 'inline-block';
            }
        }

        if (isTargeting) actionText = `🎯 SELECT ENEMY TARGET WITHIN RANGE ${rangeDisplay}`;
        else actionText = `Move ship or select action.`;
    }
    document.getElementById('action-status').innerText = actionText;

    const dockDiv = document.getElementById('deployment-dock'); dockDiv.innerHTML = '';
    pData.buildQueue.forEach((q, idx) => { 
        dockDiv.innerHTML += `<div style="display:flex; justify-content:space-between; width: 100%;">
            <span style="color:#aaa;">Building ${q.type} (${q.turnsLeft} turns left)</span>
            <button onclick="rushBuild(${idx})" style="padding: 2px 5px; font-size: 10px; border-color: #e040fb;">Rush (2 Gems)</button>
        </div>`; 
    });
    if (pData.buildQueue.length === 0) dockDiv.innerHTML = "<span style='color:#555;'>Queue empty.</span>";

    const readyDock = document.getElementById('ready-deploy-dock'); readyDock.innerHTML = '';
    pData.readyToDeploy.forEach((type, index) => { 
        readyDock.innerHTML += `<button style="background-color: #00bcd4; color: black; font-weight: bold; width: 48%;" onclick="prepDeploy('${type}', ${index})">Deploy ${type}</button>`; 
    });

    const reserveDock = document.getElementById('reserve-deploy-dock'); reserveDock.innerHTML = '';
    pData.reserveFleet.forEach((shipObj, index) => { 
        reserveDock.innerHTML += `<button style="background-color: #f44336; color: white; font-weight: bold; width: 48%;" onclick="prepDeployReserve(${index})">Reserve ${shipObj.type} (${shipObj.hp}HP)</button>`; 
    });
    if (pData.reserveFleet.length === 0) reserveDock.innerHTML = "<span style='color:#555;'>Reserve empty.</span>";

    document.getElementById('infra-stats').innerText = `Mines: ${pData.buildings.goldMine} | Factories: ${pData.buildings.steelFactory} \n Shipyards: ${pData.buildings.shipyard} | Defenses: ${pData.buildings.baseDefense}`;
    
    const rosterDiv = document.getElementById('fleet-roster'); const intelDiv = document.getElementById('intel-roster');
    rosterDiv.innerHTML = ''; intelDiv.innerHTML = '';

    if (gameState.grid) {
        for (const [coord, data] of Object.entries(gameState.grid)) {
            const [x, y] = coord.split(',').map(Number);
            if (data.player === currentPlayer) rosterDiv.innerHTML += createRosterCard(data, x, y, false);
            else if (isVisibleTo(x, y, data.type, currentPlayer)) intelDiv.innerHTML += createRosterCard(data, x, y, true);
        }
    }
}

window.tradeGemForGold = function() { let p = gameState.players[currentPlayer]; if (p.gems >= 1) { p.gems--; p.gold += 30; set(gameRef, gameState); } else alert("No Gems to trade!"); }
window.tradeGemForSteel = function() { let p = gameState.players[currentPlayer]; if (p.gems >= 1) { p.gems--; p.steel += 3; set(gameRef, gameState); } else alert("No Gems to trade!"); }
window.rushBuild = function(index) {
    let p = gameState.players[currentPlayer];
    if (p.gems >= 2) {
        p.gems -= 2; p.buildQueue[index].turnsLeft--;
        if (p.buildQueue[index].turnsLeft <= 0) { p.readyToDeploy.push(p.buildQueue[index].type); p.buildQueue.splice(index, 1); }
        set(gameRef, gameState);
    } else alert("Need 2 Gems!");
}

window.prepDeploy = function(shipType, index) { 
    if (!confirm(`Commander, deploy the queued ${shipType}?`)) return;
    currentSelection = shipType; gameState.players[currentPlayer].readyToDeploy.splice(index, 1); updateUI(); 
};
window.prepDeployReserve = function(index) {
    let p = gameState.players[currentPlayer];
    if (!confirm(`Commander, deploy ${p.reserveFleet[index].type} from the Reserve Fleet?`)) return;
    currentSelection = p.reserveFleet[index]; deployingFromReserve = true; p.reserveFleet.splice(index, 1); updateUI();
};

// --- FIX 2: THE "SHOPPING CART" BUY SYSTEM ---
window.buyShip = function(shipType) {
    let p = gameState.players[currentPlayer]; const stats = UNIT_STATS[shipType];
    
    if (shipType === 'Base' && p.basePlaced) return alert("Only 1 base permitted!");
    if (shipType !== 'Base' && !p.basePlaced) return alert("Deploy Base first!");

    if (stats.turns > 0) {
        // Queued ships take resources immediately
        if (p.gold < stats.costG || p.steel < stats.costS) return alert(`Insufficient resources!`);
        if (!confirm(`Queue ${shipType} for construction? (${stats.costG}G, ${stats.costS}S)`)) return;
        p.gold -= stats.costG; p.steel -= stats.costS;
        p.buildQueue.push({ type: shipType, turnsLeft: stats.turns });
        set(gameRef, gameState);
    } else {
        // Instant ships just hold selection. Resources deducted on placement.
        if (shipType !== 'Base' && !(shipType === 'Destroyer' && !p.freeDestroyerPlaced)) {
            if (p.gold < stats.costG || p.steel < stats.costS) return alert(`Insufficient resources! Need ${stats.costG}G, ${stats.costS}S.`);
        }
        currentSelection = shipType; 
    }
    updateUI();
};

function clearSelection() {
    if (!currentPlayer) return;
    let p = gameState.players[currentPlayer];
    if (currentSelection) {
        let depType = typeof currentSelection === 'object' ? currentSelection.type : currentSelection;
        let stats = UNIT_STATS[depType];
        
        if (deployingFromReserve) {
            p.reserveFleet.push(currentSelection);
        } else if (stats && stats.turns > 0) { 
            // Only push Ships that cost Turns back to the ready dock
            p.readyToDeploy.push(currentSelection); 
        }
    }
    selectedShipCoord = null; currentSelection = null; isTargeting = false; deployingFromReserve = false; updateUI(); renderBoard();
}

function handleTileClick(x, y) {
    if (!gameState.matchStarted || gameState.joinedPlayers[gameState.activePlayerIndex] !== currentPlayer) return;
    const cx = parseInt(x); const cy = parseInt(y); const coordKey = `${cx},${cy}`;
    
    if (isTargeting && selectedShipCoord) {
        let attacker = gameState.grid[selectedShipCoord]; let target = gameState.grid[coordKey];
        const stats = UNIT_STATS[attacker.type]; let pData = gameState.players[currentPlayer];

        if (attacker.hasFired) return alert("Already fired this turn!");
        if (attacker.type === "Aircraft Carrier" && attacker.hasMoved) return alert("Carriers cannot move and attack on the same turn!");
        if (attacker.type === 'Base' && pData.buildings.baseDefense === 0) return alert("You must build Base Defenses to attack!");
        if (!target) return alert("No target!");
        if (target.player === currentPlayer) return alert("Friendly fire disabled!");
        if (target.type === 'Base' && attacker.type === 'Base') return alert("Bases cannot attack bases!");
        if (attacker.type === "Battleship" && target.type === "Submarine") return alert("Battleships cannot target Submarines!");
        if (attacker.type === "Submarine" && target.type === "Base") return alert("Submarines cannot target Bases!");

        const [ax, ay] = selectedShipCoord.split(',').map(Number);
        if (getHexDistance(ax, ay, cx, cy) > (attacker.type === 'Base' ? 2 : stats.range)) return alert("Out of range!");
        if (!checkLineOfSight(ax, ay, cx, cy, attacker.type === 'Base' ? 'Aircraft' : stats.typeClass)) return alert("Line of sight blocked!");

        let dmg = 0;
        if (attacker.type === 'Base') { for(let i=0; i < pData.buildings.baseDefense; i++) dmg += Math.floor(Math.random() * 3) + 2; } 
        else dmg = Math.floor(Math.random() * (stats.maxDmg - stats.minDmg + 1)) + stats.minDmg;

        if (attacker.type === "Destroyer" && (target.type === "Submarine" || target.type === "Torpedo Boat")) dmg *= 2;
        if (target.type === "Battleship") {
            if (stats.typeClass === "Torpedo") dmg = Math.max(0, dmg - 3);
            if (stats.typeClass === "Aircraft" || attacker.type === 'Base') dmg = Math.max(0, dmg - 1);
        }
        if (target.type === "Cruiser" && attacker.type === "Submarine") dmg = Math.max(0, dmg - 5);
        if (target.type === "Destroyer" && (stats.typeClass === "Aircraft" || attacker.type === 'Base')) dmg = Math.max(0, dmg - 2);

        target.hp -= dmg; attacker.hasFired = true; alert(`${attacker.type} dealt ${dmg} damage to ${target.player}'s ${target.type}.`);

        if (target.hp <= 0) {
            alert(`Enemy destroyed! +1 Gem.`);
            if (target.type !== 'Base') { gameState.players[currentPlayer].gems += 1; gameState.players[target.player].activeShips--; }
            delete gameState.grid[coordKey];
        }
        clearSelection(); set(gameRef, gameState); return;
    }

    if (MOUNTAINS.includes(coordKey)) {
        if (selectedShipCoord) {
            let unit = gameState.grid[selectedShipCoord];
            if (unit.type === 'Destroyer' && !unit.hasFired && !unit.hasMoved) {
                const [sx, sy] = selectedShipCoord.split(',').map(Number);
                if (getHexDistance(sx, sy, cx, cy) === 1) {
                    let pData = gameState.players[currentPlayer];
                    
                    if (pData.minedMountains.includes(coordKey)) return alert("Your fleet has already mined this mountain this turn!");
                    
                    if (GEM_MOUNTAINS.includes(coordKey)) { pData.gems += 1; alert("Destroyer mined 1 Gem from the central mountain! Turn consumed."); } 
                    else {
                        let choice = prompt("Mine standard resources. Type 'G' for 20 Gold, or 'S' for 2 Steel:", "G");
                        if (choice === null) return alert("Mining cancelled.");
                        if (choice.toUpperCase() === 'G') { pData.gold += 20; alert("Destroyer mined 20 Gold! Turn consumed."); } 
                        else if (choice.toUpperCase() === 'S') { pData.steel += 2; alert("Destroyer mined 2 Steel! Turn consumed."); } 
                        else return alert("Invalid choice. Mining cancelled.");
                    }
                    pData.minedMountains.push(coordKey); unit.hasFired = true; unit.hasMoved = true; 
                    clearSelection(); set(gameRef, gameState); return;
                }
            }
        }
        return alert("Mountains block movement!");
    }

    if (!gameState.grid) gameState.grid = {};

    // Deployment Logic
    if (currentSelection) {
        if (gameState.grid[coordKey]) return alert("Hex occupied!");
        let pData = gameState.players[currentPlayer];
        
        let depType = typeof currentSelection === 'object' ? currentSelection.type : currentSelection;
        let depHp = typeof currentSelection === 'object' ? currentSelection.hp : UNIT_STATS[depType].maxHp;
        let stats = UNIT_STATS[depType];

        if (depType === 'Base') {
            if (!checkBaseZone(currentPlayer, cx, cy)) return alert("Deploy in your zone!");
            pData.basePlaced = true; pData.baseCoord = { x: cx, y: cy };
        } else {
            if (getHexDistance(cx, cy, pData.baseCoord.x, pData.baseCoord.y) > 1) return alert("Deploy within 1 tile of base!");
            if (depType !== 'Decoy' && pData.activeShips >= 7) return alert("Fleet cap reached (Max 7)!");
            
            // Deduct cost on placement for instant ships
            if (!deployingFromReserve && stats.turns === 0) {
                let isFreeDestroyer = (depType === 'Destroyer' && !pData.freeDestroyerPlaced);
                if (!isFreeDestroyer) {
                    if (pData.gold < stats.costG || pData.steel < stats.costS) {
                        currentSelection = null; updateUI(); return alert("Insufficient resources!");
                    }
                    pData.gold -= stats.costG; pData.steel -= stats.costS;
                } else {
                    pData.freeDestroyerPlaced = true;
                }
            }
            if (depType !== 'Decoy') pData.activeShips++;
        }

        gameState.grid[coordKey] = { type: depType, player: currentPlayer, hp: depHp, hasMoved: true, hasFired: true };
        currentSelection = null; deployingFromReserve = false; set(gameRef, gameState); clearSelection();
    } 
    // Movement Logic
    else {
        if (gameState.grid[coordKey]) {
            let clickedUnit = gameState.grid[coordKey];
            if (clickedUnit.player === currentPlayer) {
                if (clickedUnit.type === 'Base') return alert("Bases cannot move!");
                selectedShipCoord = coordKey; isTargeting = false; renderBoard(); updateUI();
            }
        } else if (selectedShipCoord) {
            let unit = gameState.grid[selectedShipCoord];
            if (unit.hasMoved) return alert("Already moved/deployed this turn!");
            if (unit.type === "Aircraft Carrier" && unit.hasFired) return alert("Carriers cannot move and attack on the same turn!");

            const [sx, sy] = selectedShipCoord.split(',').map(Number);
            if (getHexDistance(sx, sy, cx, cy) > UNIT_STATS[unit.type].move) return alert(`Out of range!`);
            unit.hasMoved = true; gameState.grid[coordKey] = unit; delete gameState.grid[selectedShipCoord]; 
            clearSelection(); set(gameRef, gameState);
        }
    }
}

document.getElementById('btn-fire').addEventListener('click', () => { 
    if (gameState.grid[selectedShipCoord].hasFired) return alert("Already fired this turn!");
    isTargeting = true; renderBoard(); updateUI();
});
document.getElementById('btn-repair').addEventListener('click', () => { 
    let unit = gameState.grid[selectedShipCoord];
    unit.hp = Math.min(unit.hp + 3, UNIT_STATS[unit.type].maxHp); unit.hasMoved = true; unit.hasFired = true; 
    alert(`${unit.type} repaired 3 HP!`); clearSelection(); set(gameRef, gameState);
});
document.getElementById('btn-recall').addEventListener('click', () => { 
    let p = gameState.players[currentPlayer];
    if (p.reserveFleet.length >= 3) return alert("Reserve Fleet is full (Max 3)!");
    let unit = gameState.grid[selectedShipCoord];
    p.reserveFleet.push({ type: unit.type, hp: unit.hp });
    p.activeShips--; delete gameState.grid[selectedShipCoord];
    alert(`${unit.type} recalled to Reserve Fleet.`); clearSelection(); set(gameRef, gameState);
});
document.getElementById('btn-cancel').addEventListener('click', () => { clearSelection(); });

document.getElementById('btn-buy-goldmine').addEventListener('click', () => { let p = gameState.players[currentPlayer]; if(p.gold >= 20 && p.steel >= 2) { p.gold -= 20; p.steel -= 2; p.buildings.goldMine++; set(gameRef, gameState); } else alert("Insufficient Funds!"); });
document.getElementById('btn-buy-steelfactory').addEventListener('click', () => { let p = gameState.players[currentPlayer]; if(p.gold >= 30 && p.steel >= 1) { p.gold -= 30; p.steel -= 1; p.buildings.steelFactory++; set(gameRef, gameState); } else alert("Insufficient Funds!"); });
document.getElementById('btn-buy-shipyard').addEventListener('click', () => { let p = gameState.players[currentPlayer]; if(p.buildings.shipyard >= 1) return alert("You already own a Shipyard!"); if(p.gold >= 50 && p.steel >= 3) { p.gold -= 50; p.steel -= 3; p.buildings.shipyard++; set(gameRef, gameState); } else alert("Insufficient Funds!"); });
document.getElementById('btn-buy-basedefense').addEventListener('click', () => { let p = gameState.players[currentPlayer]; if(p.gold >= 30) { p.gold -= 30; p.buildings.baseDefense++; set(gameRef, gameState); } else alert("Insufficient Funds!"); });

document.getElementById('btn-end-turn').addEventListener('click', () => {
    if (!gameState.matchStarted || gameState.joinedPlayers[gameState.activePlayerIndex] !== currentPlayer) return;
    let p = gameState.players[currentPlayer];
    
    p.gold += 20 + (p.buildings.goldMine * 10); p.steel += 2 + (p.buildings.steelFactory * 1); 
    
    let newQueue = [];
    p.buildQueue.forEach(q => {
        q.turnsLeft--;
        if (q.turnsLeft <= 0) p.readyToDeploy.push(q.type); else newQueue.push(q);
    });
    p.buildQueue = newQueue; p.minedMountains = [];

    for (let key in gameState.grid) {
        if (gameState.grid[key].player === currentPlayer) {
            gameState.grid[key].hasMoved = false; gameState.grid[key].hasFired = false;
        }
    }
    
    gameState.activePlayerIndex++;
    if (gameState.activePlayerIndex >= gameState.joinedPlayers.length) { gameState.activePlayerIndex = 0; gameState.turn++; }
    clearSelection(); set(gameRef, gameState); 
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if(confirm("WARNING: Are you sure you want to completely wipe the board and reset the game for ALL players?")) {
        gameState = { turn: 1, matchStarted: false, joinedPlayers: [], activePlayerIndex: 0, players: { p1: getFreshPlayerState(), p2: getFreshPlayerState(), p3: getFreshPlayerState(), p4: getFreshPlayerState() }, grid: {} };
        sessionStorage.removeItem('battleshipPlayerRole');
        set(gameRef, gameState).then(() => { window.location.reload(); });
    }
});

createBoard();