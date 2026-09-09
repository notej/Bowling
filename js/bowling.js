
/**
 * Bowling Score Calculator
 * Handles frame-by-frame scoring for standard 10-frame bowling
 */

class BowlingGame {
    constructor() {
        this.frames = [];
        this.currentFrame = 0;
        this.currentRoll = 0;
        this.gameComplete = false;
        this.reset();
    }

    reset() {
        this.frames = Array(10).fill(null).map(() => ({ rolls: [], score: null, display: [] }));
        this.currentFrame = 0;
        this.currentRoll = 0;
        this.gameComplete = false;
    }

    addRoll(pins) {
        if (this.gameComplete) return false;
        if (pins < 0 || pins > 10) return false;

        const frame = this.frames[this.currentFrame];

        // Validate roll
        if (this.currentFrame < 9) {
            // Frames 1-9
            if (this.currentRoll === 1 && frame.rolls[0] + pins > 10) {
                return false; // Can't knock down more than 10 pins
            }
        } else {
            // Frame 10
            if (this.currentRoll === 1 && frame.rolls[0] !== 10 && frame.rolls[0] + pins > 10) {
                return false;
            }
            if (this.currentRoll === 2) {
                const firstTwo = frame.rolls[0] + (frame.rolls[1] || 0);
                if (firstTwo < 10) {
                    return false; // No third roll if no strike/spare in first two
                }
                if (frame.rolls[0] === 10 && frame.rolls[1] !== 10 && frame.rolls[1] + pins > 10) {
                    return false; // After strike, if second roll not strike, can't exceed 10
                }
            }
        }

        frame.rolls.push(pins);
        this.updateDisplay();

        // Determine next state
        if (this.currentFrame < 9) {
            if (pins === 10 && this.currentRoll === 0) {
                // Strike - move to next frame
                this.currentFrame++;
                this.currentRoll = 0;
            } else if (this.currentRoll === 1) {
                // Second roll done - move to next frame
                this.currentFrame++;
                this.currentRoll = 0;
            } else {
                this.currentRoll = 1;
            }
        } else {
            // Frame 10
            if (this.currentRoll === 0) {
                this.currentRoll = 1;
            } else if (this.currentRoll === 1) {
                const total = frame.rolls[0] + frame.rolls[1];
                if (total >= 10) {
                    this.currentRoll = 2;
                } else {
                    this.gameComplete = true;
                }
            } else if (this.currentRoll === 2) {
                this.gameComplete = true;
            }
        }

        this.calculateScores();
        return true;
    }

    updateDisplay() {
        for (let i = 0; i < 10; i++) {
            const frame = this.frames[i];
            frame.display = [];

            if (i < 9) {
                // Frames 1-9
                if (frame.rolls.length === 0) {
                    frame.display = ['', ''];
                } else if (frame.rolls[0] === 10) {
                    frame.display = ['X', ''];
                } else if (frame.rolls.length === 1) {
                    frame.display = [String(frame.rolls[0]), ''];
                } else {
                    const sum = frame.rolls[0] + frame.rolls[1];
                    if (sum === 10) {
                        frame.display = [String(frame.rolls[0]), '/'];
                    } else {
                        frame.display = [String(frame.rolls[0]), String(frame.rolls[1])];
                    }
                }
            } else {
                // Frame 10
                for (let j = 0; j < frame.rolls.length; j++) {
                    if (frame.rolls[j] === 10) {
                        frame.display.push('X');
                    } else if (j > 0 && frame.rolls[j-1] !== 10 && frame.rolls[j-1] + frame.rolls[j] === 10) {
                        frame.display.push('/');
                    } else {
                        frame.display.push(String(frame.rolls[j]));
                    }
                }
                while (frame.display.length < 3) {
                    frame.display.push('');
                }
            }
        }
    }

    calculateScores() {
        let total = 0;

        for (let i = 0; i < 10; i++) {
            const frame = this.frames[i];
            if (frame.rolls.length === 0) {
                frame.score = null;
                continue;
            }

            let frameScore = 0;

            if (i < 9) {
                // Frames 1-9
                if (frame.rolls[0] === 10) {
                    // Strike
                    const nextRolls = this.getNextRolls(i, 2);
                    if (nextRolls.length === 2) {
                        frameScore = 10 + nextRolls[0] + nextRolls[1];
                    } else {
                        frame.score = null;
                        continue;
                    }
                } else if (frame.rolls.length === 2 && frame.rolls[0] + frame.rolls[1] === 10) {
                    // Spare
                    const nextRolls = this.getNextRolls(i, 1);
                    if (nextRolls.length === 1) {
                        frameScore = 10 + nextRolls[0];
                    } else {
                        frame.score = null;
                        continue;
                    }
                } else if (frame.rolls.length === 2) {
                    // Open frame
                    frameScore = frame.rolls[0] + frame.rolls[1];
                } else {
                    frame.score = null;
                    continue;
                }
            } else {
                // Frame 10 - just sum the rolls
                frameScore = frame.rolls.reduce((a, b) => a + b, 0);
            }

            total += frameScore;
            frame.score = total;
        }
    }

    getNextRolls(frameIndex, count) {
        const rolls = [];
        let currentFrame = frameIndex + 1;
        let currentRoll = 0;

        while (rolls.length < count && currentFrame < 10) {
            const frame = this.frames[currentFrame];
            if (currentRoll < frame.rolls.length) {
                rolls.push(frame.rolls[currentRoll]);
                currentRoll++;
                if (currentFrame < 9 && frame.rolls[0] === 10 && currentRoll === 1) {
                    // Strike in frames 1-9, skip second roll
                    currentFrame++;
                    currentRoll = 0;
                } else if (currentRoll >= 2 || (currentFrame < 9 && currentRoll >= frame.rolls.length)) {
                    currentFrame++;
                    currentRoll = 0;
                }
            } else {
                break;
            }
        }

        return rolls;
    }

    getTotalScore() {
        if (!this.gameComplete) return null;
        return this.frames[9].score;
    }

    getFrameState() {
        return {
            frames: this.frames,
            currentFrame: this.currentFrame,
            currentRoll: this.currentRoll,
            gameComplete: this.gameComplete,
            totalScore: this.getTotalScore()
        };
    }

    // Load from saved data
    loadFromData(data) {
        this.frames = data.frames || [];
        this.currentFrame = data.currentFrame || 0;
        this.currentRoll = data.currentRoll || 0;
        this.gameComplete = data.gameComplete || false;
        this.calculateScores();
    }
}

/**
 * Calculate statistics from an array of completed games
 */
function calculateStats(games) {
    if (!games || games.length === 0) {
        return {
            gamesPlayed: 0,
            bestScore: 0,
            averageScore: 0,
            bestOfDay: 0,
            highestFrame: 0
        };
    }

    const scores = games.map(g => g.totalScore).filter(s => s !== null);
    const today = new Date().toDateString();
    const todayGames = games.filter(g => new Date(g.date).toDateString() === today);
    const todayScores = todayGames.map(g => g.totalScore).filter(s => s !== null);

    return {
        gamesPlayed: games.length,
        bestScore: Math.max(...scores),
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        bestOfDay: todayScores.length > 0 ? Math.max(...todayScores) : 0,
        highestFrame: Math.max(...games.flatMap(g => 
            g.frames.map((f, i) => {
                if (i === 9) return f.rolls.reduce((a, b) => a + b, 0);
                if (f.rolls[0] === 10) return 30;
                if (f.rolls.length === 2 && f.rolls[0] + f.rolls[1] === 10) return 20;
                return f.rolls.reduce((a, b) => a + b, 0);
            })
        ))
    };
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BowlingGame, calculateStats };
}
