// Versão Atual: 1.4.4 - Ult. Mod.: 09/05/2023 - Azis.
const HaxballJS = require("haxball.js"); // Preciso porque óbvio né...
const mysql = require("mysql"); // DB
const bcrypt = require('bcrypt'); // Encriptar passwords em BCrypt
require('dotenv').config(); // Preciso para usar o .env
const fs = require("fs"); // Importar mapas e outras tretas.
const NoGoal = fs.readFileSync('./stadiums/nogoal.hbs', 'utf8'); // Mapa 1
const Aquecimento = fs.readFileSync('./stadiums/Aquecimento.hbs', 'utf8'); // Mapa 2
const Futsal = fs.readFileSync('./stadiums/Futsal.hbs', 'utf8'); // Mapa 3

// Conectar à database
const con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: "utf8mb4" // Para permitir nomes estranhos...
});

con.connect((err: any) => {
    if (err) throw err;
    console.log("Conexão com a database estabelecida!");
});

// Abrir variavel para timeout do jogador.
const timeoutIds: Record<string, any> = {};

// definir Interfaces para player
interface Player {
    id: number;
    name: string;
    team: number;
}

interface PlayerStatus {
    [id: number]: boolean;
}

// Definir player
let player: Player;

// Definir as estatísticas
interface PlayerStatistics {
    [playerId: string]: {
        goals: number;
        assists: number;
        ag: number;
    }
}

let playerStatistics: PlayerStatistics = {};

// Definir AFK
let afkStatus: { [key: number]: number } = {};
let loggedInPlayers: { [key: number]: boolean } = {};
let isMuted: { [key: number]: boolean } = {};

// Definir equipa que ganha perde
let winningTeam: number;
let losingTeam: number;

// Definir elo ganho
let eloPointsWin = 0;
let eloPointsLost = 0;

// Variáveis da previsão de vitória
let team1Elo = 0;
let team2Elo = 0;

// Variável WinStreak.
let winstreak = 0;

// Variável dos GK
let gk = Array(2); // Array de 2, 1 GK red / 1 GK blue

// Variável do SA
let superadmin: { [key: string | number]: number } = {};

// Preciso disto para o Ban ser mais fidedigno
let playerConnections: any = new Map();

// Preciso disto para salvar o login
let playerAuth: any = new Map();

// Para não executar o CS + que 1 vez.
let executed = false;

// Variável de quando a topstreak é batida enviar apenas o announcement 1x.
let TopStreakBatida = false;

// Chat colorido
var Membro = "⚽ Membro || ";
var Admin = "💥 Admin || ";
var Dono = "👑 Dono || ";
var Cenouras = "🥕 Membro || ";
var MembroColor = "0xFFFFFF"; // Branco
var DonoColor = "0xFFB515"; // Amarelo torrado
var AdminColor = "0xFFB515"; // Amarelo torrado

// Explicações do que cada comando faz.
const commandExplanations: any = {
    "help": "Exibe a lista de comandos disponíveis.",
    "registo": "Faz !registo seguido pela tua password (ex. !registo password )",
    "login": "Faz !login na sala seguido pela tua password (ex. !login password )",
    "changepw": "Faz !changepw seguido de passwordantiga passwordnova (ex. !changepw senha senha123 )",
    "afk": "Coloca-te e tira-te o status de AFK.",
    "about": "Mostra-te informações sobre a sala.",
    "discord": "Dá-te o discord oficial da HaxRooms.",
    "stats": "Mostra-te as tuas estátisticas ou as de outro jogador. (!stats) ou (!stats NOME)",
    "rank": "Mostra-te os ranks que podes obter na sala.",
    "t": "Faz: t Mensagem para enviares uma mensagem no chat de equipa.",
    "gk": "Caso a sala tenha detetado o GK errado coloca-te a ti como GK.",
    "lista": "Mostra-te a lista de usuários AFK.",
    "streak": "Mostra-te a streak atual da sala.",
    "topstreak": "Mostra-te o recorde de streak da sala.",
    "sub": "És substituído caso estejas nos primeiros 5 segundos de um jogo.",
    "prev": "Dá-te a previsão de vitória para o jogo atual.",
    "#": "Envia mensagem privada para o jogador à tua escolha através da sua ID. (ex. #50 teste)",
    "bb": "Faz logout da sala."
};

// Inciar as merdas para a sala.
HaxballJS.then((HBInit: (arg0: { roomName: string; maxPlayers: number; public: boolean; noPlayer: boolean; geo: { "code": string, "lat": number, "lon": number }; password: string; token: string; }) => any) => {

    const room = HBInit({
        roomName: "Sala de testes do Azis", // Nome da Sala
        maxPlayers: 16,
        public: true,
        noPlayer: true,
        geo: {
            code: "PT",
            lat: 41.2959,
            lon: -7.74635
        },
        password: "haxrooms",
        token: "thr1.AAAAAGRaiZSAR_NoiyXJtQ.B0eu0AnmGa8", // Colocar a token que se adquire aqui: https://www.haxball.com/headlesstoken
    });

    // Enviar o link da sala para a consola.
    room.onRoomLink = function(link: any) {
        console.log(link);
        room.setCustomStadium(NoGoal); // Carregar estádio.
        console.log(`Sala iniciada com sucesso, se quiseres encerrar a mesma faz Ctrl + C`);
    };

    // Vou definir aqui em cima caso necessite de usar em alguma merda em principio não mas mais vale :D
    let activePlayers = room.getPlayerList().filter((p: Player) => {
        return loggedInPlayers[p.id] && afkStatus[p.id] !== 1;
    });

    // Funções da sala
    room.setScoreLimit(3); // Score setado a 3
    room.setTimeLimit(3); // TimeLimit setado a 3
    room.setTeamsLock(true); // Bloquear as equipas
    room.setTeamColors(1, 60, 0xFFFFFF, [0xFF4D40, 0xFF4D40, 0xFF4D40]); // Cor equipa RED
    room.setTeamColors(2, 60, 0xFFFFFF, [0x0080ff, 0x0080ff, 0x0080ff]); // Cor equipa BLUE

    // Checkar a equipa que ganha e perde.
    function trackWinningTeam() {
        if (room.getScores().red > room.getScores().blue) {
            winningTeam = 1;
            losingTeam = 2;
        } else if (room.getScores().blue > room.getScores().red) {
            winningTeam = 2;
            losingTeam = 1;
        }
    }

    function distribuirStats(playerStatistics: PlayerStatistics) {
        const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
        for (let player of playersOnTeam) {
            if (playerStatistics[player.id]) {
                for (let stat in playerStatistics[player.id]) {
                    if (stat === "goals") {
                        const sql = `UPDATE players SET goals = goals + ? WHERE name = ?`;
                        const values = [playerStatistics[player.id][stat], player.name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                        });
                    } else if (stat === "assists") {
                        const sql = `UPDATE players SET assists = assists + ? WHERE name = ?`;
                        const values = [playerStatistics[player.id][stat], player.name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                        });
                    } else if (stat === "ag") {
                        const sql = `UPDATE players SET ag = ag + ? WHERE name = ?`;
                        const values = [playerStatistics[player.id][stat], player.name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                        });
                    }
                }
            }
            // Sistema de Elo
            // Equipa vermelha
            if (winningTeam === 1) {
                eloPointsWin = 5 + (6 * room.getScores().red) - (4 * room.getScores().blue);
            } else if (losingTeam === 1) {
                eloPointsLost = -6 + (4 * room.getScores().red) - (6 * room.getScores().blue);
            }
            // Equipa azul
            if (winningTeam === 2) {
                eloPointsWin = 5 + (6 * room.getScores().blue) - (4 * room.getScores().red);
            } else if (losingTeam === 2) {
                eloPointsLost = -6 + (4 * room.getScores().blue) - (6 * room.getScores().red);
            } // Sistema de Elo

            if (player.team === winningTeam) {
                if (room.getScores().blue === 0) {
                    if (gk[0].position != null && gk[0].name && !executed) {
                        const sql = `UPDATE players SET cs = cs + 1, elo = elo + 2 WHERE name = ?`;
                        const values = [gk[0].name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                        });
                        executed = true;
                        room.sendAnnouncement(`🏆 O GK ${gk[0].name} esteve invicto durante este jogo, parabéns!`, null, 0x00FF00, "bold", 0);
                    }
                } else if (room.getScores().red === 0) {
                    if (gk[1].position != null && gk[1].name && !executed) {
                        const sql = `UPDATE players SET cs = cs + 1, elo = elo + 2 WHERE name = ?`;
                        const values = [gk[1].name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                        });
                        executed = true;
                        room.sendAnnouncement(`🏆 O GK ${gk[1].name} esteve invicto durante este jogo, parabéns!`, null, 0x00FF00, "bold", 0);
                    }
                }
                // Ganhar
                const sql = `UPDATE players SET wins = wins + 1, games = games + 1, elo = elo + ? WHERE name = ?`;
                const values = [eloPointsWin, player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                });

            } else {
                // Perder
                const sql = `UPDATE players SET losses = losses + 1, games = games + 1, elo = GREATEST(0, elo + ?) WHERE name = ?`;
                const values = [eloPointsLost, player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                });
            }
        }
        // Um bocado óbvio o que isto faz :)
        if (room.getScores().red > room.getScores().blue) {
            room.sendAnnouncement(`🔴 Equipa vermelha ganhou por ${room.getScores().red} a ${room.getScores().blue}!`, null, 0x00FF00, "bold");
            console.log(`Equipa vermelha ganhou por ${room.getScores().red} a ${room.getScores().blue}.`);
        } else {
            room.sendAnnouncement(`🔵 Equipa azul ganhou por ${room.getScores().blue} a ${room.getScores().red}!`, null, 0x00FF00, "bold");
            console.log(`Equipa azul ganhou por ${room.getScores().blue} a ${room.getScores().red}.`);
        }
    }

    function prejudicarJogador(player: Player) {
        if (!player) { // Proteger contra crash.
            return;
        }
        // Prejudicar o jogador que saiu.
        const sql = `UPDATE players SET elo = GREATEST(0, elo - 50), games = games + 1, losses = losses + 1 WHERE LOWER(name) = LOWER(?)`;
        const values = [player.name];
        con.query(sql, values, (err: any) => {
            if (err) throw err;
            console.log(`${player.name} foi prejudicado por sair a meio do jogo.`);
        });
    }

    // Mensagem de 5 em 5 minutos
    setInterval(() => {
        room.sendAnnouncement("📢 Adere ao nosso discord em: https://discord.gg/EKsppWH5PU\n📢 No nosso website podes adicionar um email para proteger a tua conta!\n📢 E podes também verificar a Leaderboard, isto tudo em: haxball.azisserver.me", null, 0xbbb7fc, "bold", 0);
    }, 300000); // 5 minutos

    function handleRanks(player: Player) { // Código que trata dos avatars.
        if (!player) { // Proteger contra crash.
            return;
        }
        // Checkar a database por alguém com o mesmo nome.
        const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
        const values = [player.name];
        con.query(sql, values, (err: any, result: any) => {
            if (err) throw err;
            if (result.length > 0) {
                if (result && result[0] && result[0].games < 5) {
                    room.setPlayerAvatar(player.id, "🌱");
                } else {
                    if (result && result[0]) {
                        if (result[0].elo >= 4000) {
                            room.setPlayerAvatar(player.id, "🐐");
                        } else if (result[0].elo >= 3000) {
                            room.setPlayerAvatar(player.id, "👑");
                        } else if (result[0].elo >= 2800) {
                            room.setPlayerAvatar(player.id, "🏆");
                        } else if (result[0].elo >= 2600) {
                            room.setPlayerAvatar(player.id, "🌟");
                        } else if (result[0].elo >= 2400) {
                            room.setPlayerAvatar(player.id, "⭐");
                        } else if (result[0].elo >= 2200) {
                            room.setPlayerAvatar(player.id, "🏅");
                        } else if (result[0].elo >= 2000) {
                            room.setPlayerAvatar(player.id, "🥇");
                        } else if (result[0].elo >= 1800) {
                            room.setPlayerAvatar(player.id, "🥈");
                        } else if (result[0].elo >= 1600) {
                            room.setPlayerAvatar(player.id, "🥉");
                        } else if (result[0].elo >= 1400) {
                            room.setPlayerAvatar(player.id, "🐓");
                        } else if (result[0].elo >= 1200) {
                            room.setPlayerAvatar(player.id, "🐥");
                        } else if (result[0].elo >= 1000) {
                            room.setPlayerAvatar(player.id, "🐣");
                        } else if (result[0].elo >= 800) {
                            room.setPlayerAvatar(player.id, "🥚");
                        } else if (result[0].elo >= 600) {
                            room.setPlayerAvatar(player.id, "🕳️");
                        } else if (result[0].elo >= 400) {
                            room.setPlayerAvatar(player.id, "💀");
                        } else if (result[0].elo >= 200) {
                            room.setPlayerAvatar(player.id, "☠️");
                        } else {
                            room.setPlayerAvatar(player.id, "⚰️");
                        }
                    }
                }
            }
        });
    }

    //                          Quando o player entra                        //

    room.onPlayerJoin = (player: any) => {
        // Guardar variáveis locais.
        playerConnections.set(player.id, player.conn);
        playerAuth.set(player.id, player.auth);
        superadmin[player.id] = 0;

        // Timer para kick se não fizer login/registo.
        timeoutIds[player.id] = setTimeout(() => {
            // Se o timer acabar leva kick.
            room.kickPlayer(player.id, "🚫 Tempo esgotado para login/registo.");
            // Mostrar a razão na consola.
            console.log(`${player.name} foi expulso da sala porque excedeu o limite de tempo para registo/login.`); // Isto por vezes aparece erróneamente porém eu não tenho pachorra para limpar este cadito de código :)
        }, 45000); // 45 segundos

        console.log(`${player.name} entrou na sala.`);

        setTimeout(() => { // Timeout para apenas checkar os bans após 15ms para não haver ghost logins.
            // Checkar nomes, conn e auth por ban.
            con.query(`SELECT * FROM bans WHERE name = ? OR conn = ? OR auth = ?`, [player.name, player.conn, player.auth], (err: any, result: any) => {
                if (err) throw err;
                if (result.length > 0) {
                    for (const ban of result) {
                        // Reduzir tamanho da data.
                        const banEndTime = new Date(ban.time);
                        const formattedBanEndTime = banEndTime.toLocaleDateString('pt-PT', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        });
                        const now = Date.now();
                        if (now < new Date(banEndTime).getTime()) {
                            room.kickPlayer(player.id, `🚫 Estás banido até ${formattedBanEndTime} razão: ${ban.reason}`);
                            console.log(`${player.name} levou kick pois está banido.`);
                            break;
                        }
                    }
                }
            });
        }, 15); // 15 ms para não bugar login automático, otherwise fica com o login na db.

        // Checkar se o jogador está mute pelo nome, conn ou auth, se sim, definir na variável local :)
        con.query(`SELECT * FROM mutes WHERE name = ? OR conn = ? OR auth = ?`, [player.name, player.conn, player.auth], (err: any, result: any) => {
            if (err) throw err;
            if (result.length > 0) {
                for (const mute of result) {
                    const muteEndTime = new Date(mute.time).getTime();
                    const now = Date.now();
                    if (now < muteEndTime) {
                        isMuted[player.id] = true
                        break;
                    }
                }
            }
        });

        // Evitar double login.
        // Checkar o nome na DB.
        con.query(`SELECT * FROM players WHERE name = ?`, [player.name], (err: any, result: any) => {
            if (err) throw err;
            if (result.length > 0) {
                if (result[0].loggedIn === 0) { // Caso já esteja logado não fazer Login automático.
                    if (result[0].auth === player.auth) {
                        const playerId = player.id;
                        const conn = playerConnections.get(player.id);
                        const sql = `UPDATE players SET game_id = ?, conn = ?, loggedIn = 1 WHERE LOWER(name) = LOWER(?)`;
                        const values = [playerId, conn, player.name];
                        con.query(sql, values, (err: any) => {
                            if (err) throw err;

                            handleRanks(player); // Definir avatar.

                            loggedInPlayers[player.id] = true;
                            activePlayers = room.getPlayerList().filter((p: Player) => {
                                return loggedInPlayers[p.id] && !afkStatus[p.id];
                            });

                            setTimeout(() => { // Código que controla quando o jogador entra na sala e o coloca a jogar.
                                // Checkar se só há 1 jogador na sala.
                                if (activePlayers.length === 1) {
                                    // Adicionar o jogador à equipa vermelha e siga siga!
                                    const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                    if (spectators.length >= 1) {
                                        room.setCustomStadium(NoGoal);
                                        // Colocar jogador na equipa vermelha.
                                        room.setPlayerTeam(spectators[0].id, 1);
                                        room.startGame();
                                    }
                                } else if (activePlayers.length === 2) {
                                    // Se existirem 2 jogadores, então colocar o jogador que chegou na equipa blue e mudar mapa.
                                    room.stopGame();
                                    room.setPlayerTeam(player.id, 2);
                                    room.setCustomStadium(Aquecimento);
                                    room.startGame();
                                } else if (activePlayers.length === 4) {
                                    // Sacar 2 jogadores da equipa dos spectatores.
                                    const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                    if (spectators.length >= 2) {
                                        // Vermelha
                                        room.setPlayerTeam(spectators[0].id, 1);
                                        // Azul
                                        room.setPlayerTeam(spectators[1].id, 2);
                                    }
                                    // 6 jogadores
                                } else if (activePlayers.length === 6) {
                                    // Mesma coisa de acima
                                    const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                    if (spectators.length >= 2) {
                                        room.stopGame();
                                        room.setCustomStadium(Futsal);
                                        // Vermelha
                                        room.setPlayerTeam(spectators[0].id, 1);
                                        // Azul
                                        room.setPlayerTeam(spectators[1].id, 2);
                                        room.startGame();
                                    }
                                }
                            }, 30); // 30 ms, este valor tem de ser no mínimo 10ms a mais do valor acima nos bans.
                            // FIM Código que controla quando o jogador entra na sala e o coloca a jogar.                                    

                            if (result[0].superAdmin === 1) {
                                // O usuário é super admin como tal dar admin ao mesmo.
                                room.setPlayerAdmin(player.id, true);
                                room.sendAnnouncement(`👑 ${player.name}, tu és um super administrador e recebeste admin automaticamente.`, player.id, 0xFFBF00, "bold");
                                superadmin[player.id] = 1;
                            }
                            console.log(`${player.name} foi logado automaticamente.`);
                            room.sendAnnouncement(`✅ O nosso sistema autenticou-te automaticamente, bem-vindo de volta, ${player.name}#${player.id}!\n❓ Faz !help para verificares os comandos disponíveis na sala, em caso de dúvida com algum, faz !help COMANDO\n👥 Não te esqueças de entrar no nosso discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
                            // Limpar timeout.
                            if (timeoutIds[player.id]) {
                                clearTimeout(timeoutIds[player.id]);
                                delete timeoutIds[player.id];
                            }
                        });
                    } else {
                        // O nome está registado porém não foi possível autenticar o login, pedir ao usuário para fazer login.
                        room.sendAnnouncement(`😃 Olá ${player.name}#${player.id}, por favor inicia sessão com !login seguido pela tua password.\n❓ Faz !help para verificares os comandos disponíveis na sala, em caso de dúvida com algum, faz !help COMANDO\n👥 Não te esqueças de entrar no nosso discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
                    }
                } // Fechar proteção do Double Login.
            } else {
                // O nome não está registado, pedir ao usuário para se registar.
                room.sendAnnouncement(`😃 Bem-vindo, ${player.name}#${player.id}! Para te registares faz !registo seguido pela tua password.\n❓ Faz !help para verificares os comandos disponíveis na sala, em caso de dúvida com algum, faz !help COMANDO\n👥 Não te esqueças de entrar no nosso discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
            }
        });

        // Proteção do double login :D
        const sql2 = `SELECT game_id FROM players WHERE LOWER(name) = LOWER(?)`;
        const values2 = [player.name];
        con.query(sql2, values2, (err: any, result: { game_id: number; }[]) => {
            if (err) throw err;
            if (result.length === 0) {
                // Usuário não registado, deixar entrar, pois é impossível estar com login feito, se o mesmo não existe.
            }
            else if (result[0].game_id !== 0) {
                room.kickPlayer(player.id, "🚫 Já estás logado.");
            }
        });
    }

    //             Função AFK a meio do jogo            //

    const activities: { [key: string]: number } = {}; // Verificar quando foi a última atividade.
    var AFKTimeout = 10000; // 10 segundos afk = kick
    let lastWarningTime: number = 0; // Mandar avisos de kick

    function afkKick() {
        activePlayers = room.getPlayerList().filter((p: Player) => {
            return loggedInPlayers[p.id] && !afkStatus[p.id];
        });
        const redTeam = activePlayers.filter((p: { team: number; }) => p.team === 1);
        const blueTeam = activePlayers.filter((p: { team: number; }) => p.team === 2);
        if (redTeam.length >= 2 && blueTeam.length >= 2) { // Levar kick caso estejam X jogadores em cada equipa.
            for (const p of activePlayers) {
                if (p.team !== 0) {
                    if (Date.now() - activities[p.id] > AFKTimeout) {
                        room.kickPlayer(p.id, "🚫 Inatividade a meio do jogo!");

                    } else if (Date.now() - activities[p.id] > AFKTimeout - 6000) {
                        if (Date.now() - lastWarningTime > 2000) {
                            room.sendAnnouncement("🚫 Vais ser kickado por inatividade, move-te ou escreve algo para evitar ser kickado.", p.id, 0xFF0000, "bold", 2);
                            lastWarningTime = Date.now();
                        }
                    }
                }
            }
        }
    }

    room.onGamePause = function(player: { id: string | number; } | null) {
        // Atividades
        if (player != null) {
            activities[player.id] = Date.now();
        }
        // Não permitir pausar o jogo.
        room.pauseGame(false);
    }

    room.onGameUnpause = function(player: { id: string | number; } | null) {
        // Atividade
        if (player != null) {
            activities[player.id] = Date.now();
        }
    }

    room.onPositionsReset = function() {
        // Atividade
        for (var i = 0; i < activePlayers.length; i++) {
            activities[activePlayers[i].id] = Date.now();
        }
    }

    room.onPlayerActivity = function(player: { id: string | number; }) {
        // Atividade
        activities[player.id] = Date.now();
    }

    // Remover ban automaticamente.
    room.onPlayerKicked = () => {
        room.clearBans();
    }

    //                                    CHAT                                      //

    room.onPlayerChat = (player: any, message: string) => {
        // Logs sem os !comandos.
        if (!message.startsWith("!")) {
            var Hora = new Date(Date.now());
            var HoraFormatada = Hora.toLocaleDateString('pt-PT', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });
            console.log(`${HoraFormatada} | ${player.name}: ${message}`); // Colocar no cmd.
            fs.appendFile('./logs/chat.txt', `${HoraFormatada} | ${player.name}: ${message}\n`, (err: any) => { // Colocar no chat.txt
                if (err) throw err;
            });
        }
        // Jogador escreveu, adicionar atividade recente.
        activities[player.id] = Date.now();
        // Comandos
        if (message.startsWith("!")) {
            const words = message.split(" ");
            // Comando de registo
            if (words[0] === "!registo") {
                const password = words[1];
                if (!password) {
                    room.sendAnnouncement(`🚫 ${player.name}, necessitas de colocar uma password depois do !comando.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                if (password.length < 3) {
                    room.sendAnnouncement(`🚫 ${player.name}, a password tem de ter pelo menos 3 caracteres.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                const conn = playerConnections.get(player.id);
                const sql = `SELECT COUNT(*) as count FROM players WHERE conn = ?`;
                const values = [conn];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result[0].count >= 2) {
                        room.sendAnnouncement(`🚫 ${player.name}, já tens duas contas registadas.`, player.id, 0xFF0000, "bold", 2);
                        console.log(`O usuário ${player.name}, tentou registar-se porém já tem 2 contas, CONN: ${conn}`);
                    } else { // Checkar se uma conta com um nome igual já existe na database
                        const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                        const values = [player.name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                            if (result.length > 0) {
                                // Nome do jogador já está na database :(
                                room.sendAnnouncement(`🚫 ${player.name}, já existe uma conta com este nome. Por favor troca o teu nome do haxball ou faz login com !login seguido pela tua password.`, player.id, 0xFF0000, "bold", 2);
                            } else {
                                // O nome do jogador não está na database, siga siga registar :D
                                bcrypt.hash(password, 10, (err: any, hashedPassword: any) => {
                                    if (err) throw err;
                                    const conn = playerConnections.get(player.id);
                                    const sql = `INSERT INTO players (game_id, name, password, loggedIn, conn) VALUES (?,?,?,?,?)`;
                                    const values = [player.id, player.name, hashedPassword, 1, conn];
                                    con.query(sql, values, (err: any) => {
                                        if (err) throw err;
                                        console.log(`Novo registo: ${player.name}`);
                                        room.sendAnnouncement(`✅ ${player.name}, o teu registo foi concluído com sucesso!\n❓ Faz !help para verificares os comandos disponíveis na sala, em caso de dúvida com algum, faz !help COMANDO\n👥 Não te esqueças de entrar no nosso discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");

                                        handleRanks(player); // Definir avatar.

                                        loggedInPlayers[player.id] = true;
                                        activePlayers = room.getPlayerList().filter((p: Player) => {
                                            return loggedInPlayers[p.id] && !afkStatus[p.id];
                                        });
                                        // Código que controla quando o jogador entra na sala e o coloca a jogar.
                                        // Checkar se só há 1 jogador na sala.
                                        if (activePlayers.length === 1) { // Adicionar o jogador à equipa vermelha e siga siga!
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 1) {
                                                room.stopGame();
                                                room.setCustomStadium(NoGoal);
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                room.startGame();
                                            }
                                        } else if (activePlayers.length === 2) { // Se existirem 2 jogadores, então colocar o jogador que chegou na equipa blue e mudar mapa.
                                            room.stopGame();
                                            room.setPlayerTeam(player.id, 2);
                                            room.setCustomStadium(Aquecimento);
                                            room.startGame();
                                        } else if (activePlayers.length === 4) {
                                            // Sacar 2 jogadores da equipa dos spectatores.
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 2) {
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                // Azul
                                                room.setPlayerTeam(spectators[1].id, 2);
                                            }
                                            // 6 jogadores
                                        } else if (activePlayers.length === 6) { // Mesma coisa de acima
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 2) {
                                                room.stopGame();
                                                room.setCustomStadium(Futsal);
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                // Azul
                                                room.setPlayerTeam(spectators[1].id, 2);
                                                room.startGame();
                                            }
                                        } // FIM Código que controla quando o jogador entra na sala e o coloca a jogar.
                                        // Limpar timeout
                                        if (timeoutIds[player.id]) {
                                            clearTimeout(timeoutIds[player.id]);
                                            delete timeoutIds[player.id];
                                        }
                                    });
                                });
                            }
                        });
                    }
                });
                // Comando de Login
            } else if (words[0] === "!login") {
                const password = words[1];
                if (!password) {
                    room.sendAnnouncement(`🚫 ${player.name}, necessitas de colocar uma password depois do !comando.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                if (password.length < 1) {
                    room.sendAnnouncement(`🚫 ${player.name}, necessitas de colocar uma password depois do !comando.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;

                    if (result.length > 0) { // Um jogador com o mesmo nome foi encontrado.
                        if (result[0].loggedIn === 1) { // O jogador já está logado.
                            room.sendAnnouncement(`🚫 ${player.name}, já estás logado.`, player.id, 0xFF0000, "bold", 2);
                        } else {
                            // O jogador não está logado ainda, então prosseguir.
                            bcrypt.compare(password, result[0].password, (err: any, isMatch: boolean) => {
                                if (err) throw err;
                                if (isMatch) { // Password correta, permitir o login e associar game_id à conta em questão.
                                    const playerId = player.id;
                                    const conn = playerConnections.get(player.id);
                                    const auth = playerAuth.get(player.id);
                                    const sql = `UPDATE players SET game_id = ?, conn = ? , auth = ?, loggedIn = 1 WHERE LOWER(name) = LOWER(?)`;
                                    const values = [playerId, conn, auth, player.name];
                                    con.query(sql, values, (err: any) => {
                                        if (err) throw err;

                                        handleRanks(player); // Definir avatar.

                                        loggedInPlayers[player.id] = true;
                                        activePlayers = room.getPlayerList().filter((p: Player) => {
                                            return loggedInPlayers[p.id] && !afkStatus[p.id];
                                        });
                                        // Código que controla quando o jogador entra na sala e o coloca a jogar.
                                        if (activePlayers.length === 1) { // Checkar se só há 1 jogador na sala.
                                            // Adicionar o jogador à equipa vermelha e siga siga!
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 1) {
                                                room.setCustomStadium(NoGoal);
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                room.startGame();
                                            }
                                        } else if (activePlayers.length === 2) { // Se existirem 2 jogadores, então colocar o jogador que chegou na equipa blue e mudar mapa.
                                            room.stopGame();
                                            room.setPlayerTeam(player.id, 2);
                                            room.setCustomStadium(Aquecimento);
                                            room.startGame();
                                        } else if (activePlayers.length === 4) { // Sacar 2 jogadores da equipa dos spectatores.
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 2) {
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                // Azul
                                                room.setPlayerTeam(spectators[1].id, 2);
                                            }
                                            // 6 jogadores
                                        } else if (activePlayers.length === 6) { // Mesma coisa de acima
                                            const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                            if (spectators.length >= 2) {
                                                room.stopGame();
                                                room.setCustomStadium(Futsal);
                                                // Vermelha
                                                room.setPlayerTeam(spectators[0].id, 1);
                                                // Azul
                                                room.setPlayerTeam(spectators[1].id, 2);
                                                room.startGame();
                                            }
                                        } // FIM Código que controla quando o jogador entra na sala e o coloca a jogar.                                    

                                        if (result[0].superAdmin === 1) { // O usuário é super admin como tal dar admin ao mesmo.
                                            room.setPlayerAdmin(player.id, true);
                                            room.sendAnnouncement(`👑 ${player.name}, tu és um super administrador e recebeste admin automaticamente.`, player.id, 0xFFBF00, "bold");
                                            superadmin[player.id] = 1;
                                        }
                                        console.log(`${player.name} logou-se.`);
                                        room.sendAnnouncement(`✅ Bem-vindo de volta, ${player.name}#${player.id}!\n❓ Faz !help para verificares os comandos disponíveis na sala, em caso de dúvida com algum, faz !help COMANDO\n👥 Não te esqueças de entrar no nosso discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
                                        // Limpar timeout.
                                        if (timeoutIds[player.id]) {
                                            clearTimeout(timeoutIds[player.id]);
                                            delete timeoutIds[player.id];
                                        }
                                    });
                                } else {
                                    // Password errada e kick no homem, lá pra fora!
                                    room.kickPlayer(player.id, `🚫 ${player.name}, Password Incorreta!`);
                                    console.log(`${player.name} foi expulso por password errada.`);
                                }
                            });
                        }
                    } else { // Não foi encontrada uma conta o jogador tem de se registar primeiro.
                        room.sendAnnouncement(`🚫 ${player.name}, ainda não te registaste. Por favor faz !registo seguido pela tua password.`, player.id, 0xFF0000, "bold", 2);
                    }
                });
                // Mudar a password
            } else if (words[0] === "!changepw") {
                const input = words;
                if (input.length < 3) {
                    room.sendAnnouncement(`🚫 ${player.name}, por favor usa o formato !changepw antiga_password nova_password.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                const oldPassword = input[1];
                const newPassword = input[2];
                if (!oldPassword || !newPassword) {
                    room.sendAnnouncement(`🚫 ${player.name}, necessitas de colocar uma password antiga e uma nova password depois do !comando.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }
                if (oldPassword.length < 3 || newPassword.length < 3) {
                    room.sendAnnouncement(`🚫 ${player.name}, a password tem de ter pelo menos 3 caracteres.`, player.id, 0xFF0000, "bold", 2);
                    return false;
                }

                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;

                    if (result.length > 0) {
                        const hashedPassword = result[0].password;
                        bcrypt.compare(oldPassword, hashedPassword, (err: any, match: any) => {
                            if (err) throw err;

                            if (match) {
                                bcrypt.hash(newPassword, 10, (err: any, newHashedPassword: any) => {
                                    if (err) throw err;

                                    const sql = `UPDATE players SET password = ? WHERE LOWER(name) = LOWER(?)`;
                                    const values = [newHashedPassword, player.name];
                                    con.query(sql, values, (err: any) => {
                                        if (err) throw err;
                                        room.sendAnnouncement(`✅ ${player.name}, a tua password foi alterada com sucesso!`, player.id, 0x00FF00, "bold");
                                        console.log(`${player.name} alterou a password.`);
                                    });
                                });
                            } else {
                                room.sendAnnouncement(`🚫 ${player.name}, a tua password antiga está incorreta.`, player.id, 0xFF0000, "bold", 2);
                                console.log(`${player.name} tentou mudar a password mas errou a password antiga.`);
                            }
                        });
                    } else {
                        room.sendAnnouncement(`🚫 ${player.name}, a tua conta não tem um registo efetuado.`, player.id, 0xFF0000, "bold", 2);
                    }
                });
                // Comando AFK
            } else if (message === "!afk") {
                const sql = `SELECT loggedIn FROM players WHERE name = ?`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0 && result[0].loggedIn === 1) { // Se estiver num 3v3 não permitir entrar em AFK mode.
                        if (activePlayers.length >= 6 && (player.team === 1 || player.team === 2)) {
                            room.sendAnnouncement(`🚫 ${player.name}, não podes ir AFK, pois estás a meio de um jogo 3v3!`, player.id, 0xFF0000, "bold", 2);
                            return;
                        }
                        // Está logado, logo proceder com o comando.
                        else if (afkStatus[player.id] === 1) {
                            afkStatus[player.id] = 0;
                            room.sendAnnouncement(`😃 ${player.name} voltou do AFK!`, null, 0x00FF00, "bold", 0);
                            if (timeoutIds[player.id]) {
                                clearTimeout(timeoutIds[player.id]);
                                delete timeoutIds[player.id];
                            }
                            loggedInPlayers[player.id] = true;
                            activePlayers = room.getPlayerList().filter((p: Player) => {
                                return loggedInPlayers[p.id] && !afkStatus[p.id];
                            });
                            if (activePlayers.length === 1) { // Checkar se só há 1 jogador na sala.
                                // Adicionar o jogador à equipa vermelha e siga siga!
                                const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                if (spectators.length >= 1) {
                                    room.setCustomStadium(NoGoal);
                                    // Vermelha
                                    room.setPlayerTeam(spectators[0].id, 1);
                                    room.startGame();
                                }
                            } else if (activePlayers.length === 2) { // Se existirem 2 jogadores na sala.
                                room.stopGame();
                                room.setPlayerTeam(player.id, 2);
                                room.setCustomStadium(Aquecimento);
                                room.startGame();

                            } else if (activePlayers.length === 4) { // Sacar 2 jogadores da equipa dos spectatores.
                                const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                if (spectators.length >= 2) {
                                    // Vermelha
                                    room.setPlayerTeam(spectators[0].id, 1);
                                    // Azul
                                    room.setPlayerTeam(spectators[1].id, 2);
                                }
                                // 6 jogadores
                            } else if (activePlayers.length === 6) { // Mesma coisa de acima
                                const spectators = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                if (spectators.length >= 2) {
                                    room.stopGame();
                                    room.setCustomStadium(Futsal);

                                    // Vermelho
                                    if (spectators.length > 0) {
                                        room.setPlayerTeam(spectators[0].id, 1);
                                        // Azul
                                        room.setPlayerTeam(spectators[1].id, 2);
                                    }
                                    room.startGame();
                                }
                            }
                        } else {
                            afkStatus[player.id] = 1;
                            room.sendAnnouncement(`💤 ${player.name} está agora AFK!`, null, 0x00FF00, "bold", 0);
                            // Levar kick por AFK +10 minutos se não for superAdmin
                            if (superadmin[player.id] !== 1) {
                                setTimeout(() => {
                                    if (afkStatus[player.id] === 1) {
                                        room.kickPlayer(player.id, `🚫 ${player.name}, estiveste AFK por muito tempo (10m).`);
                                    }
                                }, 10 * 60 * 1000); // 10 minutos = 600000 ms
                            }
                            activePlayers = room.getPlayerList().filter((p: Player) => {
                                return loggedInPlayers[p.id] && !afkStatus[p.id];
                            });
                            // Se o jogador estiver numa equipa.
                            if (player.team === 1 || player.team === 2) {
                                // Mover jogador para os spectators.
                                room.setPlayerTeam(player.id, 0);
                                // Definir as variáveis early
                                const remainingPlayer = activePlayers.find((p: { team: number; }) => p.team === 0);
                                const redPlayers = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                const bluePlayers = activePlayers.filter((p: { team: number; }) => p.team === 2);
                                // Saíram todos, então parar o jogo.
                                if (activePlayers.length === 0) {
                                    room.stopGame();
                                    room.setCustomStadium(NoGoal);
                                    // Checkar se só existe um jogador restante.
                                } else if (activePlayers.length === 1) {
                                    // Colocar o jogador que resta na equipa vermelha.
                                    room.stopGame();
                                    room.setPlayerTeam(activePlayers[0].id, 1);
                                    room.setCustomStadium(NoGoal);
                                    room.startGame();
                                    // Checkar se só ficaram 2 jogadores
                                } else if (activePlayers.length === 2) {
                                    const maxPlayersPerTeam = 1; // Máximo de jogadores por equipa.
                                    // Checkar o jogador que ficou na equipa 0 (Spectators)
                                    if (remainingPlayer) {
                                        if (redPlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 1);
                                        } else if (bluePlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 2);
                                        }
                                        // Parar o jogo e colocar o jogador na equipa correta.
                                        room.stopGame();
                                        room.setCustomStadium(Aquecimento);
                                        // Começar o jogo novamente.
                                        room.startGame();
                                    } else {
                                        if (redPlayers.length > bluePlayers.length) {
                                            const playerToRemove = redPlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        } else if (bluePlayers.length > redPlayers.length) {
                                            const playerToRemove = bluePlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        }
                                    }
                                    // 3 jogadores.
                                } else if (activePlayers.length === 3) {
                                    const maxPlayersPerTeam = 1; // Máximo de jogadores por equipa.
                                    // Checkar o jogador que ficou na equipa 0 (Spectators)
                                    if (remainingPlayer) {
                                        if (redPlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 1);
                                        } else if (bluePlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 2);
                                        }
                                    } else {
                                        if (redPlayers.length > bluePlayers.length) {
                                            const playerToRemove = redPlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        } else if (bluePlayers.length > redPlayers.length) {
                                            const playerToRemove = bluePlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        }
                                    }
                                } else if (activePlayers.length === 4) {
                                    const maxPlayersPerTeam = 2; // Máximo de jogadores por equipa.
                                    // Checkar o jogador que ficou na equipa 0 (Spectators)
                                    if (remainingPlayer) {
                                        if (redPlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 1);
                                        } else if (bluePlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 2);
                                        }
                                    } else {
                                        if (redPlayers.length > bluePlayers.length) {
                                            const playerToRemove = redPlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        } else if (bluePlayers.length > redPlayers.length) {
                                            const playerToRemove = bluePlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        }
                                    }
                                } else if (activePlayers.length === 5) {
                                    const maxPlayersPerTeam = 2; // Máximo de jogadores por equipa.
                                    // Checkar o jogador que ficou na equipa 0 (Spectators)
                                    if (remainingPlayer) {
                                        if (redPlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 1);
                                        } else if (bluePlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 2);
                                        }
                                    } else {
                                        if (redPlayers.length > bluePlayers.length) {
                                            const playerToRemove = redPlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        } else if (bluePlayers.length > redPlayers.length) {
                                            const playerToRemove = bluePlayers[0];
                                            room.setPlayerTeam(playerToRemove.id, 0);
                                        }
                                    }
                                    room.stopGame();
                                    room.sendAnnouncement("📊 Estão menos de 6 jogadores em jogo logo o resultado já não conta para as estatísticas!", null, 0x00FF00, "bold");
                                    room.setCustomStadium(Aquecimento);
                                    room.startGame();
                                } else if (activePlayers.length >= 6) {
                                    const maxPlayersPerTeam = 3; // Máximo de jogadores por equipa.
                                    // Checkar o jogador que ficou na equipa 0 (Spectators)
                                    if (remainingPlayer) {
                                        if (redPlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 1);
                                        } else if (bluePlayers.length < maxPlayersPerTeam) {
                                            room.setPlayerTeam(remainingPlayer.id, 2);
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Jogador não está logado, logo não pode ir AFK
                        room.sendAnnouncement(`🚫 ${player.name}, precisas de estar logado para usar este comando.`, player.id, 0xFF0000, "bold", 2);
                    }
                });
            } else if (words[0] === "!lista") {
                const afkPlayers = room.getPlayerList().filter((p: { id: number; }) => afkStatus[p.id] === 1);
                let playerNames = afkPlayers.map((p: { id: any; }) => {
                    return room.getPlayer(p.id).name;
                });
                if (playerNames.length > 0) {
                    room.sendAnnouncement(`💤 Lista de jogadores AFK: ${playerNames.join(", ")}`, player.id, 0xFFFFFF, "bold");
                } else {
                    room.sendAnnouncement(`🚫 Não há jogadores AFK de momento.`, player.id, 0xFF0000, "bold");
                }
                // Comando Streak
            } else if (words[0] === "!streak") {
                room.sendAnnouncement(`🏆 ${player.name}, a streak atual da sala é de ${winstreak} jogos para a equipa 🔴!`, player.id, 0xFFFFFF, "bold");
                // Comando Top Streak
            } else if (words[0] === "!topstreak") {
                const sql = `SELECT * FROM streak`;
                con.query(sql, (err: any, result: any) => {
                    if (err) throw err;
                    room.sendAnnouncement(`🏆 ${player.name}, a top streak atual é de ${result[0].games} jogos e foi conquistada pelos jogadores ${result[0].player1}, ${result[0].player2} e ${result[0].player3}!`, player.id, 0xFFFFFF, "bold");
                });
                // Comando GK
            } else if (words[0] === "!gk") {
                // Está nos spectators.
                if (player.team == 0) {
                    room.sendAnnouncement(`🚫 ${player.name}, não estás em nenhuma equipa para usar este comando!`, player.id, 0xFF0000, "bold", 2);
                }
                else if (gk[0] && gk[0].id === player.id) {
                    room.sendAnnouncement(`🚫 ${player.name}, já és GK da equipa 🔴!`, player.id, 0xFF0000, "bold", 2);
                } else if (gk[1] && gk[1].id === player.id) {
                    room.sendAnnouncement(`🚫 ${player.name}, já és GK da equipa 🔵!`, player.id, 0xFF0000, "bold", 2);
                    // Se estiverem à menos de 1 minuto em jogo.
                } else if (room.getScores().time < 60) {
                    // Equipa red
                    if (player.team == 1) {
                        gk[0] = player;
                        room.sendAnnouncement(`🔴 ${player.name} usou o comando !gk e é agora o novo GK da equipa 🔴`, null, 0xFFFFFF, "bold");
                    }
                    // Equipa blue
                    else if (player.team == 2) {
                        gk[1] = player;
                        room.sendAnnouncement(`🔵 ${player.name} usou o comando !gk e é agora o novo GK da equipa 🔵`, null, 0xFFFFFF, "bold");
                    }
                    // Se estiverem à mais de 1 minuto em jogo.
                } else if (room.getScores().time > 60) {
                    if (player.team == 1 || player.team == 2) {
                        room.sendAnnouncement(`🚫 ${player.name}, já passou muito tempo de jogo (1 minuto), já não podes mudar para GK.`, player.id, 0xFF0000, "bold", 2);
                    }
                }
                // Comando !sub
            } else if (words[0] === "!sub") {
                // Definir spectators.
                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
                // Se está nos spectators.
                if (player.team == 0) {
                    room.sendAnnouncement(`🚫 ${player.name}, não estás em nenhuma equipa para usar este comando!`, player.id, 0xFF0000, "bold", 2);
                }
                else if (spectatorPlayers.length === 0) {
                    room.sendAnnouncement(`🚫 ${player.name}, não estão presentes jogadores ativos nos espetadores!`, player.id, 0xFF0000, "bold", 2);
                }
                else if (room.getScores().time <= 5) {
                    // Equipa red
                    if (player.team == 1) {
                        if (spectatorPlayers.length >= 1) {
                            room.setPlayerTeam(player.id, 0)
                            room.sendAnnouncement(`📖🔴 ${player.name} usou o comando !sub para ser substituído.`, null, 0xFFFFFF, "bold");
                            for (let i = 0; i < 1; i++) {
                                if (spectatorPlayers[i]) {
                                    room.setPlayerTeam(spectatorPlayers[i].id, 1)
                                }
                            }
                        }
                    }
                    else if (player.team == 2) {
                        if (spectatorPlayers.length >= 1) {
                            room.setPlayerTeam(player.id, 0)
                            room.sendAnnouncement(`📖🔵 ${player.name} usou o comando !sub para ser substituído.`, null, 0xFFFFFF, "bold");
                            for (let i = 0; i < 1; i++) {
                                if (spectatorPlayers[i]) {
                                    room.setPlayerTeam(spectatorPlayers[i].id, 2)
                                }
                            }
                        }
                    }
                }
                // Se estiverem à mais de 1 minuto em jogo.
                else if (room.getScores().time > 5) {
                    if (player.team == 1 || player.team == 2) {
                        room.sendAnnouncement(`🚫 ${player.name}, já passou muito tempo de jogo (pré-jogo + 5 segundos), já não podes sair do jogo (não és prejudicado caso saias se ainda não sofreste nenhum golo).`, player.id, 0xFF0000, "bold", 2);
                    }
                }
                // Logout bem básico.
            } else if (words[0] === "!bb") {
                room.kickPlayer(player.id, `👋 Adeus ${player.name}, até à próxima!`);
                // Comando About
            } else if (words[0] === "!about") {
                room.sendAnnouncement(`⚡ Powered By HaxRooms V1.4.4\n🧑🏽 Sala desenvolvida por Azis\n👥 Entra no nosso Discord para mais informações: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
                // Comando para mostrar o link do meu discord.
            } else if (words[0] === "!discord") {
                room.sendAnnouncement(`👥 Discord: https://discord.gg/EKsppWH5PU`, player.id, 0xFFFFFF, "bold");
                // Mostrar os ranks
            } else if (words[0] === "!rank") {
                room.sendAnnouncement(`Novo jogador: 🌱 | 0 pts: ⚰️ | 200 pts: ☠️ | 400 pts: 💀 | 600 pts: 🕳️ | 800 pts: 🥚 | 1000 pts: 🐣 | 1200 pts: 🐥 | 1400 pts: 🐓 | 1600 pts: 🥉 | 1800 pts: 🥈 | 2000 pts: 🥇 | 2200 pts: 🏅 | 2400 pts: ⭐ | 2600 pts: 🌟 | 2800 pts: 🏆 | 3000 pts: 👑 | 4000 pts: 🐐`, player.id, 0xFFFFFF, "bold");
                // Comando das estatísticas
            } else if (words[0] === "!stats") {
                // Checkar se o jogador está registado
                const sql = `SELECT * FROM players WHERE name = ?`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length === 0) {
                        // Não está registado
                        room.sendAnnouncement(`Não estás registado, logo não podes usar este comando! Escreve !registo PASSWORD to para te registares.`, player.id, 0xFF0000, "bold", 2);
                    } else if (words.length === 1) {
                        // Ver as próprias estatísticas
                        const sql = `SELECT * FROM players WHERE name = ?`;
                        const values = [player.name];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                            room.sendAnnouncement(`📊 O teu ELO: ${result[0].elo}`, player.id, 0xFFFFFF, "bold");
                            room.sendAnnouncement(`📊 As tuas estatísticas: Jogos: ${result[0].games}, Vitórias: ${result[0].wins}, Derrotas: ${result[0].losses}, Golos: ${result[0].goals}, Assistências: ${result[0].assists}, Auto-Golos: ${result[0].ag}, CS: ${result[0].cs}`, player.id, 0xFFFFFF, "bold", 0);
                        });
                        // Médias
                        con.query(`SELECT wins as wins, goals as goals, games as games, assists as assists FROM players WHERE name = ?`, [player.name], (err: any, result: string | any[]) => {
                            if (err) throw err;
                            if (result.length > 0) {
                                const totalGoals = result[0].goals;
                                const totalAssists = result[0].assists;
                                const totalGames = result[0].games;
                                const totalWins = result[0].wins;
                                let averageGoalsPerGame = 0;
                                let averageAssistsPerGame = 0;
                                let winRate = 0;
                                if (totalGames != 0) {
                                    averageGoalsPerGame = totalGoals / totalGames;
                                    averageAssistsPerGame = totalAssists / totalGames;
                                    winRate = (totalWins / totalGames) * 100;
                                }
                                room.sendAnnouncement(`📊 Tens uma média de ${averageGoalsPerGame.toFixed(1)} golos e ${averageAssistsPerGame.toFixed(1)} assistências por jogo e um percentual de vitória de ${winRate.toFixed(2)}%.`, player.id, 0xFFFFFF, "bold", 0);
                            }
                        });
                    } else {
                        // Ver as stats de outro jogador
                        const targetPlayer = words.slice(1).join(" ");
                        const sql = `SELECT * FROM players WHERE name = ?`;
                        const values = [targetPlayer];
                        con.query(sql, values, (err: any, result: any) => {
                            if (err) throw err;
                            if (result.length === 0) {
                                room.sendAnnouncement(`🚫 Jogador ${targetPlayer} não encontrado.`, player.id, 0xFF0000, "bold", 2);
                            } else {
                                room.sendAnnouncement(`📊 O ELO de ${targetPlayer}: ${result[0].elo}`, player.id, 0xFFFFFF, "bold");
                                room.sendAnnouncement(`📊 Estatísticas de ${targetPlayer}: Jogos: ${result[0].games}, Vitórias: ${result[0].wins}, Derrotas: ${result[0].losses}, Golos: ${result[0].goals}, Assistências: ${result[0].assists}, Auto-Golos: ${result[0].ag}, CS: ${result[0].cs}`, player.id, 0xFFFFFF, "bold", 0);
                                // Médias
                                con.query(`SELECT wins as wins, goals as goals, games as games, assists as assists FROM players WHERE name = ?`, [targetPlayer], (err: any, result: string | any[]) => {
                                    if (err) throw err;
                                    if (result.length > 0) {
                                        const totalGoals = result[0].goals;
                                        const totalAssists = result[0].assists;
                                        const totalGames = result[0].games;
                                        const totalWins = result[0].wins;
                                        let averageGoalsPerGame = 0;
                                        let averageAssistsPerGame = 0;
                                        let winRate = 0;
                                        if (totalGames != 0) {
                                            averageGoalsPerGame = totalGoals / totalGames;
                                            averageAssistsPerGame = totalAssists / totalGames;
                                            winRate = (totalWins / totalGames) * 100;
                                        }
                                        room.sendAnnouncement(`📊 O jogador ${targetPlayer} tem uma média de ${averageGoalsPerGame.toFixed(1)} golos e ${averageAssistsPerGame.toFixed(1)} assistências por jogo e um percentual de vitória de ${winRate.toFixed(2)}%.`, player.id, 0xFFFFFF, "bold", 0);
                                    }
                                });
                            }
                        });
                    }
                });
            } else if (words[0] === "!unmute") {
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (!loggedInPlayers[player.id] || result[0].superAdmin !== 1) {
                            room.sendAnnouncement("🚫 Não tens autorização para usar este comando!", player.id, 0xFF0000, "bold", 2);
                        } else {
                            const currentDate = new Date();
                            const name = words.slice(1).join(" ");
                            const targetPlayer = room.getPlayerList().find((p: Player) => p.name === name);
                            // Remover o mute se o mute ainda estiver ativo.
                            con.query(`DELETE FROM mutes WHERE name = ? and time > ?`, [name, currentDate], (err: any, result: any) => {
                                if (err) throw err;
                                if (result.affectedRows > 0) {
                                    room.sendAnnouncement(`✅ O jogador foi desmutado com sucesso!`, player.id, 0x00FF00, "bold");
                                    if (targetPlayer) {
                                        isMuted[targetPlayer.id] = false;
                                    }
                                } else {
                                    room.sendAnnouncement(`🚫 O jogador não está mutado.`, player.id, 0xFF0000, "bold", 2);
                                }
                            });
                        }
                    }
                });
            } else if (words[0] === "!unban") {
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (!loggedInPlayers[player.id] || result[0].superAdmin !== 1) {
                            room.sendAnnouncement("🚫 Não tens autorização para usar este comando!", player.id, 0xFF0000, "bold", 2);
                        } else {
                            const currentDate = new Date();
                            const name = words.slice(1).join(" ");
                            const targetPlayer = room.getPlayerList().find((p: Player) => p.name === name);
                            // Remover o ban se o ban ainda estiver ativo.
                            con.query(`DELETE FROM bans WHERE name = ? and time > ?`, [name, currentDate], (err: any, result: any) => {
                                if (err) throw err;
                                if (result.affectedRows > 0) {
                                    room.sendAnnouncement(`✅ O jogador foi desbanido com sucesso!`, player.id, 0x00FF00, "bold");
                                    if (targetPlayer) {
                                        isMuted[targetPlayer.id] = false;
                                    }
                                } else {
                                    room.sendAnnouncement(`🚫 O jogador não está banido.`, player.id, 0xFF0000, "bold", 2);
                                }
                            });
                        }
                    }
                });
            } else if (words[0] === "!ban") {
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (!loggedInPlayers[player.id] || result[0].superAdmin !== 1) {
                            room.sendAnnouncement("🚫 Não tens autorização para usar este comando!", player.id, 0xFF0000, "bold", 2);
                        } else {
                            if (words.length <= 2 || !words.slice(3).join(" ")) {
                                room.sendAnnouncement("🚫 Faz razão, tempo, e nome (sem vírgulas).", player.id, 0xFF0000, "bold", 2);
                            }
                        }
                    }
                });
                const reason = words[1];
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql2 = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values2 = [player.name];
                con.query(sql2, values2, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (loggedInPlayers[player.id] && result[0].superAdmin === 1) {
                            const timeStr = words[2];
                            // Usar uma expressão regular para dar match na timestring.
                            const timeRegex = /^(\d+)([a-zA-Z]+)$/;
                            if (!timeStr) {
                                return;
                            }
                            const match = timeStr.match(timeRegex);
                            if (match) {
                                const duration = parseInt(match[1]);
                                const unit = match[2];
                                let banDuration = 0;
                                switch (unit) {
                                    case "d":
                                        banDuration = duration * 24 * 60 * 60 * 1000;
                                        break;
                                    case "h":
                                        banDuration = duration * 60 * 60 * 1000;
                                        break;
                                    case "m":
                                        banDuration = duration * 60 * 1000;
                                        break;
                                    case "s":
                                        banDuration = duration * 1000;
                                        break;
                                    default:
                                        room.sendAnnouncement("🚫 Formato de tempo inválido. Usa um número seguido de d (Dias), h (Horas), m (Minutos), or s (Segundos)", player.id, 0xFF0000, "bold", 2);
                                        return;
                                }
                                const name = words.slice(3).join(" ");
                                if (name.length > 0) {
                                    const banEndTime = new Date(Date.now() + banDuration);
                                    const banEndTimeFormatted = banEndTime.toISOString().slice(0, 19).replace('T', ' '); // Dar replace da data para um valor readable
                                    const targetPlayer = room.getPlayerList().find((p: Player) => p.name === name);
                                    const conn = targetPlayer && playerConnections.get(targetPlayer.id);
                                    const auth = targetPlayer && playerAuth.get(targetPlayer.id);
                                    // Se o jogador estiver On.
                                    if (targetPlayer) {
                                        // Inserir a informação do ban na database.
                                        const sql = `INSERT INTO bans (name, time, reason, banned_by, conn, auth) VALUES (?, ?, ?, ?, ?, ?)`;
                                        const values = [name, banEndTimeFormatted, reason, player.name, conn, auth];
                                        con.query(sql, values, (err: any, result: any) => {
                                            if (err) throw err;
                                            room.sendAnnouncement(`✅ Ban executado com sucesso!`, player.id, 0x00FF00, "bold");
                                            // Kickar com a razão e o tempo do ban.
                                            if (targetPlayer) {
                                                room.kickPlayer(targetPlayer.id, `🚫 Foste banido pela razão: ${reason} até ${banEndTime}.`);
                                            }
                                        });
                                        // Se não estiver on.
                                    } else {
                                        const sql = `INSERT INTO bans (name, time, reason, banned_by) VALUES (?, ?, ?, ?)`;
                                        const values = [name, banEndTimeFormatted, reason, player.name];
                                        con.query(sql, values, (err: any, result: any) => {
                                            if (err) throw err;
                                            room.sendAnnouncement(`✅ Ban executado com sucesso!`, player.id, 0x00FF00, "bold");
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
            } else if (words[0] === "!mute") {
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values = [player.name];
                con.query(sql, values, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (!loggedInPlayers[player.id] || result[0].superAdmin !== 1) {
                            room.sendAnnouncement("🚫 Não tens autorização para usar este comando!", player.id, 0xFF0000, "bold", 2);
                        } else {
                            if (words.length <= 2 || !words.slice(3).join(" ")) {
                                room.sendAnnouncement("🚫 Faz razão, tempo, e nome (sem vírgulas).", player.id, 0xFF0000, "bold", 2);
                            }
                        }
                    }
                });
                const reason = words[1];
                // Checkar a database por alguém com o mesmo nome da pessoa em questão.
                const sql2 = `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`;
                const values2 = [player.name];
                con.query(sql2, values2, (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length > 0) {
                        if (loggedInPlayers[player.id] && result[0].superAdmin === 1) {
                            const timeStr = words[2];
                            // Usar uma expressão regular para dar match na timestring.
                            const timeRegex = /^(\d+)([a-zA-Z]+)$/;
                            if (!timeStr) {
                                return;
                            }
                            const match = timeStr.match(timeRegex);
                            if (match) {
                                const duration = parseInt(match[1]);
                                const unit = match[2];
                                let muteDuration = 0;
                                switch (unit) {
                                    case "d":
                                        muteDuration = duration * 24 * 60 * 60 * 1000;
                                        break;
                                    case "h":
                                        muteDuration = duration * 60 * 60 * 1000;
                                        break;
                                    case "m":
                                        muteDuration = duration * 60 * 1000;
                                        break;
                                    case "s":
                                        muteDuration = duration * 1000;
                                        break;
                                    default:
                                        room.sendAnnouncement("🚫 Formato de tempo inválido. Usa um número seguido de d (Dias), h (Horas), m (Minutos), or s (Segundos)", player.id, 0xFF0000, "bold", 2);
                                        return;
                                }
                                const name = words.slice(3).join(" ");
                                if (name.length > 0) {
                                    const muteEndTime = new Date(Date.now() + muteDuration);
                                    const muteEndTimeFormatted = muteEndTime.toISOString().slice(0, 19).replace('T', ' '); // Dar replace da data para um valor readable
                                    const targetPlayer = room.getPlayerList().find((p: Player) => p.name === name);
                                    const conn = targetPlayer && playerConnections.get(targetPlayer.id);
                                    const auth = targetPlayer && playerAuth.get(targetPlayer.id);
                                    // Se o jogador estiver On.
                                    if (targetPlayer) {
                                        // Inserir a informação do ban na database.
                                        const sql = `INSERT INTO mutes (name, time, reason, muted_by, conn, auth) VALUES (?, ?, ?, ?, ?, ?)`;
                                        const values = [name, muteEndTimeFormatted, reason, player.name, conn, auth];
                                        con.query(sql, values, (err: any, result: any) => {
                                            if (err) throw err;
                                            room.sendAnnouncement(`✅ Mute executado com sucesso!`, player.id, 0x00FF00, "bold");
                                            isMuted[targetPlayer.id] = true;
                                        });
                                        // Se não estiver on.
                                    } else {
                                        const sql = `INSERT INTO mutes (name, time, reason, muted_by) VALUES (?, ?, ?, ?)`;
                                        const values = [name, muteEndTimeFormatted, reason, player.name];
                                        con.query(sql, values, (err: any, result: any) => {
                                            if (err) throw err;
                                            room.sendAnnouncement(`✅ Mute executado com sucesso!`, player.id, 0x00FF00, "bold");
                                        });
                                    }
                                }

                            }
                        }
                    }
                });
                // Comando ver a previsão atual
            } else if (words[0] === "!prev") {
                // Definir redTeam e blueTeam
                const redTeam = activePlayers.filter((p: { team: number; }) => p.team === 1);
                const blueTeam = activePlayers.filter((p: { team: number; }) => p.team === 2);
                // Jogadores insuficientes para previsão
                if ((redTeam.length === 0 || redTeam.length === 1) && blueTeam.length === 0) {
                    room.sendAnnouncement(`🚫 Não há jogadores suficientes para ser gerada uma previsão.`, player.id, 0xFF0000, "bold", 2);
                }
                // Previsão de vitória
                if (redTeam.length >= 1 && blueTeam.length >= 1) {
                    const team1EloNum = Number(team1Elo);
                    const team2EloNum = Number(team2Elo);
                    const totalElo = team1EloNum + team2EloNum;
                    const team1Chance = (team1EloNum / totalElo) * 100;
                    const team2Chance = (team2EloNum / totalElo) * 100;
                    room.sendAnnouncement(`📊 Previsão de Vitória: 🔴 ${team1Chance.toFixed(2)}% chance de vencer contra 🔵 ${team2Chance.toFixed(2)}% chance de vencer.`, player.id, 0xFFFFFF, "bold");
                }
                // Comando help
            } else if (words[0] === "!help") {
                if (words.length === 1) {
                    const commands = ["!help", "!registo", "!login", "!changepw", "!afk", "!about", "!discord", "!stats", "!rank", "t", "!gk", "!lista", "!streak", "!topstreak", "!sub", "!prev", "#", "!bb"];
                    room.sendAnnouncement(`❓ Comandos: ${commands.join(", ")}`, player.id, 0xFFFFFF, "bold");
                } else {
                    // Exibe explicação de comando
                    const command = words[1];
                    if (commandExplanations.hasOwnProperty(command)) {
                        room.sendAnnouncement(`❓ ${command}: ${commandExplanations[command]}`, player.id, 0xFFFFFF, "bold");
                    } else {
                        room.sendAnnouncement(`🚫 Comando ${command} não encontrado.`, player.id, 0xFF0000, "bold", 2);
                    }
                }
            } else {
                room.sendAnnouncement(`🚫 ${player.name}, comando não existe, usa !help para acederes à lista de comandos disponíveis.`, player.id, 0xFF0000, "bold", 2);
            }
            return false; // Não enviar comandos para o chat geral.
        }

        // Definir a constante para os chats de equipa/staff.
        const words = message.split(" ");
        // Chat Privado
        if (message.startsWith("#")) {
            const player_id = parseInt(message.substring(1), 10);
            const recipient = room.getPlayer(player_id);
            // O usuário está mute
            if (isMuted[player.id] === true) {
                room.sendAnnouncement(`🚫 Não podes falar por mensagem privada pois estás mute.`, player.id, 0xFF0000, "bold", 2); // Enviar aviso.
                return false;
                // Usuário não está logado.
            } else if (!loggedInPlayers[player.id] === true) {
                room.sendAnnouncement(`🚫 ${player.name}, necessitas fazer login para enviares mensagens.`, player.id, 0xFF0000, "bold", 2);
                return false;
                // ID não inserida.
            } else if (!player_id || isNaN(player_id)) {
                room.sendAnnouncement(`🚫 Não foi inserida nenhuma ID, para enviares uma msg privada faz #ID mensagem`, player.id, 0xff0000, "bold", 2);
                return false;
                // ID não está associada a nenhum jogador.
            } else if (!recipient) {
                room.sendAnnouncement(`🚫 A ID inserida não está associada a nenhum jogador!`, player.id, 0xFF0000, "bold", 2);
                return false;
                // Não permitir enviar mensagem a si mesmo.
            } else if (recipient.id === player.id) {
                room.sendAnnouncement("🚫 Não podes enviar mensagens a ti mesmo!", player.id, 0xFF0000, "bold", 2);
                return false;
                // Tudo bate certo, enviar a DM.
            } else if (recipient) {
                const sender = player.name;
                const formatted_message = `[📩 DM de ${sender}]: ${message.substring(message.indexOf(" ") + 1)}`;
                // Mensagem que o jogador que envia recebe
                room.sendAnnouncement(`[✉️ DM Enviada para ${recipient.name}]: ${message.substring(message.indexOf(" ") + 1)}`, player.id, 0xFFFFFF, "bold", 1);
                // Mensagem que o jogador para quem a mensagem foi enviada recebe
                room.sendAnnouncement(formatted_message, recipient.id, 0xFFFFFF, "bold", 2);
                return false;
            }
        }
        // Chat staff
        if (words[0] === ".") {
            if (!loggedInPlayers[player.id] === true) {
                room.sendAnnouncement(`🚫 ${player.name}, necessitas fazer login para enviares mensagens.`, player.id, 0xFF0000, "bold", 2);
                return false;
                // É um staff = sim
            } else if (superadmin[player.id] === 1) {
                // Sacar a mensagem
                const message = words.slice(1).join(" ");
                // Atualizar quem está na staff
                const playersInStaff = room.getPlayerList().filter((p: { id: string | number; }) => superadmin[p.id] === 1 && loggedInPlayers[player.id] === true);
                for (var index = 0; index < playersInStaff.length; index++) {
                    const p = playersInStaff[index];
                    // Enviar a mensagem para todos os usuários da staff.
                    room.sendAnnouncement(`[Chat da Staff] ${player.name}: ${message}`, p.id, 0xFFB515, "bold");
                }
                return false; // Não enviar mensagem normal.
                // Se não for staff.
            } else {
                room.sendAnnouncement("🚫 Não tens permissão para falar neste chat!", player.id, 0xFF0000, "bold", 2);
                return false; // Não enviar mensagem normal.
            }
        }
        // Chat de equipa
        if (words[0] === "t") {
            // Checkar se o usuário está na Equipa 1 ou 2 ou se está mute.
            // O usuário está mute
            if (isMuted[player.id] === true) {
                room.sendAnnouncement(`🚫 Não podes falar no chat de equipa pois estás mute.`, player.id, 0xFF0000, "bold", 2); // Enviar aviso.
                return false; // Não enviar msg.
            } else if (!loggedInPlayers[player.id] === true) {
                room.sendAnnouncement(`🚫 ${player.name}, necessitas fazer login para enviares mensagens.`, player.id, 0xFF0000, "bold", 2);
                return false;
                // Equipa Red
            } else if (player.team === 1) {
                // Sacar a mensagem
                const message = words.slice(1).join(" ");
                // Atualizar quem está na equipa RED
                for (var index = 0; index < room.getPlayerList().filter((p: { team: number; }) => p.team == 1).length; index++)
                    
                    if (player.name === 'Azis') {
                        room.sendAnnouncement(
                            "[Equipa Red] " + Dono + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 1)[index].id,
                            0xE56E56,
                            "bold"
                        );
                    }
                    else if (superadmin[player.id] === 1) {
                        room.sendAnnouncement(
                            "[Equipa Red] " + Admin + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 1)[index].id,
                            0xE56E56,
                            "bold"
                        );
                    }
                    else if (player.name === 'CenourasPT') {
                        room.sendAnnouncement(
                            "[Equipa Red] " + Cenouras + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 1)[index].id,
                            0xE56E56,
                            "bold"
                        );
                    }
                    else {
                        room.sendAnnouncement(
                            "[Equipa Red] " + Membro + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 1)[index].id,
                            0xE56E56,
                            "bold"
                        );
                    }

                // Sistema normal
                //room.sendAnnouncement(`[Equipa Red] ${player.name}: ${message}`, room.getPlayerList().filter((p: { team: number; }) => p.team == 1)[index].id, 0xE56E56, "bold");
                return false; // Não enviar mensagem normal.

                // Equipa Blue
            } else if (player.team === 2) {
                // Sacar a mensagem
                const message = words.slice(1).join(" ");
                // Atualizar quem está na equipa BLUE
                for (var index = 0; index < room.getPlayerList().filter((p: { team: number; }) => p.team == 2).length; index++)

                    if (player.name === 'Azis') {
                        room.sendAnnouncement(
                            "[Equipa Blue] " + Dono + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 2)[index].id,
                            0x5689E5,
                            "bold"
                        );
                    }
                    else if (superadmin[player.id] === 1) {
                        room.sendAnnouncement(
                            "[Equipa Blue] " + Admin + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 2)[index].id,
                            0x5689E5,
                            "bold"
                        );
                    }
                    else if (player.name === 'CenourasPT') {
                        room.sendAnnouncement(
                            "[Equipa Blue] " + Cenouras + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 2)[index].id,
                            0x5689E5,
                            "bold"
                        );
                    }
                    else {
                        room.sendAnnouncement(
                            "[Equipa Blue] " + Membro + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 2)[index].id,
                            0x5689E5,
                            "bold"
                        );
                    }
                // Enviar a mensagem para todos os usuários da equipa do jogador que enviou a mensagem.
                //room.sendAnnouncement(`[Equipa Blue] ${player.name}: ${message}`, room.getPlayerList().filter((p: { team: number; }) => p.team == 2)[index].id, 0x5689E5, "bold");
                return false; // Não enviar mensagem normal.
                // Equipa Spectators
            } else if (player.team === 0) {
                // Sacar a mensagem
                const message = words.slice(1).join(" ");
                // Atualizar quem está na equipa SPECTATORS
                for (var index = 0; index < room.getPlayerList().filter((p: { team: number; }) => p.team == 0).length; index++)

                    if (player.name === 'Azis') {
                        room.sendAnnouncement(
                            "[Equipa Spectators] " + Dono + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 0)[index].id,
                            0xF5F5F5,
                            "bold"
                        );
                    }
                    else if (superadmin[player.id] === 1) {
                        room.sendAnnouncement(
                            "[Equipa Spectators] " + Admin + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 0)[index].id,
                            0xF5F5F5,
                            "bold"
                        );
                    }
                    else if (player.name === 'CenourasPT') {
                        room.sendAnnouncement(
                            "[Equipa Spectators] " + Cenouras + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 0)[index].id,
                            0xF5F5F5,
                            "bold"
                        );
                    }
                    else {
                        room.sendAnnouncement(
                            "[Equipa Spectators] " + Membro + player.name + ": " + message,
                            room.getPlayerList().filter((p: { team: number; }) => p.team == 0)[index].id,
                            0xF5F5F5,
                            "bold"
                        );
                    }
                // Enviar a mensagem para todos os usuários da equipa do jogador que enviou a mensagem.
                //room.sendAnnouncement(`[Equipa Spectators] ${player.name}: ${message}`, room.getPlayerList().filter((p: { team: number; }) => p.team == 0)[index].id, 0xF5F5F5, "bold");
                return false; // Não enviar mensagem normal
            }
        }

        // Checkar se o jogador está logado para enviar msgs.
        if (!loggedInPlayers[player.id] === true) {
            room.sendAnnouncement(`🚫 ${player.name}, necessitas fazer login para enviares mensagens.`, player.id, 0xFF0000, "bold", 2);
        }
        // Tive de fazer desta maneira pq o return false; em cima n tava a funcionar sabe-se lá porque xd, eu sou nabo em typescript, não julguem...
        if (!loggedInPlayers[player.id] === true)
            return false;

        // Checkar se o jogador está mute
        const conn = playerConnections.get(player.id);
        const auth = playerAuth.get(player.id);
        con.query(`SELECT * FROM mutes WHERE name = ? OR conn = ? OR auth = ?`, [player.name, conn, auth], (err: any, result: any) => {
            if (err) throw err;
            if (result.length > 0) {
                for (const mute of result) {
                    // Reduzir tamanho da data.
                    const muteEndTime = new Date(mute.time);
                    const formattedMuteEndTime = muteEndTime.toLocaleDateString('pt-PT', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                    });
                    const now = Date.now();
                    if (now < new Date(muteEndTime).getTime()) {
                        isMuted[player.id] = true
                        room.sendAnnouncement(`🚫 ${player.name}, estás mutado até ${formattedMuteEndTime}, razão: ${result[0].reason}.`, player.id, 0xFF0000, "bold", 2);
                    } else {
                        isMuted[player.id] = false
                        room.sendChat(message);
                    }
                }
            }
        });

        // Se tiver mutado, não enviar mensagem.
        if (!isMuted[player.id] === false)
            return false;

        // Cor do chat.
        if (player.name === 'Azis') {
            room.sendAnnouncement(
                Dono + player.name + ": " + message,
                null,
                DonoColor,
                "bold"
            );
            return false;
        }
        else if (superadmin[player.id] === 1) {
            room.sendAnnouncement(
                Admin + player.name + ": " + message,
                null,
                AdminColor,
                "bold"
            );
            return false;
        }
        else if (player.name === 'CenourasPT') {
            room.sendAnnouncement(
                Cenouras + player.name + ": " + message,
                null,
                MembroColor,
                "normal"
            );
            return false;
        }
        else {
            room.sendAnnouncement(
                Membro + player.name + ": " + message,
                null,
                MembroColor,
                "normal"
            );
            return false;
        }
    }

    //                 Golos, Assists, AutoGolos                //

    interface Goal {
        assist: Player | null;
        scorer: Player | null;
        reset(): void;
        setPlayer(player: Player): void;
    }

    const Goal: Goal = {
        assist: null,
        scorer: null,
        reset: function() {
            this.assist = null;
            this.scorer = null;
        },

        setPlayer: function(player: Player) {
            if (this.scorer === null || this.scorer.id != player.id) {
                this.assist = this.scorer;
                this.scorer = player;
            }
        }
    }

    function pointDistance(p1: { x: number; y: number; }, p2: { x: number; y: number; }) {
        let d1 = p1.x - p2.x;
        let d2 = p1.y - p2.y;
        return Math.sqrt(d1 * d1 + d2 * d2);
    }

    // Criar função do kickOff
    let kickOff = false;
    room.onGameTick = function() {
        // Kickoff check
        const redTeam = activePlayers.filter((p: { team: number; }) => p.team === 1);
        const blueTeam = activePlayers.filter((p: { team: number; }) => p.team === 2);
        if (redTeam.length >= 1 && blueTeam.length >= 1) {
            if (kickOff == false) {
                if (room.getScores().time != 0) {
                    kickOff = true;
                    // Calcular a chance de vitória.
                    const team1EloNum = Number(team1Elo);
                    const team2EloNum = Number(team2Elo);
                    const totalElo = team1EloNum + team2EloNum;
                    const team1Chance = (team1EloNum / totalElo) * 100;
                    const team2Chance = (team2EloNum / totalElo) * 100;
                    room.sendAnnouncement(`📊 Previsão de Vitória: 🔴 ${team1Chance.toFixed(2)}% chance de vencer contra 🔵 ${team2Chance.toFixed(2)}% chance de vencer.`, null, 0xFFFFFF, "bold", 0);
                    if (redTeam.length >= 2 && blueTeam.length >= 2) {
                        gk = isGk();
                        room.sendAnnouncement("🔴 GK: " + gk[0].name + ", 🔵 GK: " + gk[1].name + ", se for necessário trocar faz !gk", null, 0xFFFFFF, "bold", 0);
                    }
                }
            }
        }
        // Kick AFK players
        afkKick();
        // Assists & Golos
        handleAssistsAndGoals();
    }

    function isGk() {
        let players = room.getPlayerList();
        let min = players[0];
        min.position = { x: room.getBallPosition().x }
        let max = min;

        for (let i = 0; i < players.length; i++) {
            if (players[i].position != null) {
                if (min.position.x > players[i].position.x) min = players[i];
                if (max.position.x < players[i].position.x) max = players[i];
            }
        }
        return [min, max]
    }

    function handleAssistsAndGoals() {
        let players = room.getPlayerList();
        let ballPosition = room.getBallPosition();
        let ballRadius = 6.4;
        let playerRadius = 15;
        let triggerDistance = ballRadius + playerRadius + 0.01;
        for (let i = 0; i < players.length; i++) {
            let player = players[i];
            if (player.position == null) continue;
            let distanceToBall = pointDistance(player.position, ballPosition);
            if (distanceToBall < triggerDistance) {
                Goal.setPlayer(player);
            }
        }
    }

    room.onPlayerBallKick = function(player: Player) {
        Goal.setPlayer(player);
    }


    function updatePlayerStatistic(statName: keyof PlayerStatistics[string], playerId: string, value: number) {
        if (!playerStatistics[playerId]) {
            playerStatistics[playerId] = {
                goals: 0,
                assists: 0,
                ag: 0
            }
        }
        playerStatistics[playerId][statName] += value;
    }

    room.onTeamGoal = function(team: any) {
        let OG = Goal.scorer ?.team != team; // OG = true, se houver um auto-golo.
        // Definir ActivePlayers
        activePlayers = room.getPlayerList().filter((p: Player) => {
            return loggedInPlayers[p.id] && !afkStatus[p.id];
        });
        if (activePlayers.length >= 2 && activePlayers.length < 6) {
            // 2v2 | 1v1 | No-Goal.
            var point = [{ "x": 0, "y": 0 }, { "x": 0, "y": 0 }]; // Criado para sacar a velocidade da bola.
            var ballSpeed: number;
            var ballPosition = room.getBallPosition();
            point[1] = point[0];
            point[0] = ballPosition;
            ballSpeed = (pointDistance(point[0], point[1]) * 60 * 60 * 60) / 15000 - 5400;

            if (OG && Goal.scorer !== null) {
                updatePlayerStatistic("ag", Goal.scorer.id.toString(), 1);
                room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um autogolo (${ballSpeed.toPrecision(4).toString()} km/h), que nabo 🤣!`, null, 0x00FF00, "bold");
                console.log(`${Goal.scorer.name}, marcou um autogolo.`);
            } else if (Goal.scorer !== null) {
                updatePlayerStatistic("goals", Goal.scorer.id.toString(), 1);
                if (Goal.assist !== null && Goal.assist.team == team) {
                    updatePlayerStatistic("assists", Goal.assist.id.toString(), 1);
                    room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um golo (${ballSpeed.toPrecision(4).toString()} km/h) com assistência de ${Goal.assist.name}!`, null, 0x00FF00, "bold");
                    console.log(`${Goal.scorer.name}, marcou um golo com assistência de ${Goal.assist.name}.`);
                } else {
                    room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um golo (${ballSpeed.toPrecision(4).toString()} Km/h)!`, null, 0x00FF00, "bold");
                    console.log(`${Goal.scorer.name}, marcou um golo.`);
                }
            }
        } else if (activePlayers.length >= 6) {
            // 3v3
            var point = [{ "x": 0, "y": 0 }, { "x": 0, "y": 0 }]; // Criado para sacar a velocidade da bola.
            var ballSpeed: number;
            var ballPosition = room.getBallPosition();
            point[1] = point[0];
            point[0] = ballPosition;
            ballSpeed = (pointDistance(point[0], point[1]) * 60 * 60 * 60) / 15000 - 8030;

            if (OG && Goal.scorer !== null) {
                updatePlayerStatistic("ag", Goal.scorer.id.toString(), 1);
                room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um autogolo (${ballSpeed.toPrecision(4).toString()} km/h), que nabo 🤣!`, null, 0x00FF00, "bold");
                console.log(`${Goal.scorer.name}, marcou um autogolo.`);
            } else if (Goal.scorer !== null) {
                updatePlayerStatistic("goals", Goal.scorer.id.toString(), 1);
                if (Goal.assist !== null && Goal.assist.team == team) {
                    updatePlayerStatistic("assists", Goal.assist.id.toString(), 1);
                    room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um golo (${ballSpeed.toPrecision(4).toString()} km/h) com assistência de ${Goal.assist.name}!`, null, 0x00FF00, "bold");
                    console.log(`${Goal.scorer.name}, marcou um golo com assistência de ${Goal.assist.name}.`);
                } else {
                    room.sendAnnouncement(`⚽ ${Goal.scorer.name}, marcou um golo (${ballSpeed.toPrecision(4).toString()} Km/h)!`, null, 0x00FF00, "bold");
                    console.log(`${Goal.scorer.name}, marcou um golo.`);
                }
            }
        }
        // Resetar golos
        Goal.reset();
    }

    // Função para resetar estátisticas locais.
    function resetPlayerStatistics() {
        for (const playerId in playerStatistics) {
            playerStatistics[playerId].goals = 0;
            playerStatistics[playerId].assists = 0;
            playerStatistics[playerId].ag = 0;
        }
    }

    //                      Quando o jogo começa                    //

    room.onGameStart = () => {
        // Atividade
        if (player != null) {
            activities[player.id] = Date.now();
        }
        // Definir constantes
        const team1Players = room.getPlayerList().filter((p: any) => p.team === 1);
        const team2Players = room.getPlayerList().filter((p: any) => p.team === 2);
        // Se estiverem 6 jogadores em jogo (3 em cada equipa mandar esta mensagem)
        if (team1Players.length === 3 && team2Players.length === 3) {
            room.sendAnnouncement("📊 Estão 6 jogadores em campo logo o resultado está a contar para as estatísticas!", null, 0x00FF00, "bold", 0);
        }
        // Dar tempo aos jogadores, então colocar uma pausazita :)
        if (activePlayers.length >= 6) {
            room.pauseGame(true);
        }

        // Previsão de Vitória
        if (team1Players.length >= 1 && team2Players.length >= 1) {
            // Sacar o elo de cada jogador da equipa 1 e adicionar à variável.
            for (const player of team1Players) {
                con.query(`SELECT elo FROM players WHERE name = ?`, [player.name], (err: any, result: any) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    team1Elo += result[0].elo;
                });
            }

            // Sacar o elo de cada jogador da equipa 2 e adicionar à variável.
            for (const player of team2Players) {
                con.query(`SELECT elo FROM players WHERE name = ?`, [player.name], (err: any, result: any) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    team2Elo += result[0].elo;
                });
            }
        }
    }

    room.onGameStop = () => {
        // Limpar GK's
        gk = [null, null];
        executed = false;
        // Limpar o kickoff
        kickOff = false;

        const players = room.getPlayerList();
        for (const player of players) {
            handleRanks(player); // Definir avatares.
        }
        // Resetar as estatiscas locais
        resetPlayerStatistics();
        eloPointsWin = 0;
        eloPointsLost = 0;
        team1Elo = 0;
        team2Elo = 0;
    }

    //                                                            //
    //                                                            //
    //                Quando equipa ganha                         //
    //                                                            //
    //                                                            //

    room.onTeamVictory = (scores: any) => {
        // Sacar winningTeam & losingTeam
        trackWinningTeam();
        // Definir ActivePlayers
        activePlayers = room.getPlayerList().filter((p: Player) => {
            return loggedInPlayers[p.id] && !afkStatus[p.id];
        });

        const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
        if (playersOnTeam.length >= 6) { // Número de jogadores necessários nas equipas para contar para as stats.
            distribuirStats(playerStatistics);

            // WinStreak
            con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                if (err) {
                    console.error(err);
                    return;
                }

                if (result.length === 0) {
                    console.error("Tabela streak sem qualquer resultado.");
                    return;
                }
                const games = result[0].games;
                // Comparar streak atual com o recorde.
                if (winstreak > games) {
                    // Dar update da tabela.
                    const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                    const player1 = playersOnTeam1[0].name;
                    const player2 = playersOnTeam1[1].name;
                    const player3 = playersOnTeam1[2].name;
                    const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                    con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                        if (err) {
                            console.error(err);
                        } else if (!TopStreakBatida) {
                            TopStreakBatida = true;
                            room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                            console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                        }
                    });
                }
            });

            if (winningTeam === 1) {
                winstreak++;
            } else if (winningTeam === 2) {
                winstreak = 1;
                TopStreakBatida = false;
            }
        }
        // Terminar jogo.
        room.stopGame();
        // Distribuição de jogadores por equipa
        const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
        const winningTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === winningTeam);
        const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
        const numberOfPlayersToMove = Math.min(losingTeamPlayers.length, spectatorPlayers.length);
        const numberOfPlayersToMove2 = Math.min(winningTeamPlayers.length, losingTeamPlayers.length);
        const numberOfPlayersToMove3 = Math.min(losingTeamPlayers.length, spectatorPlayers.length);

        // Se ganhar a BLUE
        if (playersOnTeam.length >= 2 && winningTeam === 2) {
            for (let w = 0; w < numberOfPlayersToMove2; w++) {
                room.setPlayerTeam(losingTeamPlayers[w].id, winningTeam);
                room.setPlayerTeam(winningTeamPlayers[w].id, losingTeam);
            }
            if (spectatorPlayers.length > 0) {
                for (let i = 0; i < numberOfPlayersToMove3; i++) {
                    if (losingTeamPlayers[i]) {
                        room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                    }
                    if (spectatorPlayers[i]) {
                        room.setPlayerTeam(spectatorPlayers[i].id, 2)
                    }
                }
            }
            // Se ganhar a RED
        } else {
            for (let i = 0; i < numberOfPlayersToMove; i++) {
                if (losingTeamPlayers[i]) {
                    room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                }
                if (spectatorPlayers[i]) {
                    room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                }
            }
        }
        // Iniciar Jogo.
        room.startGame();
    }

    room.onPlayerTeamChange = (player: any) => {
        // Atividade
        if (player != null) {
            activities[player.id] = Date.now();
        }
        // Se mudarem o jogador de equipa e o jogador estiver AFK, volta para os spectators.
        if (player.team === 1 || player.team === 2) {
            if (afkStatus[player.id] === 1) {
                room.setPlayerTeam(player.id, 0);
            }
        }
        // Se o jogador for movido e não tiver login, volta para os spectators.
        if (!loggedInPlayers[player.id] === true) {
            room.setPlayerTeam(player.id, 0);
        }
        // Atualizar esta merda xd
        activePlayers = room.getPlayerList().filter((p: Player) => {
            return loggedInPlayers[p.id] && !afkStatus[p.id];
        });
    }

    //                         Função quando o player saí da room                       //

    room.onPlayerLeave = (player: any, scores: any) => {
        // Checkar a database se o jogador está logado
        const sql = `SELECT * FROM players WHERE name = ?`;
        const values = [player.name];
        con.query(sql, values, (err: any, result: any) => {
            if (err) throw err;

            if (result.length > 0) {
                if (result[0].loggedIn === 1) {
                    activePlayers = room.getPlayerList().filter((p: Player) => {
                        return loggedInPlayers[p.id] && !afkStatus[p.id];
                    });

                    const redTeam = activePlayers.filter((p: { team: number; }) => p.team === 1);
                    const blueTeam = activePlayers.filter((p: { team: number; }) => p.team === 2);
                    if (redTeam.length >= 2 && blueTeam.length >= 2) {
                        // Aplicar o ban
                        if (player.team !== 0) {
                            // Adicionar 1 minuto de ban.
                            const sql = `INSERT INTO bans (name, time, reason, banned_by) VALUES (?, DATE_ADD(NOW(), INTERVAL 1 MINUTE), ?, ?)`;
                            const values = [player.name, "🚫 Abandonaste a meio do jogo (1m)", "Sistema"];
                            con.query(sql, values, (err: any, result: any) => {
                                if (err) {
                                    console.log(err);
                                    throw err;
                                }
                            });
                        }
                    }

                    // Remover jogador da variável local.
                    delete activities[player.id];
                    // Quando um jogador sai tirar o login.
                    const sql = `SELECT game_id FROM players WHERE LOWER(name) = LOWER(?)`;
                    const values = [player.name];
                    con.query(sql, values, (err: any, result: { game_id: any; }[]) => {
                        if (err) throw err;
                        if (result[0] && result[0].game_id === player.id) { // Resolvido o problema do jogo crashar.
                            const sql = `UPDATE players SET game_id = 0, loggedIn = 0 WHERE LOWER(name) = LOWER(?)`;
                            const values = [player.name];
                            con.query(sql, values, (err: any) => {
                                if (err) throw err;
                                console.log(`${player.name} saiu da sala.`);
                            });
                        }
                    });

                    // Limpar player.auth
                    playerAuth.delete(player.id);
                    // Limpar player.conn
                    playerConnections.delete(player.id);
                    // Resetar os valores das variáveis locais. (Não é necessário pois a id é sempre diferente, mas eu gosto de limpar td)
                    afkStatus[player.id] = 0;
                    // Aqui é necessário
                    loggedInPlayers[player.id] = false;

                    // Se o jogador estiver numa equipa.
                    if (player.team === 1 || player.team === 2) {
                        // Definir as variáveis early
                        const remainingPlayer = activePlayers.find((p: { team: number; }) => p.team === 0);
                        const redPlayers = activePlayers.filter((p: { team: number; }) => p.team === 1);
                        const bluePlayers = activePlayers.filter((p: { team: number; }) => p.team === 2);
                        // Saíram todos, então parar o jogo.
                        if (activePlayers.length === 0) {
                            room.stopGame();
                            room.setCustomStadium(NoGoal);
                            // Checkar se só existe um jogador restante.
                        } else if (activePlayers.length === 1) {
                            // Colocar o jogador que resta na equipa vermelha.
                            room.stopGame();
                            room.setPlayerTeam(activePlayers[0].id, 1);
                            room.setCustomStadium(NoGoal);
                            room.startGame();
                            // Checkar se só ficaram 2 jogadores
                        } else if (activePlayers.length === 2) {
                            const maxPlayersPerTeam = 1; // Máximo de jogadores por equipa.
                            // Checkar o jogador que ficou na equipa 0 (Spectators)
                            if (remainingPlayer) {
                                if (redPlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 1);
                                } else if (bluePlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 2);
                                }
                                // Parar o jogo e colocar o jogador na equipa correta.
                                room.stopGame();
                                room.setCustomStadium(Aquecimento);
                                // Começar o jogo novamente.
                                room.startGame();
                            } else {
                                if (redPlayers.length > bluePlayers.length) {
                                    const playerToRemove = redPlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                } else if (bluePlayers.length > redPlayers.length) {
                                    const playerToRemove = bluePlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                }
                            }
                            // 3 jogadores.
                        } else if (activePlayers.length === 3) {
                            const maxPlayersPerTeam = 1; // Máximo de jogadores por equipa.
                            // Checkar o jogador que ficou na equipa 0 (Spectators)
                            if (remainingPlayer) {
                                if (redPlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 1);
                                } else if (bluePlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 2);
                                }
                            } else {
                                if (redPlayers.length > bluePlayers.length) {
                                    const playerToRemove = redPlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                } else if (bluePlayers.length > redPlayers.length) {
                                    const playerToRemove = bluePlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                }
                            }
                        } else if (activePlayers.length === 4) {
                            const maxPlayersPerTeam = 2; // Máximo de jogadores por equipa.
                            // Checkar o jogador que ficou na equipa 0 (Spectators)
                            if (remainingPlayer) {
                                if (redPlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 1);
                                } else if (bluePlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 2);
                                }
                            } else {
                                if (redPlayers.length > bluePlayers.length) {
                                    const playerToRemove = redPlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                } else if (bluePlayers.length > redPlayers.length) {
                                    const playerToRemove = bluePlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                }
                            }
                        } else if (activePlayers.length === 5) {
                            const maxPlayersPerTeam = 2; // Máximo de jogadores por equipa.
                            // Checkar o jogador que ficou na equipa 0 (Spectators)
                            if (remainingPlayer) {
                                if (redPlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 1);
                                } else if (bluePlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 2);
                                }
                            } else {
                                if (redPlayers.length > bluePlayers.length) {
                                    const playerToRemove = redPlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                } else if (bluePlayers.length > redPlayers.length) {
                                    const playerToRemove = bluePlayers[0];
                                    room.setPlayerTeam(playerToRemove.id, 0);
                                }
                            }
                            room.stopGame();
                            room.sendAnnouncement("📊 Estão menos de 6 jogadores em jogo logo o resultado já não conta para as estatísticas!", null, 0x00FF00, "bold");
                            room.setCustomStadium(Aquecimento);
                            room.startGame();
                            // FUNÇÕES DOS JOGOS 3v3
                        } else if (activePlayers.length >= 6) {
                            // Sacar winningTeam & losingTeam
                            trackWinningTeam();

                            if (player.team === 1 && room.getScores().time >= 120 && room.getScores().blue === 2 && room.getScores().red === 0) { // Equipa blue ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const winningTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === winningTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                const numberOfPlayersToMove = Math.min(losingTeamPlayers.length, 3); // Máx 3
                                const numberOfPlayersToMove2 = Math.min(winningTeamPlayers.length, 3); // Máx 3


                                // Mover os vencedores da BLUE para a RED.
                                for (let w = 0; w < numberOfPlayersToMove; w++) {
                                    room.setPlayerTeam(losingTeamPlayers[w].id, winningTeam);
                                }
                                for (let w = 0; w < numberOfPlayersToMove2; w++) {
                                    room.setPlayerTeam(winningTeamPlayers[w].id, losingTeam);
                                }
                                // Tratar da distribuição de jogadores.
                                if (spectatorPlayers.length === 1) {
                                    for (let i = 0; i < 1; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length === 2) {
                                    for (let i = 0; i < 1; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            else if (player.team === 2 && room.getScores().time >= 120 && room.getScores().red === 2 && room.getScores().blue === 0) { // Equipa red ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === 2);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);

                                if (spectatorPlayers.length === 1) {
                                    room.setPlayerTeam(spectatorPlayers[0].id, losingTeam);
                                }
                                else if (spectatorPlayers.length === 2) {
                                    room.setPlayerTeam(losingTeamPlayers[0].id, 0);
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            // Jogo já acabou mas um jogador sai.
                            else if (player.team === 2 && room.getScores().time > 1 && room.getScores().red === 3 && (room.getScores().blue === 0 || room.getScores().blue === 1 || room.getScores().blue === 2)) { // Equipa Red ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);

                                if (spectatorPlayers.length === 1) {
                                    room.setPlayerTeam(spectatorPlayers[0].id, losingTeam);
                                }
                                else if (spectatorPlayers.length === 2) {
                                    room.setPlayerTeam(losingTeamPlayers[0].id, 0);
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            // Equipa Red
                            else if (player.team === 1 && room.getScores().time >= 150 && room.getScores().blue === 2 && room.getScores().red === 1) { // Equipa blue ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const winningTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === winningTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                const numberOfPlayersToMove = Math.min(losingTeamPlayers.length, 3); // Máx 3
                                const numberOfPlayersToMove2 = Math.min(winningTeamPlayers.length, 3); // Máx 3

                                // Se ganhar a BLUE
                                // Mover os vencedores da BLUE para a RED.
                                for (let w = 0; w < numberOfPlayersToMove; w++) {
                                    room.setPlayerTeam(losingTeamPlayers[w].id, winningTeam);
                                }
                                for (let w = 0; w < numberOfPlayersToMove2; w++) {
                                    room.setPlayerTeam(winningTeamPlayers[w].id, losingTeam);
                                }
                                // Tratar da distribuição de jogadores.
                                if (spectatorPlayers.length === 1) {
                                    for (let i = 0; i < 1; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length === 2) {
                                    for (let i = 0; i < 1; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            // Equipa Red
                            else if (player.team === 1 && room.getScores().time > 1 && room.getScores().blue === 3 && (room.getScores().red === 0 || room.getScores().red === 1 || room.getScores().red === 2)) { // Equipa Blue ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const winningTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === winningTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                const numberOfPlayersToMove = Math.min(losingTeamPlayers.length, 3); // Máx 3
                                const numberOfPlayersToMove2 = Math.min(winningTeamPlayers.length, 3); // Máx 3

                                // Se ganhar a BLUE
                                // Mover os vencedores da BLUE para a RED.
                                for (let w = 0; w < numberOfPlayersToMove; w++) {
                                    room.setPlayerTeam(losingTeamPlayers[w].id, winningTeam);
                                }
                                for (let w = 0; w < numberOfPlayersToMove2; w++) {
                                    room.setPlayerTeam(winningTeamPlayers[w].id, losingTeam);
                                }
                                // Tratar da distribuição de jogadores.
                                if (spectatorPlayers.length === 1) {
                                    for (let i = 0; i < 1; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length === 2) {
                                    for (let i = 0; i < 1; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            else if (player.team === 2 && room.getScores().time >= 150 && room.getScores().red === 2 && room.getScores().blue === 1) { // Equipa Red ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);

                                if (spectatorPlayers.length === 1) {
                                    room.setPlayerTeam(spectatorPlayers[0].id, losingTeam);
                                }
                                else if (spectatorPlayers.length === 2) {
                                    room.setPlayerTeam(losingTeamPlayers[0].id, 0);
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            else if (player.team === 1 && room.getScores().time >= 150 && room.getScores().blue === 1 && room.getScores().red === 0) { // Equipa blue ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);

                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });

                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 O recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const winningTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === winningTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);
                                const numberOfPlayersToMove = Math.min(losingTeamPlayers.length, 3); // Máx 3
                                const numberOfPlayersToMove2 = Math.min(winningTeamPlayers.length, 3); // Máx 3

                                // Se ganhar a BLUE
                                // Mover os vencedores da BLUE para a RED.
                                for (let w = 0; w < numberOfPlayersToMove; w++) {
                                    room.setPlayerTeam(losingTeamPlayers[w].id, winningTeam);
                                }
                                for (let w = 0; w < numberOfPlayersToMove2; w++) {
                                    room.setPlayerTeam(winningTeamPlayers[w].id, losingTeam);
                                }
                                // Tratar da distribuição de jogadores.
                                if (spectatorPlayers.length === 1) {
                                    for (let i = 0; i < 1; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length === 2) {
                                    for (let i = 0; i < 1; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, winningTeam)
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            else if (player.team === 2 && room.getScores().time >= 150 && room.getScores().red === 1 && room.getScores().blue === 0) { // Equipa Red ganha
                                // Prejudicar o jogador que saiu.
                                prejudicarJogador(player);
                                // Definir ActivePlayers
                                activePlayers = room.getPlayerList().filter((p: Player) => {
                                    return loggedInPlayers[p.id] && !afkStatus[p.id];
                                });
                                const playersOnTeam = activePlayers.filter((p: { team: number; }) => p.team === 1 || p.team === 2);
                                if (playersOnTeam.length >= 5) { // Número de jogadores necessários nas equipas para contar para as stats.
                                    distribuirStats(playerStatistics);

                                    // WinStreak
                                    con.query('SELECT games FROM streak', (err: any, result: string | any[]) => {
                                        if (err) {
                                            console.error(err);
                                            return;
                                        }
                                        if (result.length === 0) {
                                            console.error("Tabela streak sem qualquer resultado.");
                                            return;
                                        }
                                        const games = result[0].games;
                                        // Comparar streak atual com o recorde.
                                        if (winstreak > games) {
                                            // Dar update da tabela.
                                            const playersOnTeam1 = activePlayers.filter((p: { team: number; }) => p.team === 1);
                                            const player1 = playersOnTeam1[0].name;
                                            const player2 = playersOnTeam1[1].name;
                                            const player3 = playersOnTeam1[2].name;
                                            const sql = `UPDATE streak SET games = ?, player1 = ?, player2 = ?, player3 = ?`;
                                            con.query(sql, [winstreak, player1, player2, player3], (err: any, result: any) => {
                                                if (err) {
                                                    console.error(err);
                                                } else if (!TopStreakBatida) {
                                                    TopStreakBatida = true;
                                                    room.sendAnnouncement(`🏆 A recorde de win streak da sala foi batido! Parabéns à equipa 🔴!`, null, 0x00FF00, "bold", 0);
                                                    console.log("Um novo recorde foi batido, tabela Streak atualizada.");
                                                }
                                            });
                                        }
                                    });

                                    if (winningTeam === 1) {
                                        winstreak++;
                                    } else if (winningTeam === 2) {
                                        winstreak = 1;
                                        TopStreakBatida = false;
                                    }
                                }
                                room.stopGame();
                                // Distribuição de jogadores por equipa
                                const losingTeamPlayers = activePlayers.filter((p: { team: number; }) => p.team === losingTeam);
                                const spectatorPlayers = activePlayers.filter((p: { team: number; }) => p.team === 0);

                                if (spectatorPlayers.length === 1) {
                                    room.setPlayerTeam(spectatorPlayers[0].id, losingTeam);
                                }
                                else if (spectatorPlayers.length === 2) {
                                    room.setPlayerTeam(losingTeamPlayers[0].id, 0);
                                    for (let i = 0; i < 2; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                else if (spectatorPlayers.length >= 3) {
                                    for (let i = 0; i < 2; i++) {
                                        if (losingTeamPlayers[i]) {
                                            room.setPlayerTeam(losingTeamPlayers[i].id, 0);
                                        }
                                    }
                                    for (let i = 0; i < 3; i++) {
                                        if (spectatorPlayers[i]) {
                                            room.setPlayerTeam(spectatorPlayers[i].id, losingTeam);
                                        }
                                    }
                                }
                                room.startGame();
                            }
                            // Checkar o jogador que ficou na equipa 0 (Spectators)
                            else if (remainingPlayer) {
                                const maxPlayersPerTeam = 3; // Máximo de jogadores por equipa.
                                if (redPlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 1);
                                } else if (bluePlayers.length < maxPlayersPerTeam) {
                                    room.setPlayerTeam(remainingPlayer.id, 2);
                                }
                            }
                        }
                    }
                }
            }
        });
    }
});

// Créditos: Azis. 2023. Nos tempos livres, of course xd. NÃO DORMI CARALHO! O código pode estar desorganizado, mas funciona, e se funciona, não vamos reclamar! - Sun Tzu