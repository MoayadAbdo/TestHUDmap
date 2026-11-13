// Room codes made by Ground Control: the same letters and length as getRoom() on the phone (live/live.js).
export const ROOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_LENGTH = 6;

/** A new random room code. randomBytes(n): n random bytes (the browser's crypto by default). */
export function makeRoomCode(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(randomBytes(ROOM_LENGTH), (b) => ROOM_LETTERS[b % ROOM_LETTERS.length]).join("");
}
