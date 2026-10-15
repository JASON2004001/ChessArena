import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { io } from 'socket.io-client';
import { 
  RotateCcw, 
  Undo2, 
  Lightbulb, 
  Bot, 
  Users, 
  ArrowLeft, 
  Loader2, 
  Swords, 
  ChevronLeft, 
  Gauge, 
  Sparkles, 
  Trophy, 
  Frown, 
  TrendingUp, 
  Menu,
  User,
  LogIn,
  Lock,
  Clock,
  LogOut,
  Hourglass,
  Flag
} from 'lucide-react';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://chessarena-backend-wx0w.onrender.com').replace(/\/+$/, '');

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

export default function App() {
  const [game, setGame] = useState(new Chess());
  const [mode, setMode] = useState('menu'); // 'menu' | 'level_select' | 'bot' | 'multiplayer'
  const [playerColor, setPlayerColor] = useState('w');
  const [botLevel, setBotLevel] = useState(1);
  const [gameStatus, setGameStatus] = useState('White to move');

  // Auth State
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('chess_username') || '');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Clocks
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);

  // Selection & Highlight
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [isImmobile, setIsImmobile] = useState(false);
  const [lastMoveSquares, setLastMoveSquares] = useState({});
  const [hintSquares, setHintSquares] = useState({});
  const [hintCount, setHintCount] = useState(10);

  // Promotion Modal
  const [pendingPromotion, setPendingPromotion] = useState(null);

  // End match popup modal
  const [endGameModal, setEndGameModal] = useState(null);

  // Bot History Stack
  const [gameHistoryStack, setGameHistoryStack] = useState([]);

  // Multiplayer State
  const [isSearching, setIsSearching] = useState(false);
  const [noPlayerFound, setNoPlayerFound] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  
  const roomIdRef = useRef(null);
  const playerColorRef = useRef('w');
  const gameRef = useRef(new Chess());
  const socketRef = useRef(null);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('match_found', ({ roomId, color, opponentName, initialTimer }) => {
      clearTimeout(searchTimerRef.current);
      setIsSearching(false);
      setNoPlayerFound(false);
      roomIdRef.current = roomId;
      setPlayerColor(color);
      playerColorRef.current = color;
      setOpponentName(opponentName);
      setWhiteTime(initialTimer || 600);
      setBlackTime(initialTimer || 600);
      setMode('multiplayer');

      const freshGame = new Chess();
      gameRef.current = freshGame;
      setGame(freshGame);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setLastMoveSquares({});
      setHintSquares({});
      setPendingPromotion(null);
      setEndGameModal(null);
      setGameStatus(color === 'w' ? 'Match started! Your turn (White)' : 'Match started! Opponent turn (White)');
    });

    socket.on('clock_tick', ({ whiteTimer, blackTimer }) => {
      setWhiteTime(whiteTimer);
      setBlackTime(blackTimer);
    });

    // TIMEOUT POPUP
    socket.on('time_out', ({ loserColor }) => {
      const isWinner = playerColorRef.current !== loserColor;
      setEndGameModal({
        type: 'timeout',
        isWinner,
        title: isWinner ? 'you won because your opponent fail to make move' : 'Sorry time out you loose',
        subtitle: isWinner 
          ? 'Opponent clock reached 0:00.' 
          : 'Your time ran out before making a move.'
      });
    });

    // CHECKMATE POPUP
    socket.on('checkmate_declared', ({ loserColor }) => {
      const isWinner = playerColorRef.current !== loserColor;
      setEndGameModal({
        type: 'checkmate',
        isWinner,
        title: isWinner ? 'congratulation you won' : 'Sorry you lost',
        subtitle: isWinner ? 'Checkmate delivered!' : 'You were checkmated.'
      });
    });

    // FORFEIT POPUP
    socket.on('player_forfeited', ({ youForfeited }) => {
      setEndGameModal({
        type: 'forfeit',
        isWinner: !youForfeited,
        title: youForfeited ? 'Sorry you lost' : 'congratulation you won',
        subtitle: youForfeited ? 'You forfeited the match.' : 'Opponent forfeited the match.'
      });
    });

    // OPPONENT LEFT POPUP
    socket.on('opponent_left', () => {
      setEndGameModal({
        type: 'opponent_left',
        isWinner: true,
        title: 'your opponent left the game you won',
        subtitle: 'The opponent has left the match.'
      });
    });

    // OPPONENT MOVE RECEIVER
    socket.on('opponent_move', (move) => {
      setGame((prevGame) => {
        const nextGame = new Chess(prevGame.fen());
        try {
          const moveRes = nextGame.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || 'q'
          });

          if (moveRes) {
            gameRef.current = nextGame;
            setLastMoveSquares({
              [moveRes.from]: { backgroundColor: 'rgba(234, 179, 8, 0.45)', border: '3px solid #eab308' },
              [moveRes.to]: { backgroundColor: 'rgba(234, 179, 8, 0.45)', border: '3px solid #eab308' }
            });

            if (nextGame.isCheckmate()) {
              const loser = nextGame.turn();
              socketRef.current.emit('game_over_checkmate', { loserColor: loser });
            } else {
              updateTurnStatus(nextGame);
            }
          }
        } catch (err) {
          console.error('Invalid move received:', err);
        }
        return nextGame;
      });
    });

    return () => socket.disconnect();
  }, []);

  const updateTurnStatus = (currentGame) => {
    if (currentGame.isCheckmate()) {
      const winner = currentGame.turn() === 'w' ? 'Black' : 'White';
      setGameStatus(`Checkmate! ${winner} wins! 🏆`);
    } else if (currentGame.isDraw()) {
      setGameStatus('Draw / Stalemate!');
    } else {
      const turnName = currentGame.turn() === 'w' ? 'White' : 'Black';
      const checkText = currentGame.inCheck() ? ' - CHECK!' : '';
      setGameStatus(`${turnName} to move${checkText}`);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Bot Engine
  const evaluateBoardForBot = (chessInstance, botColor) => {
    if (chessInstance.isCheckmate()) {
      return chessInstance.turn() === botColor ? -999999 : 999999;
    }
    if (chessInstance.isDraw()) return -500;

    let score = 0;
    const board = chessInstance.board();
    const opponentColor = botColor === 'w' ? 'b' : 'w';
    let enemyKingPos = null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          let val = PIECE_VALUES[piece.type] || 0;
          if (piece.type === 'p') {
            const progress = piece.color === 'w' ? 7 - r : r;
            val += progress * 40;
          }
          if (piece.color === opponentColor && piece.type === 'k') {
            enemyKingPos = { r, c };
          }
          score += piece.color === botColor ? val : -val;
        }
      }
    }

    if (chessInstance.inCheck() && chessInstance.turn() === opponentColor) {
      score += 150;
    }

    if (enemyKingPos) {
      const distFromCenter = Math.abs(3.5 - enemyKingPos.r) + Math.abs(3.5 - enemyKingPos.c);
      score += distFromCenter * 30;
    }

    return score;
  };

  const makeBotMove = (currentGame, currentLevel = botLevel) => {
    if (currentGame.isGameOver()) return;

    const moves = currentGame.moves({ verbose: true });
    if (moves.length === 0) return;

    const botColor = currentGame.turn();

    const instantCheckmate = moves.find((m) => {
      const clone = new Chess(currentGame.fen());
      clone.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      return clone.isCheckmate();
    });

    if (instantCheckmate) {
      executeBotMove(currentGame, instantCheckmate);
      return;
    }

    const promotionMove = moves.find((m) => m.promotion);
    if (promotionMove) {
      executeBotMove(currentGame, { ...promotionMove, promotion: 'q' });
      return;
    }

    let chosenMove = null;

    if (currentLevel <= 3) {
      const captures = moves.filter((m) => m.captured);
      chosenMove = (currentLevel > 1 && captures.length > 0 && Math.random() < 0.5)
        ? captures[Math.floor(Math.random() * captures.length)]
        : moves[Math.floor(Math.random() * moves.length)];
    } else if (currentLevel <= 6) {
      const checks = moves.filter((m) => m.san.includes('+'));
      const captures = moves.filter((m) => m.captured);
      const pool = checks.length > 0 ? checks : captures.length > 0 ? captures : moves;
      chosenMove = pool[Math.floor(Math.random() * pool.length)];
    } else {
      let bestEvaluation = -Infinity;

      for (const m of moves) {
        const sim1 = new Chess(currentGame.fen());
        sim1.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });

        if (sim1.isCheckmate()) {
          chosenMove = m;
          break;
        }

        const opponentReplies = sim1.moves({ verbose: true });
        let worstOpponentOutcome = Infinity;

        if (opponentReplies.length === 0) {
          worstOpponentOutcome = evaluateBoardForBot(sim1, botColor);
        } else {
          for (const oppMove of opponentReplies) {
            const sim2 = new Chess(sim1.fen());
            sim2.move({ from: oppMove.from, to: oppMove.to, promotion: oppMove.promotion || 'q' });
            const score = evaluateBoardForBot(sim2, botColor);
            if (score < worstOpponentOutcome) {
              worstOpponentOutcome = score;
            }
          }
        }

        if (worstOpponentOutcome > bestEvaluation) {
          bestEvaluation = worstOpponentOutcome;
          chosenMove = m;
        }
      }

      if (!chosenMove) chosenMove = moves[0];
    }

    executeBotMove(currentGame, chosenMove);
  };

  const executeBotMove = (currentGame, move) => {
    setTimeout(() => {
      const nextGame = new Chess(currentGame.fen());
      const result = nextGame.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q'
      });

      if (result) {
        gameRef.current = nextGame;
        setGame(nextGame);
        setGameHistoryStack((prev) => [...prev, nextGame.fen()]);
        setLastMoveSquares({
          [result.from]: { backgroundColor: 'rgba(234, 179, 8, 0.45)', border: '3px solid #eab308' },
          [result.to]: { backgroundColor: 'rgba(234, 179, 8, 0.45)', border: '3px solid #eab308' }
        });

        if (nextGame.isCheckmate()) {
          const isPlayerWinner = nextGame.turn() !== playerColorRef.current;
          setEndGameModal({
            type: 'checkmate',
            isWinner: isPlayerWinner,
            title: isPlayerWinner ? 'congratulation you won' : 'Sorry you lost',
            subtitle: isPlayerWinner ? 'congratulation u won can restart or increase level now' : 'Please try again'
          });
        } else {
          updateTurnStatus(nextGame);
        }
      }
    }, 400);
  };

  const handleStartBotGame = (selectedLvl) => {
    setBotLevel(selectedLvl);
    const freshGame = new Chess();
    gameRef.current = freshGame;
    setGame(freshGame);
    setGameHistoryStack([freshGame.fen()]);
    setMode('bot');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMoveSquares({});
    setHintSquares({});
    setPendingPromotion(null);
    setEndGameModal(null);
    setHintCount(10);
    updateTurnStatus(freshGame);

    if (playerColor === 'b') {
      makeBotMove(freshGame, selectedLvl);
    }
  };

  const isPromotionMove = (from, to) => {
    const piece = game.get(from);
    if (!piece || piece.type !== 'p') return false;
    if (piece.color === 'w' && to[1] === '8') return true;
    if (piece.color === 'b' && to[1] === '1') return true;
    return false;
  };

  const completeMove = (from, to, promotionPiece = 'q') => {
    try {
      const nextGame = new Chess(game.fen());
      const movePayload = {
        from,
        to,
        promotion: promotionPiece
      };

      const move = nextGame.move(movePayload);
      if (!move) return false;

      gameRef.current = nextGame;
      setGame(nextGame);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setIsImmobile(false);
      setHintSquares({});
      setPendingPromotion(null);

      if (mode === 'bot') {
        setGameHistoryStack((prev) => [...prev, nextGame.fen()]);
        setLastMoveSquares({
          [move.from]: { backgroundColor: 'rgba(34, 197, 94, 0.35)', border: '2px solid #22c55e' },
          [move.to]: { backgroundColor: 'rgba(34, 197, 94, 0.35)', border: '2px solid #22c55e' }
        });

        if (nextGame.isCheckmate()) {
          const isPlayerWinner = nextGame.turn() !== playerColorRef.current;
          setEndGameModal({
            type: 'checkmate',
            isWinner: isPlayerWinner,
            title: isPlayerWinner ? 'congratulation you won' : 'Sorry you lost',
            subtitle: isPlayerWinner ? 'congratulation u won can restart or increase level now' : 'Please try again'
          });
        } else {
          updateTurnStatus(nextGame);
          makeBotMove(nextGame);
        }
      } else if (mode === 'multiplayer') {
        setLastMoveSquares({
          [move.from]: { backgroundColor: 'rgba(59, 130, 246, 0.35)', border: '2px solid #3b82f6' },
          [move.to]: { backgroundColor: 'rgba(59, 130, 246, 0.35)', border: '2px solid #3b82f6' }
        });

        socketRef.current.emit('make_move', {
          roomId: roomIdRef.current,
          move: { from, to, promotion: promotionPiece }
        });

        if (nextGame.isCheckmate()) {
          const loser = nextGame.turn();
          socketRef.current.emit('game_over_checkmate', { loserColor: loser });
        } else {
          updateTurnStatus(nextGame);
        }
      }

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleSquareClick = (square) => {
    if (mode === 'menu' || mode === 'level_select' || game.isGameOver() || pendingPromotion || endGameModal) return;
    if (game.turn() !== playerColor) return;

    const targetMove = possibleMoves.find((m) => m.square === square);
    if (selectedSquare && targetMove) {
      if (isPromotionMove(selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      completeMove(selectedSquare, square);
      return;
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) {
      const legalMovesVerbose = game.moves({ square, verbose: true });
      const moveTargets = legalMovesVerbose.map((m) => ({
        square: m.to,
        isCapture: Boolean(m.captured) || m.flags.includes('e')
      }));

      setSelectedSquare(square);
      setPossibleMoves(moveTargets);
      setIsImmobile(moveTargets.length === 0);
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
      setIsImmobile(false);
    }
  };

  const handlePieceDrop = (sourceSquare, targetSquare) => {
    if (mode === 'menu' || mode === 'level_select' || game.isGameOver() || pendingPromotion || endGameModal) return false;
    if (game.turn() !== playerColor) return false;

    if (isPromotionMove(sourceSquare, targetSquare)) {
      const legalTargets = game.moves({ square: sourceSquare, verbose: true }).map((m) => m.to);
      if (legalTargets.includes(targetSquare)) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return true;
      }
      return false;
    }

    return completeMove(sourceSquare, targetSquare);
  };

  const handleForfeit = () => {
    if (mode !== 'multiplayer') return;
    if (window.confirm("Are you sure you want to forfeit this match?")) {
      socketRef.current.emit('forfeit_match');
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = isLoginTab ? '/api/login' : '/api/register';
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        setAuthLoading(false);
        return;
      }

      localStorage.setItem('chess_username', data.username);
      setCurrentUser(data.username);
      setShowAuthModal(false);
      setAuthUsername('');
      setAuthPassword('');
      setAuthLoading(false);

      startMatchmaking(data.username);
    } catch (err) {
      setAuthError('Cannot connect to database backend');
      setAuthLoading(false);
    }
  };

  const startMatchmaking = (username) => {
    setIsSearching(true);
    setNoPlayerFound(false);
    socketRef.current.emit('find_match', { username });

    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
      setNoPlayerFound(true);
      socketRef.current.emit('cancel_search');
    }, 15000);
  };

  // Exit / Menu Reset: notifies backend if in multiplayer
  const resetToMenu = () => {
    clearTimeout(searchTimerRef.current);
    setIsSearching(false);
    setNoPlayerFound(false);

    if (mode === 'multiplayer' && socketRef.current) {
      socketRef.current.emit('leave_game');
    }

    setMode('menu');
    roomIdRef.current = null;
    const fresh = new Chess();
    gameRef.current = fresh;
    setGame(fresh);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMoveSquares({});
    setHintSquares({});
    setPendingPromotion(null);
    setEndGameModal(null);
    setGameStatus('White to move');
  };

  const customSquareStyles = {
    ...lastMoveSquares,
    ...hintSquares,
    ...(selectedSquare
      ? {
          [selectedSquare]: {
            backgroundColor: isImmobile
              ? 'rgba(239, 68, 68, 0.55)'
              : 'rgba(74, 222, 128, 0.55)',
            border: isImmobile ? '3px solid #ef4444' : '3px solid #22c55e',
          },
        }
      : {}),
    ...possibleMoves.reduce((acc, moveObj) => {
      if (moveObj.isCapture) {
        acc[moveObj.square] = {
          background: 'radial-gradient(circle, transparent 60%, rgba(34, 197, 94, 0.9) 62%, rgba(34, 197, 94, 0.9) 78%, transparent 80%)',
          borderRadius: '50%',
          cursor: 'pointer',
        };
      } else {
        acc[moveObj.square] = {
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.9) 24%, transparent 26%)',
          borderRadius: '50%',
          cursor: 'pointer',
        };
      }
      return acc;
    }, {}),
  };

  return (
    <div className="min-h-screen bg-radial from-[#0d3b36] via-[#082320] to-[#041110] text-slate-100 flex flex-col justify-between selection:bg-amber-500 relative touch-manipulation">
      
      {/* Header */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between border-b border-emerald-950/40 bg-black/25 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center shadow font-black text-lg sm:text-xl text-amber-100 border border-amber-400/40 shrink-0">
            ♟
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-black tracking-wide text-amber-200 truncate">ChessArena</h1>
            {(mode === 'bot' || mode === 'multiplayer') && (
              <p className="text-[10px] sm:text-xs text-emerald-400 font-semibold truncate max-w-[140px] sm:max-w-none">{gameStatus}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {currentUser ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 bg-emerald-950/60 border border-emerald-800/60 rounded-full text-[10px] sm:text-xs text-amber-300 font-bold max-w-[100px] sm:max-w-[150px] truncate">
                <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="truncate">{currentUser}</span>
              </div>
              <button 
                onClick={() => { localStorage.removeItem('chess_username'); setCurrentUser(''); }}
                className="p-1 sm:p-1.5 rounded-xl border border-rose-900/50 bg-rose-950/30 text-rose-400 hover:bg-rose-900/50 transition"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </button>
          )}

          {mode !== 'menu' && (
            <button
              onClick={resetToMenu}
              className="flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs font-bold px-2 sm:px-3 py-1 rounded-xl border border-emerald-700/50 bg-emerald-950/40 hover:bg-emerald-900/60 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Exit
            </button>
          )}
        </div>
      </header>

      {/* Main Board Stage */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-6 flex flex-col items-center justify-center">
        
        {/* START MENU */}
        {mode === 'menu' && (
          <div className="w-full max-w-sm sm:max-w-md space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#051c18]/90 border border-[#0d4a3e] p-4 sm:p-6 rounded-2xl shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs sm:text-sm mb-3 sm:mb-4">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                <span>Play vs Computer</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => { setPlayerColor('w'); setMode('level_select'); }}
                  className="py-2.5 sm:py-3 px-3 bg-emerald-950/40 hover:bg-emerald-900/50 text-white font-bold text-xs rounded-xl sm:rounded-2xl border border-emerald-700/60 hover:border-emerald-500 transition shadow-sm flex items-center justify-center gap-1.5 sm:gap-2"
                >
                  <span>Play White</span>
                  <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white shadow-inner inline-block"></span>
                </button>
                <button
                  onClick={() => { setPlayerColor('b'); setMode('level_select'); }}
                  className="py-2.5 sm:py-3 px-3 bg-emerald-950/40 hover:bg-emerald-900/50 text-white font-bold text-xs rounded-xl sm:rounded-2xl border border-emerald-700/60 hover:border-emerald-500 transition shadow-sm flex items-center justify-center gap-1.5 sm:gap-2"
                >
                  <span>Play Black</span>
                  <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-slate-800 border border-slate-600 shadow-inner inline-block"></span>
                </button>
              </div>
            </div>

            <div className="bg-[#051c18]/90 border border-[#0d4a3e] p-4 sm:p-6 rounded-2xl shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs sm:text-sm mb-3 sm:mb-4">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                <span>Online Multiplayer</span>
              </div>

              {!isSearching ? (
                <button
                  onClick={() => {
                    if (!currentUser) setShowAuthModal(true);
                    else startMatchmaking(currentUser);
                  }}
                  className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-[#d95b00] to-[#c24e00] hover:from-[#e86504] hover:to-[#cf5402] text-white font-black text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-[0_8px_20px_rgba(217,91,0,0.35)] transition flex items-center justify-center gap-2 border border-amber-500/40 cursor-pointer active:scale-98"
                >
                  <Swords className="w-4 h-4" /> FIND OPPONENT
                </button>
              ) : (
                <div className="p-3 sm:p-4 bg-emerald-950/60 border border-emerald-500/30 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
                  <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                  <span className="text-xs font-bold text-emerald-200">Searching for available player...</span>
                  <button
                    onClick={() => {
                      clearTimeout(searchTimerRef.current);
                      setIsSearching(false);
                      socketRef.current.emit('cancel_search');
                    }}
                    className="text-[11px] text-red-400 hover:underline font-semibold"
                  >
                    Cancel Search
                  </button>
                </div>
              )}

              {noPlayerFound && (
                <div className="mt-3 sm:mt-4 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-center space-y-1">
                  <p className="text-xs text-red-300 font-bold">
                    The no other player are that available that this time
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Try playing against the computer or search again!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DIFFICULTY SELECTOR */}
        {mode === 'level_select' && (
          <div className="w-full max-w-sm sm:max-w-md bg-[#051c18]/95 border border-[#0d4a3e] p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMode('menu')}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-bold transition"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <span className="text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 text-amber-300">
                Playing as {playerColor === 'w' ? 'White ⚪' : 'Black ⚫'}
              </span>
            </div>

            <div className="text-center mb-4">
              <h2 className="text-base sm:text-lg font-black text-amber-300 flex items-center justify-center gap-1.5">
                <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> Select Difficulty Level
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 max-h-[50vh] sm:max-h-[340px] overflow-y-auto pr-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => handleStartBotGame(lvl)}
                  className="p-2.5 sm:p-3 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 hover:border-amber-400/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition hover:scale-[1.02] active:scale-95 group shadow-sm"
                >
                  <span className="text-xs sm:text-sm font-black text-white group-hover:text-amber-300">
                    Level {lvl}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE GAME VIEW */}
        {(mode === 'bot' || mode === 'multiplayer') && (
          <div className="flex flex-col items-center w-full animate-in fade-in duration-300 max-h-[calc(100vh-80px)] justify-center">
            
            {/* MULTIPLAYER CLOCKS BAR */}
            {mode === 'multiplayer' && (
              <div className="w-full max-w-[min(92vw,500px,68vh)] flex items-center justify-between mb-2 sm:mb-3 px-1 gap-2">
                {/* Black Clock */}
                <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border backdrop-blur-md transition ${
                  game.turn() === 'b' 
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.25)]' 
                    : 'bg-black/40 border-slate-800 text-slate-400'
                }`}>
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <div className="flex flex-col leading-none">
                    <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider truncate max-w-[70px] sm:max-w-[100px]">
                      {playerColor === 'b' ? `${currentUser} (You)` : opponentName}
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono mt-0.5">{formatTimer(blackTime)}</span>
                  </div>
                </div>

                {/* Forfeit Match Button */}
                <button
                  onClick={handleForfeit}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-rose-900/60 bg-rose-950/40 hover:bg-rose-900/70 text-rose-400 text-[10px] sm:text-xs font-bold transition shadow shrink-0 active:scale-95"
                  title="Surrender this match"
                >
                  <Flag className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Forfeit
                </button>

                {/* White Clock */}
                <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border backdrop-blur-md transition ${
                  game.turn() === 'w' 
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.25)]' 
                    : 'bg-black/40 border-slate-800 text-slate-400'
                }`}>
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <div className="flex flex-col leading-none">
                    <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider truncate max-w-[70px] sm:max-w-[100px]">
                      {playerColor === 'w' ? `${currentUser} (You)` : opponentName}
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono mt-0.5">{formatTimer(whiteTime)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Responsive Board Container */}
            <div 
              style={{
                width: 'min(92vw, 500px, 62vh)',
                height: 'min(92vw, 500px, 62vh)'
              }}
              className="aspect-square rounded-2xl p-2 sm:p-3 bg-gradient-to-b from-[#4d2816] via-[#351a0d] to-[#241107] shadow-[0_15px_40px_rgba(0,0,0,0.85)] border-2 sm:border-4 border-[#5d321d] flex items-center justify-center shrink-0"
            >
              <div className="w-full h-full rounded-lg overflow-hidden shadow-inner">
                <Chessboard
                  position={game.fen()}
                  onPieceDrop={handlePieceDrop}
                  onSquareClick={handleSquareClick}
                  boardOrientation={playerColor === 'b' ? 'black' : 'white'}
                  customSquareStyles={customSquareStyles}
                  customDarkSquareStyle={{ backgroundColor: '#181b1f' }}
                  customLightSquareStyle={{ backgroundColor: '#f1ede4' }}
                  animationDuration={200}
                />
              </div>
            </div>

            {/* Bottom Controls for Bot Mode */}
            {mode === 'bot' && (
              <div className="mt-3 sm:mt-6 flex items-center justify-center gap-6 sm:gap-14">
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => handleStartBotGame(botLevel)}
                    className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-[#d97724] via-[#8f4a18] to-[#452006] border-2 border-[#fbbf24] shadow-[0_6px_20px_rgba(217,119,36,0.45)] flex items-center justify-center text-amber-100 hover:scale-105 active:scale-95 transition"
                  >
                    <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7" />
                  </button>
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-300 mt-1.5">Restart</span>
                </div>

                <div className="flex flex-col items-center">
                  <button
                    onClick={() => {
                      if (gameHistoryStack.length <= 2) return;
                      const updated = [...gameHistoryStack];
                      updated.pop();
                      updated.pop();
                      const rev = new Chess(updated[updated.length - 1]);
                      gameRef.current = rev;
                      setGame(rev);
                      setGameHistoryStack(updated);
                      setSelectedSquare(null);
                      setPossibleMoves([]);
                      setLastMoveSquares({});
                      setHintSquares({});
                      updateTurnStatus(rev);
                    }}
                    disabled={gameHistoryStack.length <= 2}
                    className={`w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition border-2 ${
                      gameHistoryStack.length > 2
                        ? 'bg-gradient-to-b from-[#d97724] via-[#8f4a18] to-[#452006] border-[#fbbf24] text-amber-100 shadow-[0_6px_20px_rgba(217,119,36,0.45)] hover:scale-105 active:scale-95 cursor-pointer'
                        : 'bg-gradient-to-b from-[#784318] to-[#3a1d08] border-[#a16207]/60 text-amber-300/40 opacity-60 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <Undo2 className="w-6 h-6 sm:w-7 sm:h-7" />
                  </button>
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-300 mt-1.5">Undo</span>
                </div>

                <div className="flex flex-col items-center relative">
                  <button
                    onClick={() => {
                      if (game.turn() !== playerColor || game.isGameOver() || hintCount <= 0) return;
                      const legal = game.moves({ verbose: true });
                      if (legal.length === 0) return;
                      const best = legal.find((m) => m.captured) || legal[0];
                      setHintSquares({
                        [best.from]: { backgroundColor: 'rgba(6, 182, 212, 0.45)', border: '3px dashed #06b6d4' },
                        [best.to]: { backgroundColor: 'rgba(6, 182, 212, 0.45)', border: '3px solid #06b6d4' }
                      });
                      setHintCount((c) => c - 1);
                    }}
                    className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-[#d97724] via-[#8f4a18] to-[#452006] border-2 border-[#fbbf24] shadow-[0_6px_20px_rgba(217,119,36,0.45)] flex items-center justify-center text-amber-100 hover:scale-105 active:scale-95 transition relative"
                  >
                    <Lightbulb className="w-6 h-6 sm:w-7 sm:h-7" />
                    {hintCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white font-black text-[9px] sm:text-[11px] px-1.5 py-0.5 rounded-full border border-[#452006]">
                        {hintCount}
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-300 mt-1.5">Hint</span>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* AUTHENTICATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-[340px] sm:max-w-sm bg-gradient-to-b from-[#0a2f2a] via-[#051c18] to-[#020d0b] border-2 border-amber-400/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-center flex flex-col items-center">
            <div className="flex border-b border-emerald-800/80 w-full mb-4 sm:mb-5">
              <button
                type="button"
                onClick={() => { setIsLoginTab(true); setAuthError(''); }}
                className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider transition ${
                  isLoginTab ? 'text-amber-300 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsLoginTab(false); setAuthError(''); }}
                className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider transition ${
                  !isLoginTab ? 'text-amber-300 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            <h3 className="text-base sm:text-lg font-black text-amber-200 tracking-wide mb-1">
              {isLoginTab ? 'Welcome Back!' : 'Create Account'}
            </h3>

            {authError && (
              <div className="w-full p-2 mb-2 sm:mb-3 bg-red-950/60 border border-red-500/60 rounded-xl text-red-300 text-[11px] sm:text-xs font-semibold">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="w-full space-y-2.5 sm:space-y-3">
              <div className="relative">
                <User className="w-4 h-4 text-emerald-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Username"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-black/50 border border-emerald-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-emerald-400 absolute left-3 top-3" />
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-black/50 border border-emerald-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="py-2 sm:py-2.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 rounded-xl text-xs font-bold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="py-2 sm:py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border border-amber-400 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-1.5"
                >
                  {authLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isLoginTab ? 'Sign In' : 'Sign Up'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAWN PROMOTION POPUP */}
      {pendingPromotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-[320px] sm:max-w-sm bg-gradient-to-b from-[#0a2f2a] via-[#051c18] to-[#020d0b] border-2 border-amber-400/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl text-center flex flex-col items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 mb-2 sm:mb-3 shadow">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>

            <h3 className="text-base sm:text-xl font-black text-amber-300 tracking-wide">Prompted congratulation</h3>
            <p className="text-[11px] sm:text-xs text-emerald-200/90 mt-1 mb-4 sm:mb-6 px-1 leading-relaxed">
              Now you can change it into queen, rook, bishop, knight
            </p>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full">
              <button
                onClick={() => completeMove(pendingPromotion.from, pendingPromotion.to, 'q')}
                className="py-2 sm:py-3 px-2 bg-gradient-to-b from-[#d97724] to-[#7c3a0e] hover:from-[#f59e0b] hover:to-[#9a3412] border-2 border-amber-300/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition active:scale-95 shadow-md group"
              >
                <span className="text-2xl sm:text-3xl text-amber-100 group-hover:scale-110 transition">♛</span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-100 mt-1">Queen</span>
              </button>
              <button
                onClick={() => completeMove(pendingPromotion.from, pendingPromotion.to, 'r')}
                className="py-2 sm:py-3 px-2 bg-gradient-to-b from-[#d97724] to-[#7c3a0e] hover:from-[#f59e0b] hover:to-[#9a3412] border-2 border-amber-300/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition active:scale-95 shadow-md group"
              >
                <span className="text-2xl sm:text-3xl text-amber-100 group-hover:scale-110 transition">♜</span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-100 mt-1">Rook</span>
              </button>
              <button
                onClick={() => completeMove(pendingPromotion.from, pendingPromotion.to, 'b')}
                className="py-2 sm:py-3 px-2 bg-gradient-to-b from-[#d97724] to-[#7c3a0e] hover:from-[#f59e0b] hover:to-[#9a3412] border-2 border-amber-300/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition active:scale-95 shadow-md group"
              >
                <span className="text-2xl sm:text-3xl text-amber-100 group-hover:scale-110 transition">♝</span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-100 mt-1">Bishop</span>
              </button>
              <button
                onClick={() => completeMove(pendingPromotion.from, pendingPromotion.to, 'n')}
                className="py-2 sm:py-3 px-2 bg-gradient-to-b from-[#d97724] to-[#7c3a0e] hover:from-[#f59e0b] hover:to-[#9a3412] border-2 border-amber-300/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition active:scale-95 shadow-md group"
              >
                <span className="text-2xl sm:text-3xl text-amber-100 group-hover:scale-110 transition">♞</span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-100 mt-1">Knight</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP SCREENS (TIMEOUT, CHECKMATE, FORFEIT, OPPONENT LEFT) */}
      {endGameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-[320px] sm:max-w-sm bg-gradient-to-b from-[#0a2f2a] via-[#051c18] to-[#020d0b] border-2 border-amber-400/90 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-center flex flex-col items-center">
            
            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border flex items-center justify-center mb-2 sm:mb-3 shadow ${
              endGameModal.isWinner ? 'bg-amber-500/20 border-amber-400/40 text-amber-300' : 'bg-red-500/20 border-red-400/40 text-red-400'
            }`}>
              {endGameModal.type === 'timeout' ? (
                <Hourglass className="w-6 h-6 sm:w-8 sm:h-8 animate-pulse" />
              ) : endGameModal.isWinner ? (
                <Trophy className="w-6 h-6 sm:w-8 sm:h-8 animate-bounce text-amber-300" />
              ) : (
                <Frown className="w-6 h-6 sm:w-8 sm:h-8 text-red-400" />
              )}
            </div>

            <h3 className={`text-base sm:text-xl font-black tracking-wide leading-snug px-1 ${
              endGameModal.isWinner ? 'text-amber-300' : 'text-red-400'
            }`}>
              {endGameModal.title}
            </h3>

            <p className="text-[11px] sm:text-xs text-slate-300 mt-1.5 mb-4 sm:mb-6 px-1 leading-relaxed">
              {endGameModal.subtitle}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full">
              {mode === 'bot' && endGameModal.isWinner ? (
                <>
                  <button
                    onClick={() => handleStartBotGame(botLevel)}
                    className="py-2.5 sm:py-3 px-2 bg-gradient-to-b from-[#3a2010] to-[#1f0f06] hover:bg-emerald-900 border-2 border-[#a16207] rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 text-xs font-bold text-amber-200 transition active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restart
                  </button>
                  <button
                    onClick={() => handleStartBotGame(Math.min(10, botLevel + 1))}
                    className="py-2.5 sm:py-3 px-2 bg-gradient-to-r from-[#d95b00] to-[#b34700] hover:from-[#f56c0b] hover:to-[#cc5200] border-2 border-amber-400 rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black text-white shadow-lg transition active:scale-95"
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> Next Level
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={mode === 'bot' ? () => handleStartBotGame(botLevel) : resetToMenu}
                    className="py-2.5 sm:py-3 px-2 bg-gradient-to-b from-[#d97724] to-[#7c3a0e] hover:from-[#f59e0b] hover:to-[#9a3412] border-2 border-amber-400/80 rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black text-white shadow-md transition active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> {mode === 'bot' ? 'Restart' : 'Play Again'}
                  </button>
                  <button
                    onClick={resetToMenu}
                    className="py-2.5 sm:py-3 px-2 bg-emerald-950/60 hover:bg-emerald-900 border-2 border-emerald-700/60 rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-200 transition active:scale-95"
                  >
                    <Menu className="w-3.5 h-3.5" /> Menu
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-1.5 sm:py-2 text-center text-[9px] sm:text-[10px] text-emerald-600/70">
        ChessArena • Responsive Multiplatform Engine
      </footer>
    </div>
  );
}
