import { init, id } from '@instantdb/core';
import { INSTANT_DB_APP_ID } from './instant_db_config.js';

const db = init({ appId: INSTANT_DB_APP_ID });

export class MultiplayerManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.playerId = id();
        this.roomId = this.getRoomId();
        this.room = db.joinRoom('game', this.roomId);
        this.peers = {};

        this.setupPresence();
    }

    getRoomId() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room') || id();
        if (!params.get('room')) {
            window.history.replaceState({}, '', `?room=${roomId}`);
        }
        return roomId;
    }

    setupPresence() {
        this.room.subscribePresence({}, (data) => {
            const { peers } = data;
            this.peers = peers;
            this.gameManager.updateRemotePlayers(peers);
        });
    }

    updateLocalState(state) {
        this.room.publishPresence({
            id: this.playerId,
            ...state
        });
    }

    broadcastVictory(pirateIndex) {
        this.room.publishTopic('victory', { pirateIndex, playerId: this.playerId });
    }
}
