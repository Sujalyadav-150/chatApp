// Register every Socket.IO event handler.
// Personal and group chat live in separate files so this never becomes one
// huge file, and each concern stays easy to explain in an interview.
const registerPersonalChat = require("./personalChatHandler");
const registerGroupChat = require("./groupChatHandler");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.user.id} (${socket.id})`);

    registerPersonalChat(io, socket);
    registerGroupChat(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.user.id} (${reason})`);
    });
  });
}

module.exports = { registerSocketHandlers };