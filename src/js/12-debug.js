// ---------------------------------------------------------------------------
// Debug mode, as far as the game itself knows about it.
//
// Debug mode (the panel, its switches and what they draw) is in src/dev/10-debug.js and, like the workshop,
// is only present in a build made with `npm run dev`. Nothing from there reaches index.html.
//
// What stays here is the little the game reads. In the game as players get it there are no switches,
// so every `debugState.options.something` is off, nothing can turn it on, and every hook stays empty.
// ---------------------------------------------------------------------------

const DEBUG_MAXIMUM_LINE_VERTICES = 6000; // how many line ends the renderer can draw in one frame

const debugState = {
  isPanelOpen: false,
  hasBeenUsedThisRun: false,
  options: {} // the switches; src/dev/10-debug.js adds them
};

// Filled in by src/dev/10-debug.js.
const debugHooks = {
  resetForNewRun: null,  // a new run starts
  stationLoaded: null,   // a different station was loaded
  hidePanel: null,       // the run is left for the title screen
  togglePanel: null,     // the ` or F2 key was pressed
  update: null,          // every frame, with the real time that passed
  updateFlight: null,    // moves the player while "Fly through walls" is on
  recordNoise: null,     // a noise was made at (x, z) that carries `radius` metres
  buildFrameData: null,  // returns what the renderer should draw for debug mode, or null
  drawMapMarkers: null   // draws creatures on a map canvas
};
