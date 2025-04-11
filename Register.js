const express = require('express');
const router = express.Router();
const { getUserByEmail, createUser, getUserById } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const saltRounds = 10;

// POST /api/register – Register a new user
router.post('/api/register', async (req, res) => {
  try {
    console.log('Registration request received:', req.body);

    const { email, password, name } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required.' });
    }

    // Check for existing user
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user object
    const newUser = {
      _id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      createdAt: new Date().toISOString()
    };

    // Save user to database
    await createUser(newUser);

    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = newUser;
    return res.status(201).json(userWithoutPassword);

  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again later.' });
  }
});

// GET /api/register/:id – Get user by ID
router.get('/api/register/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { password, ...userWithoutPassword } = user;
    return res.json(userWithoutPassword);

  } catch (err) {
    console.error('Error retrieving user:', err);
    return res.status(500).json({ error: 'Failed to retrieve user. Please try again later.' });
  }
});

module.exports = router;
