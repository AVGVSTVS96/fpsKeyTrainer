/**
 * FPS Keys Trainer
 * 
 * Features:
 * - Nice UI
 * - Tracks overall and per‑key statistics
 * - Rolling average reaction time for the last 4 correct rounds
 * - Final summary on exit (Ctrl+C)
 */

import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';

const statsFile = 'stats.json';

// Persistent stats saved to a JSON file
let stats = {};
if (fs.existsSync(statsFile)) {
  try {
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
  } catch (err) {
    console.error(chalk.red("Error reading stats file. Starting with fresh stats."));
  }
}
if (!stats.meta) {
  stats.meta = { gamesPlayed: 0 };
}

// List of keys to track
const keys = ['q', 'e', 'r', 't', 'f', 'g', 'c', 'x', 'z'];
keys.forEach(key => {
  if (!stats[key]) {
    stats[key] = { attempts: 0, successes: 0, totalTime: 0, errors: 0, bestTime: null, worstTime: null };
  } else {
    if (stats[key].bestTime === undefined) stats[key].bestTime = null;
    if (stats[key].worstTime === undefined) stats[key].worstTime = null;
  }
});

// Global game state
let round = 0;
let currentKey = null;
let promptTime = null;
const reactionTimes = []; // Rolling reaction times (last 4)
const resultsLog = [];    // Round result messages

// Terminal layout settings
const leftColumnWidth = 60;
const leftColumnHeight = 22;

function getRightColumnStart() {
  return leftColumnWidth + 2;
}

function getRightColumnWidth() {
  return process.stdout.columns - leftColumnWidth - 1;
}

// ANSI-aware helpers
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function padAnsi(str, width) {
  const diff = width - stripAnsi(str).length;
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function truncateAnsiPreserve(str, width) {
  const plain = stripAnsi(str);
  if (plain.length <= width) return str;
  const match = str.match(/^((?:\x1B\[[0-9;]*m)+)/);
  const prefix = match ? match[0] : "";
  return prefix + plain.slice(0, width - 1) + "…";
}

// Analysis Helpers
function getOverallAccuracy() {
  let totalAttempts = 0;
  let totalSuccesses = 0;
  for (const key of keys) {
    totalAttempts += stats[key].attempts;
    totalSuccesses += stats[key].successes;
  }
  return totalAttempts > 0 ? ((totalSuccesses / totalAttempts) * 100).toFixed(1) : "N/A";
}

function getRollingAvg() {
  if (reactionTimes.length === 0) return "N/A";
  const sum = reactionTimes.reduce((a, b) => a + b, 0);
  return (sum / reactionTimes.length).toFixed(1);
}

function getPerKeySummary() {
  const header = padAnsi(chalk.underline("Key"), 5) +
    padAnsi(chalk.underline("Att"), 6) +
    padAnsi(chalk.underline("Suc"), 6) +
    padAnsi(chalk.underline("Err"), 6) +
    padAnsi(chalk.underline("Avg(ms)"), 10) +
    padAnsi(chalk.underline("Best(ms)"), 10) +
    padAnsi(chalk.underline("Worst(ms)"), 11);
  const lines = [header];
  keys.forEach(key => {
    const s = stats[key];
    const avg = s.successes > 0 ? (s.totalTime / s.successes).toFixed(1) : "N/A";
    const best = s.bestTime !== null ? s.bestTime : "N/A";
    const worst = s.worstTime !== null ? s.worstTime : "N/A";
    const line = padAnsi(` ${key.toUpperCase()} `, 5) +
      padAnsi(String(s.attempts), 6) +
      padAnsi(String(s.successes), 6) +
      padAnsi(String(s.errors), 6) +
      padAnsi(String(avg), 10) +
      padAnsi(String(best), 10) +
      padAnsi(String(worst), 11);
    lines.push(line);
  });
  return lines;
}

// Display final stats on exit
function displayFinalStats() {
  stats.meta.gamesPlayed++;
  saveStats();

  console.clear();
  console.log(chalk.bgBlue.black.bold(" FINAL STATS "));
  console.log("");
  console.log(chalk.white(`Total Rounds: ${round}`));
  console.log(chalk.white(`Games Played: ${stats.meta.gamesPlayed}`));
  console.log(chalk.white(`Overall Accuracy: ${getOverallAccuracy()}%`));
  console.log(chalk.white(`Rolling Avg Reaction Time (last 4): ${getRollingAvg()} ms`));
  console.log("");
  console.log(chalk.bgMagenta.black.bold(" Per-Key Summary "));
  getPerKeySummary().forEach(line => console.log(line));
  console.log("");
  console.log(chalk.gray("Thank you for playing FPS Keys Trainer!"));
}

// Render UI
function renderUI() {
  const leftLines = [];

  // Header & Instructions
  leftLines.push(padAnsi(chalk.bgBlue.black.bold(" FPS Keys Trainer v2.0 "), leftColumnWidth));
  leftLines.push(padAnsi(chalk.bgBlue.black.bold(" Modern Devs Only "), leftColumnWidth));
  leftLines.push("".padEnd(leftColumnWidth, "─"));
  leftLines.push(chalk.yellow("Press the highlighted key as fast as you can."));
  leftLines.push(chalk.gray(`Keys: ${keys.join(" ")}`));
  leftLines.push(chalk.gray("Press Ctrl+C to exit."));

  leftLines.push("".padEnd(leftColumnWidth));

  // Overall Analyses
  leftLines.push(chalk.white(`Total Rounds: ${round}`));
  leftLines.push(chalk.white(`Games Played: ${stats.meta.gamesPlayed}`));
  leftLines.push(chalk.white(`Overall Accuracy: ${getOverallAccuracy()}%`));
  leftLines.push(chalk.white(`Rolling Avg (last 4): ${getRollingAvg()} ms`));

  leftLines.push("".padEnd(leftColumnWidth));

  // Per-Key Summary Table
  leftLines.push(chalk.bgMagenta.black.bold(" Per-Key Summary "));
  const summaryLines = getPerKeySummary();
  summaryLines.forEach(line => leftLines.push(line));

  // Ensure we do not exceed a fixed number of lines; trim or pad as needed.
  while (leftLines.length < leftColumnHeight - 4) {
    leftLines.push("".padEnd(leftColumnWidth));
  }
  if (leftLines.length > leftColumnHeight - 4) {
    leftLines.length = leftColumnHeight - 4;
  }

  // Current round info & target key prompt.
  if (currentKey) {
    leftLines.push(padAnsi(chalk.cyan(`Round: ${round}`), leftColumnWidth));
    leftLines.push(padAnsi(`Press: ${chalk.bgGreen.black.bold(` ${currentKey.toUpperCase()} `)}`, leftColumnWidth));
  } else {
    leftLines.push(padAnsi(chalk.white("Preparing next round..."), leftColumnWidth));
    leftLines.push("".padEnd(leftColumnWidth));
  }

  leftLines.push("".padEnd(leftColumnWidth));
  leftLines.push(padAnsi(chalk.white("Type your answer:"), leftColumnWidth));

  while (leftLines.length < leftColumnHeight) {
    leftLines.push("".padEnd(leftColumnWidth));
  }

  process.stdout.write("\x1b[2J\x1b[H");
  for (let i = 0; i < leftColumnHeight; i++) {
    process.stdout.write(`\x1b[${i + 1};1H` + (leftLines[i] || "".padEnd(leftColumnWidth)));
  }

  for (let i = 1; i <= leftColumnHeight; i++) {
    process.stdout.write(`\x1b[${i};${leftColumnWidth + 1}H│`);
  }

  const rightLines = [];
  rightLines.push(padAnsi(chalk.bgMagenta.black.bold(" Round Results "), getRightColumnWidth()));
  rightLines.push("".padEnd(getRightColumnWidth(), "─"));

  const availableLogLines = process.stdout.rows - 2;
  const logSlice = resultsLog.slice(-availableLogLines);
  for (const line of logSlice) {
    rightLines.push(truncateAnsiPreserve(line, getRightColumnWidth()));
  }

  for (let i = 0; i < rightLines.length; i++) {
    process.stdout.write(`\x1b[${i + 1};${getRightColumnStart()}H` + rightLines[i]);
  }
}

// Utility Functions
function saveStats() {
  try {
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error(chalk.red("Error saving stats:"), err);
  }
}

function getKeyWeight(key) {
  const s = stats[key];
  const avgTime = s.successes > 0 ? s.totalTime / s.successes : 500;
  const errorPenalty = s.errors * 100;
  return avgTime + errorPenalty + 100;
}

function chooseNextKey() {
  const weights = keys.map(key => getKeyWeight(key));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rnd = Math.random() * totalWeight;
  for (let i = 0; i < keys.length; i++) {
    rnd -= weights[i];
    if (rnd <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}

// Game Flow
function nextRound() {
  round++;
  currentKey = chooseNextKey();
  promptTime = Date.now();
  renderUI();
}

// Terminal Input Setup
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key.sequence === '\u0003') { // Ctrl+C
    process.stdout.write("\x1b[0m");
    process.stdout.write("\x1b[?25h");
    displayFinalStats();
    process.exit();
  }
  if (!currentKey) return;

  const reactionTime = Date.now() - promptTime;
  stats[currentKey].attempts++;

  let resultMessage;
  if (str === currentKey) {
    stats[currentKey].successes++;
    stats[currentKey].totalTime += reactionTime;
    // Update best and worst times.
    if (stats[currentKey].bestTime === null || reactionTime < stats[currentKey].bestTime) {
      stats[currentKey].bestTime = reactionTime;
    }
    if (stats[currentKey].worstTime === null || reactionTime > stats[currentKey].worstTime) {
      stats[currentKey].worstTime = reactionTime;
    }
    reactionTimes.push(reactionTime);
    if (reactionTimes.length > 4) reactionTimes.shift();
    resultMessage = chalk.green.bold(`Round ${round}: Correct! [${currentKey.toUpperCase()}] in ${reactionTime} ms.`);
  } else {
    stats[currentKey].errors++;
    resultMessage = chalk.red.bold(`Round ${round}: Oops! Pressed [${str.toUpperCase()}] instead of [${currentKey.toUpperCase()}] (${reactionTime} ms).`);
  }
  resultsLog.push(resultMessage);

  saveStats();
  currentKey = null;
  renderUI();
  setTimeout(nextRound, 100);
});

// Start the Game
renderUI();
nextRound();

