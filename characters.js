export const PIRATES = [
    { 
        name: "Captain Trump", 
        portrait: "./assets/pirate_captain_trump.webp", 
        figure: "./assets/pirate_trump_figure_new.webp",
        voice: "./assets/audio/trump_victory_voice.mp3",
        intro: "./assets/audio/trump_intro_voice.mp3",
        color: 0xff0000,
        ability: {
            name: "Gold Rush",
            description: "2x Movement Speed for 4s",
            type: "speed",
            duration: 4000,
            cooldown: 8000
        }
    },
    { 
        name: "Marco Rubio", 
        portrait: "./assets/pirate_mate_rubio_portrait.webp", 
        figure: "./assets/pirate_rubio_figure_new.webp",
        voice: "./assets/audio/rubio_victory_voice.mp3",
        intro: "./assets/audio/rubio_intro_voice.mp3",
        color: 0x00ff00,
        ability: {
            name: "Water Dash",
            description: "Rapid dash forward",
            type: "dash",
            cooldown: 5000
        }
    },
    { 
        name: "Pete Hegseth", 
        portrait: "./assets/pirate_mate_hegseth_portrait.webp", 
        figure: "./assets/pirate_hegseth_figure_new.webp",
        voice: "./assets/audio/hegseth_victory_voice.mp3",
        intro: "./assets/audio/hegseth_intro_voice.mp3",
        color: 0x0000ff,
        ability: {
            name: "Iron Shield",
            description: "Invulnerability to traps for 5s",
            type: "shield",
            duration: 5000,
            cooldown: 12000
        }
    },
    { 
        name: "JD Vance", 
        portrait: "./assets/pirate_mate_vance_portrait.webp", 
        figure: "./assets/pirate_vance_figure_new.webp",
        voice: "./assets/audio/vance_victory_voice.mp3",
        intro: "./assets/audio/vance_intro_voice.mp3",
        color: 0xffff00,
        ability: {
            name: "Vantage Jump",
            description: "Super High Jump",
            type: "jump",
            cooldown: 4000
        }
    },
    { 
        name: "Steve Witkoff", 
        portrait: "./assets/pirate_mate_witkopf_portrait.webp", 
        figure: "./assets/pirate_witkopf_figure_new.webp",
        voice: "./assets/audio/witkopf_victory_voice.mp3",
        intro: "./assets/audio/witkopf_intro_voice.mp3",
        color: 0xff00ff,
        ability: {
            name: "Maze Sight",
            description: "Overhead Camera View for 6s",
            type: "vision",
            duration: 6000,
            cooldown: 15000
        }
    },
    { 
        name: "Jared Kushner", 
        portrait: "./assets/pirate_mate_kushner_portrait.webp", 
        figure: "./assets/pirate_kushner_figure_new.webp",
        voice: "./assets/audio/kushner_victory_voice.mp3",
        intro: "./assets/audio/kushner_intro_voice.mp3",
        color: 0x00ffff,
        ability: {
            name: "Blink",
            description: "Teleport forward 8 meters",
            type: "teleport",
            cooldown: 6000
        }
    }
];

export class CharacterManager {
    constructor() {
        this.currentIndex = 0;
        this.completedPirates = [];
    }

    getCurrentPirate() {
        return PIRATES[this.currentIndex];
    }

    nextPirate() {
        if (this.currentIndex < PIRATES.length - 1) {
            this.completedPirates.push(PIRATES[this.currentIndex]);
            this.currentIndex++;
            return true;
        }
        return false;
    }

    isLastPirate() {
        return this.currentIndex === PIRATES.length - 1;
    }

    getProgress() {
        return `${this.currentIndex + 1} / ${PIRATES.length}`;
    }
}
