const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_system';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Schemas ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  userId:       { type: String, required: true, unique: true },
  name:         { type: String, default: '' },
  registeredAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const attendanceSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  name:      { type: String, default: '' },
  date:      { type: String, required: true },
  time:      { type: String, required: true },
  status:    { type: String, default: 'Present' },
  createdAt: { type: Date, default: Date.now }
});
const Attendance = mongoose.model('Attendance', attendanceSchema);

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ registeredAt: 1 });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Attendance ────────────────────────────────────────────────────────────────
app.get('/api/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ createdAt: -1 });
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    // Auto-register user on first scan
    await User.findOneAndUpdate(
      { userId: req.body.userId },
      { $setOnInsert: { userId: req.body.userId, name: req.body.name || '' } },
      { upsert: true }
    );
    const record = new Attendance(req.body);
    await record.save();
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/attendance/:id', async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/attendance', async (req, res) => {
  try {
    await Attendance.deleteMany({});
    res.json({ success: true, message: 'All records cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Daily attendance — all registered users + present/absent for a given date
app.get('/api/attendance/daily', async (req, res) => {
  try {
    const date = req.query.date || new Date().toLocaleDateString('en-GB');
    const [users, dayRecords] = await Promise.all([
      User.find().sort({ registeredAt: 1 }),
      Attendance.find({ date })
    ]);
    const presentMap = {};
    dayRecords.forEach(r => { if (!presentMap[r.userId]) presentMap[r.userId] = r.time; });
    const daily = users.map(u => ({
      userId: u.userId,
      name:   u.name,
      status: presentMap[u.userId] ? 'Present' : 'Absent',
      time:   presentMap[u.userId] || null
    }));
    res.json({ success: true, data: daily, date });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Stats ──────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-GB');
    const [total, registeredUsers, todayCount, last] = await Promise.all([
      Attendance.countDocuments(),
      User.countDocuments(),
      Attendance.countDocuments({ date: today }),
      Attendance.findOne().sort({ createdAt: -1 })
    ]);
    res.json({
      success: true,
      data: {
        total,
        uniqueUsers: registeredUsers,
        todayCount,
        lastScan: last ? `ID:${last.userId} ${last.time}` : 'None'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected →', MONGO_URI);
    app.listen(PORT, () => console.log(`🚀  Server running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  });
