const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// MongoDB URI Setup
const mongoURI = process.env.MONGODB_URI
  ? process.env.MONGODB_URI.replace('mongodb+srv://', 'mongodb://')
  : 'mongodb://localhost:27017/bloodbank?authSource=admin';

let client, db;
const DB_FILE = path.join(__dirname, 'inmemory_db.json');

// In-memory DB structure
let inMemoryDB = {
  donors: [],
  blood_requests: [],
  volunteers: [],
  blood_inventory: [],
  users: []
};

// Load in-memory DB from file (if exists)
try {
  if (fs.existsSync(DB_FILE)) {
    const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
    if (fileContent.trim()) {
      inMemoryDB = JSON.parse(fileContent);
    }
  }
} catch (err) {
  console.error('Error reading in-memory DB file:', err.message);
}

function saveToFile() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(inMemoryDB, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving in-memory DB:', err.message);
    throw err;
  }
}

async function disconnectDB() {
  try {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
  }
}

function isConnected() {
  return !!db;
}

const collections = {
  DONORS: 'donors',
  REQUESTS: 'blood_requests',
  VOLUNTEERS: 'volunteers',
  INVENTORY: 'blood_inventory'
};

async function connectDB() {
  if (db) return true;

  try {
    client = new MongoClient(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true
    });
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');

    await createIndexes();
    return true;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.warn('Falling back to in-memory database');
    return false;
  }
}

async function createIndexes() {
  try {
    await db.collection(collections.DONORS).createIndex({ email: 1 }, { unique: true });
    await db.collection(collections.REQUESTS).createIndex({ bloodType: 1, urgency: 1 });
    await db.collection(collections.INVENTORY).createIndex({ bloodType: 1 }, { unique: true });
  } catch (err) {
    console.error('Error creating indexes:', err);
    throw err;
  }
}

// --------- Donor Operations ---------
const donorDB = {
  async register(donorData) {
    if (!donorData || typeof donorData !== 'object') {
      throw new Error('Invalid donor data');
    }

    const requiredFields = ['name', 'email', 'bloodType', 'phone'];
    for (const field of requiredFields) {
      if (!donorData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (db) {
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await db.collection(collections.DONORS).insertOne({
            ...donorData,
            lastDonation: null,
            donations: 0,
            createdAt: new Date()
          }, { session });
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else {
      console.warn("Using in-memory DB for donor registration.");
      const newDonor = {
        _id: Date.now().toString(),
        ...donorData,
        lastDonation: null,
        donations: 0,
        createdAt: new Date()
      };
      inMemoryDB.donors.push(newDonor);
      saveToFile();
      return { insertedId: newDonor._id };
    }
  },

  async findDonorsByBloodType(bloodType) {
    if (!bloodType || typeof bloodType !== 'string') {
      throw new Error('Invalid blood type');
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    if (db) {
      return db.collection(collections.DONORS)
        .find({ bloodType, lastDonation: { $lt: ninetyDaysAgo } })
        .toArray();
    } else {
      return inMemoryDB.donors.filter(d =>
        d.bloodType === bloodType &&
        (!d.lastDonation || new Date(d.lastDonation) < ninetyDaysAgo)
      );
    }
  },

  async getDonorById(id) {
    if (!id) throw new Error('Invalid donor ID');

    try {
      const objectId = new ObjectId(id);
      if (db) {
        return db.collection(collections.DONORS).findOne({ _id: objectId });
      } else {
        return inMemoryDB.donors.find(d => d._id === id);
      }
    } catch {
      throw new Error('Invalid ObjectId format');
    }
  }
};

// --------- Blood Request Operations ---------
const requestDB = {
  async createRequest(requestData) {
    const requiredFields = ['patientName', 'bloodType', 'hospital', 'unitsRequired'];
    for (const field of requiredFields) {
      if (!requestData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (db) {
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await db.collection(collections.REQUESTS).insertOne({
            ...requestData,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          }, { session });
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else {
      const newRequest = {
        _id: Date.now().toString(),
        ...requestData,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      inMemoryDB.blood_requests.push(newRequest);
      saveToFile();
      return { insertedId: newRequest._id };
    }
  },

  async getActiveRequests() {
    if (db) {
      return db.collection(collections.REQUESTS)
        .find({ status: 'pending' })
        .sort({ urgency: -1, createdAt: 1 })
        .toArray();
    } else {
      return inMemoryDB.blood_requests
        .filter(r => r.status === 'pending')
        .sort((a, b) => b.urgency - a.urgency || a.createdAt - b.createdAt);
    }
  },

  async updateRequestStatus(id, status) {
    if (!id || !status) throw new Error('Invalid request ID or status');

    try {
      const objectId = new ObjectId(id);
      if (db) {
        return db.collection(collections.REQUESTS).updateOne(
          { _id: objectId },
          { $set: { status, updatedAt: new Date() } }
        );
      } else {
        const req = inMemoryDB.blood_requests.find(r => r._id === id);
        if (req) {
          req.status = status;
          req.updatedAt = new Date();
          saveToFile();
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      }
    } catch {
      throw new Error('Invalid ObjectId format');
    }
  }
};

// --------- Inventory Operations ---------
const inventoryDB = {
  async updateInventory(bloodType, amount) {
    if (!bloodType || typeof amount !== 'number') {
      throw new Error('Invalid blood type or amount');
    }

    if (db) {
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await db.collection(collections.INVENTORY).updateOne(
            { bloodType },
            { $inc: { quantity: amount } },
            { upsert: true, session }
          );
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else {
      const item = inMemoryDB.blood_inventory.find(i => i.bloodType === bloodType);
      if (item) {
        item.quantity += amount;
      } else {
        inMemoryDB.blood_inventory.push({ _id: Date.now().toString(), bloodType, quantity: amount });
      }
      saveToFile();
      return { modifiedCount: 1 };
    }
  },

  async getInventory() {
    return db
      ? db.collection(collections.INVENTORY).find().toArray()
      : inMemoryDB.blood_inventory;
  },

  async getBloodTypeQuantity(bloodType) {
    if (!bloodType) throw new Error('Invalid blood type');

    if (db) {
      const result = await db.collection(collections.INVENTORY).findOne({ bloodType });
      return result ? result.quantity : 0;
    } else {
      const item = inMemoryDB.blood_inventory.find(i => i.bloodType === bloodType);
      return item ? item.quantity : 0;
    }
  }
};

// --------- Volunteer Operations ---------
const volunteerDB = {
  async register(volunteerData) {
    const requiredFields = ['name', 'email', 'phone', 'skills'];
    for (const field of requiredFields) {
      if (!volunteerData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (db) {
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await db.collection(collections.VOLUNTEERS).insertOne({
            ...volunteerData,
            active: true,
            joinedAt: new Date()
          }, { session });
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else {
      const newVolunteer = {
        _id: Date.now().toString(),
        ...volunteerData,
        active: true,
        joinedAt: new Date()
      };
      inMemoryDB.volunteers.push(newVolunteer);
      saveToFile();
      return { insertedId: newVolunteer._id };
    }
  },

  async getActiveVolunteers() {
    return db
      ? db.collection(collections.VOLUNTEERS).find({ active: true }).toArray()
      : inMemoryDB.volunteers.filter(v => v.active);
  },

  async updateVolunteerStatus(id, active) {
    if (!id || typeof active !== 'boolean') {
      throw new Error('Invalid ID or status');
    }

    try {
      const objectId = new ObjectId(id);
      if (db) {
        return db.collection(collections.VOLUNTEERS).updateOne(
          { _id: objectId },
          { $set: { active, updatedAt: new Date() } }
        );
      } else {
        const v = inMemoryDB.volunteers.find(vol => vol._id === id);
        if (v) {
          v.active = active;
          v.updatedAt = new Date();
          saveToFile();
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      }
    } catch {
      throw new Error('Invalid ObjectId format');
    }
  }
};

// --------- User Management ---------
async function getUserByEmail(email) {
  if (!email) throw new Error('Invalid email');
  return db
    ? db.collection('users').findOne({ email })
    : inMemoryDB.users.find(u => u.email === email);
}

async function createUser(user) {
  const requiredFields = ['email', 'password', 'name'];
  for (const field of requiredFields) {
    if (!user[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (db) {
    const session = client.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await db.collection('users').insertOne({
          ...user,
          createdAt: new Date(),
          updatedAt: new Date()
        }, { session });
      });
      return result;
    } finally {
      await session.endSession();
    }
  } else {
    const newUser = {
      _id: Date.now().toString(),
      ...user,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryDB.users.push(newUser);
    saveToFile();
    return { insertedId: newUser._id };
  }
}

async function getUserById(id) {
  if (!id) throw new Error('Invalid user ID');

  try {
    const objectId = new ObjectId(id);
    return db
      ? db.collection('users').findOne({ _id: objectId })
      : inMemoryDB.users.find(u => u._id === id);
  } catch {
    throw new Error('Invalid ObjectId format');
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  isConnected,
  collections,
  donorDB,
  requestDB,
  inventoryDB,
  volunteerDB,
  getUserByEmail,
  createUser,
  getUserById
};

// Handle graceful shutdown only if run directly
if (require.main === module) {
  process.on('SIGINT', async () => {
    await disconnectDB();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await disconnectDB();
    process.exit(0);
  });
}
