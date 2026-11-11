/**
 * Audio service (Stage 01 placeholder).
 * Responsible for SFX and music. No audio assets implemented yet.
 */

export const audio = {
  play: (_id: string) => {
    // No-op in Stage 01. Audio wired in a later stage.
    return Promise.resolve();
  },
  stop: () => Promise.resolve(),
  setVolume: (_volume: number) => Promise.resolve(),
};
