// Where the teammates' parts live, relative to the HUD page, so the site works from any folder
// (the laptop server at /hud/, or GitHub Pages at /<repo>/web/hud/). Missing parts fall back to /hud/dev stand-ins.
export const config = {
  mission: '../mission/mission.json',
  live: '../live/live.js',
  voice: '../ai/voice.js',
  sim: '../sim/sim.js',
  sampleMission: './dev/sample-mission.json',
};
