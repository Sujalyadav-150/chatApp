const jwt = require("jsonwebtoken");

function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid socket token"));
  }
}

module.exports = socketAuth;