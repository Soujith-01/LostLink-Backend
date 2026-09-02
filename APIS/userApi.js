import exp from 'express'
import { config } from 'dotenv'
import jwt from 'jsonwebtoken'
import { verifyToken } from '../middlewares/verifyToken.js'
import UserModel from '../models/UserModel.js'

export const userApp = exp.Router()
config()

const generateToken = (userId) => {
	return jwt.sign(
		{ id: userId, userId },
		process.env.JWT_SECRET || process.env.SECRET_KEY || 'default_secret',
		{ expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
	)
}

// User Registration
userApp.post('/register', async (req, res) => {
	try {
		const { name, email, password } = req.body

		if (!name || !email || !password) {
			return res.status(400).json({ message: 'Name, email, and password are required' })
		}

		const existingUser = await UserModel.findOne({ email })
		if (existingUser) {
			return res.status(400).json({ message: 'User already exists with this email' })
		}

		const user = await UserModel.create({
			name,
			email,
			password,
			role: 'user',
		})

		const userObj = user.toObject()
		delete userObj.password

		res.status(201).json({ message: 'User registered successfully', user: userObj })
	} catch (error) {
		console.error('[Register Error]', error.message)
		if (error.name === 'ValidationError') {
			const message = Object.values(error.errors).map((val) => val.message).join(', ')
			return res.status(400).json({ message })
		}
		if (error.code === 11000) {
			return res.status(400).json({ message: 'User already exists with this email' })
		}
		res.status(500).json({ message: 'Registration failed. Please try again.' })
	}
})

// User Login
userApp.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body

		if (!email || !password) {
			return res.status(400).json({ message: 'Email and password are required' })
		}

		const user = await UserModel.findOne({ email }).select('+password')
		if (!user) {
			return res.status(401).json({ message: 'Invalid credentials. User not found' })
		}

		if (!user.isActive) {
			return res.status(403).json({ message: 'Your account has been deactivated' })
		}

		const isMatch = await user.matchPassword(password)
		if (!isMatch) {
			return res.status(401).json({ message: 'Invalid credentials. Incorrect password' })
		}

		const token = generateToken(user._id)
		const userObj = user.toObject()
		delete userObj.password

		res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 })
		res.status(200).json({ message: 'Login successful', token, user: userObj })
	} catch (error) {
		console.error('[Login Error]', error.message)
		res.status(500).json({ message: 'Login failed. Please try again.' })
	}
})

// Get Profile for Authenticated User
userApp.get('/profile', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const user = await UserModel.findById(req.user.userId).select('-password')
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}
	res.status(200).json({ user })
})

// Alias for /me profile route
userApp.get('/me', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const user = await UserModel.findById(req.user.userId).select('-password')
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}
	res.status(200).json({ user })
})

// User Logout
userApp.post('/logout', async (req, res) => {
	res.cookie('token', 'none', { expires: new Date(Date.now() + 5000), httpOnly: true })
	res.status(200).json({ message: 'Logged out successfully' })
})

// Update Profile for Authenticated User
userApp.put('/profile', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		const { name, phone, avatar } = req.body
		const user = await UserModel.findById(req.user.userId)
		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}

		if (name !== undefined) user.name = name
		if (phone !== undefined) user.phone = phone
		if (avatar !== undefined) user.avatar = avatar

		await user.save()

		const userObj = user.toObject()
		delete userObj.password

		res.status(200).json({ message: 'Profile updated successfully', user: userObj })
	} catch (error) {
		console.error('[Profile Update Error]', error.message)
		if (error.name === 'ValidationError') {
			const message = Object.values(error.errors).map((val) => val.message).join(', ')
			return res.status(400).json({ message })
		}
		res.status(500).json({ message: 'Failed to update profile' })
	}
})

export default userApp
