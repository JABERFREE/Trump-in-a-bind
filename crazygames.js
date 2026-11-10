/**
 * CrazyGames SDK Utility
 * Handles initialization and common SDK events
 */

class CrazyGamesManager {
    constructor() {
        this.sdk = null;
        this.isInitialized = false;
        this.adActive = false;
    }

    async init() {
        if (typeof window.CrazyGames === 'undefined') {
            return;
        }

        // Domain check to avoid sdkDisabled errors in preview environments
        const host = window.location.hostname;
        const isAllowedDomain = host === 'localhost' || 
                               host === '127.0.0.1' || 
                               host.includes('crazygames.com') || 
                               host.includes('crazy.games');

        if (!isAllowedDomain) {
            console.log("CrazyGames SDK initialization skipped (Non-supported domain). Features will be bypassed.");
            return;
        }

        try {
            this.sdk = window.CrazyGames.SDK;
            await this.sdk.init();
            this.isInitialized = true;
            console.log("CrazyGames SDK Initialized");
        } catch (error) {
            this.isInitialized = false;
        }
    }

    gameLoadingStart() {
        if (!this.isInitialized) return;
        this.sdk.game.loadingStart();
    }

    gameLoadingFinished() {
        if (!this.isInitialized) return;
        this.sdk.game.loadingFinished();
    }

    gameplayStart() {
        if (!this.isInitialized) return;
        this.sdk.game.gameplayStart();
    }

    gameplayStop() {
        if (!this.isInitialized) return;
        this.sdk.game.gameplayStop();
    }

    async requestAd(type = 'midroll', callbacks = {}) {
        if (!this.isInitialized) {
            if (callbacks.adFinished) callbacks.adFinished();
            return;
        }

        this.gameplayStop();
        this.adActive = true;

        try {
            await this.sdk.ad.requestAd(type, {
                adStarted: () => {
                    console.log("Ad started");
                    if (callbacks.adStarted) callbacks.adStarted();
                },
                adFinished: () => {
                    console.log("Ad finished");
                    this.adActive = false;
                    this.gameplayStart();
                    if (callbacks.adFinished) callbacks.adFinished();
                },
                adError: (error) => {
                    console.error("Ad error:", error);
                    this.adActive = false;
                    this.gameplayStart();
                    if (callbacks.adError) callbacks.adError(error);
                }
            });
        } catch (error) {
            console.error("CrazyGames requestAd error:", error);
            this.adActive = false;
            this.gameplayStart();
            if (callbacks.adFinished) callbacks.adFinished();
        }
    }
}

export const crazyGames = new CrazyGamesManager();
