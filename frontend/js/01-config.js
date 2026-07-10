/* ==========================================================================
   MovieBD front-end
   Talks to the FastAPI backend mounted at the same origin (API_BASE = '').
   No build step — plain JS, works by opening index.html through the server.
   ========================================================================== */
const API = "";
const state = {
  token: localStorage.getItem("mf_token") || null,
  user: JSON.parse(localStorage.getItem("mf_user") || "null"),
  genres: [],
  favoriteIds: new Set(),
  watchlistIds: new Set(),
};

const GENRE_GRADIENTS = {
  Action: ["#7a1f1f", "#1a0a0a"],
  Adventure: ["#1f5a3d", "#0a1a12"],
  Animation: ["#1f4a7a", "#0a1626"],
  Comedy: ["#7a6a1f", "#1e1a08"],
  Crime: ["#3d3d3d", "#0f0f0f"],
  Documentary: ["#1f5a5a", "#0a1a1a"],
  Drama: ["#4a1f5a", "#150a1a"],
  Family: ["#1f7a5e", "#08201a"],
  Fantasy: ["#5a2f7a", "#180a22"],
  History: ["#6b4a1f", "#1e1408"],
  Horror: ["#3a0a0a", "#0d0303"],
  Music: ["#1f5a7a", "#0a1a22"],
  Mystery: ["#2a1f4a", "#0a0818"],
  Romance: ["#7a1f4a", "#22081a"],
  "Science Fiction": ["#1f3d7a", "#08122a"],
  "TV Movie": ["#4a4a1f", "#141408"],
  Thriller: ["#3d1f2c", "#160a10"],
  War: ["#4a2f1f", "#160f08"],
  Western: ["#5a4a1f", "#181408"],
  _default: ["#3a2b4d", "#1a1522"],
};
const MOOD_ICONS = {
  happy: "😄",
  sad: "😢",
  excited: "🤩",
  romantic: "💕",
  relaxing: "🌿",
  inspirational: "✨",
};
const MOOD_DESC = {
  happy: "Comedies & feel-good family fun",
  sad: "Dramas worth a good cry",
  excited: "Action, adventure & thrillers",
  romantic: "Love stories, front and center",
  relaxing: "Easy, low-stakes watching",
  inspirational: "Stories that light a fire in you",
};
const COLLECTIONS = [
  "Harry Potter",
  "Marvel",
  "Fast",
  "Mission: Impossible",
  "Batman",
  "Star Wars",
  "James Bond",
];
