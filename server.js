const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const masterRoutes = require('./routes/masterRoutes');
const mainRoutes = require('./routes/mainRoutes');
const Notification = require('./models/masterModels/Notifications');

const app = express();
const PORT = 8001;

app.use(bodyParser.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

require('dotenv').config();

app.use('/api', masterRoutes);
app.use('/api', mainRoutes);

app.get('/test', (req, res) => {
  res.send("Testing mongo db url", process.env.MONGODB_URI);
});

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.IO
// const io = new Server(server, {
//   cors: {
//     origin: "*",
//   }
// });
const io = new Server(server, {
  cors: {
    origin: "https://goldsunauto.in",
    methods: ["GET", "POST"],
    credentials: true
  }
});
io.on("connection", (socket) => {
  console.log("⚡ A client connected:", socket.id);

  socket.on("joinRoom", ({ unitId }) => {
    socket.join(unitId);
    console.log(`Socket ${socket.id} joined room: ${unitId}`);
  });

  socket.on("sendMessage", async ({ toUnitId, message }) => {
    console.log(`➡️ Sending message to ${toUnitId}: ${message}`);
    io.to(toUnitId).emit("receiveMessage", message);
try { 
    await Notification.create({
      unitId: toUnitId,
      message,
    });
  } catch (err) {
    console.error("❌ Error saving notification:", err.message);
  }
});

  socket.on("disconnect", () => {
  });
})

// MongoDB Connection
async function main() {
  try {
    await mongoose.connect("mongodb+srv://restore_admin:enisdevteam123@enistechteam.owwtldg.mongodb.net/goldsun_stockmanagement?retryWrites=true&w=majority&appName=GOLDSUN_STOCKMANAGEMENT", {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000
    });

    console.log("✅ MongoDB successfully connected");

    const dbName = mongoose.connection.db.databaseName;
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📦 Collections in database: ${dbName}`, collections.map(col => col.name));

    server.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
  }
}

main();

module.exports = app;
