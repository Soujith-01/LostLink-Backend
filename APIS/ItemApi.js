import exp from 'express'
import { config } from 'dotenv'
import { verifyToken } from '../middlewares/verifyToken.js'
import ItemModel from '../models/ItemModel.js'
import { uploadToCloudinary } from '../config/cloudinaryUpload.js'
import { isCloudinaryConfigured } from '../config/cloudinary.js'
import { upload } from '../config/multer.js'
import { findItemMatches } from '../services/matchingService.js'

export const itemApp = exp.Router()
config()

// Fetch all lost/found items with filtering & search
itemApp.get('/items', async (req, res) => {
	const { search, category, type, city, area, status = 'active', page = 1, limit = 10 } = req.query
	const query = { status }

	if (category) query.category = category
	if (type) query.type = type
	if (city) query['location.city'] = { $regex: city, $options: 'i' }
	if (area) query['location.area'] = { $regex: area, $options: 'i' }
	if (search) query.$text = { $search: search }

	const skip = (parseInt(page) - 1) * parseInt(limit)
	const items = await ItemModel.find(query)
		.populate('postedBy', 'name email avatar phone')
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(parseInt(limit))

	const totalItems = await ItemModel.countDocuments(query)
	res.status(200).json({ items, totalItems })
})

// Fetch items posted by current user
itemApp.get('/my-items', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const items = await ItemModel.find({ postedBy: req.user.userId }).sort({ createdAt: -1 })
	res.status(200).json({ items, count: items.length })
})

// Fetch single item by ID
itemApp.get('/items/:itemId', async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId).populate('postedBy', 'name email avatar phone')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	res.status(200).json({ item })
})

// Get candidate matches for a lost/found item
itemApp.get('/items/:itemId/matches', async (req, res) => {
	const matches = await findItemMatches(req.params.itemId)
	res.status(200).json({ itemId: req.params.itemId, matches, count: matches.length })
})

// Create a lost or found item
itemApp.post('/items', verifyToken('USER', 'ADMIN'), upload.array('images', 5), async (req, res) => {
	const { title, description, category, type, city, area, date, verificationQuestion, verificationAnswer } = req.body

	if (!title || !description || !category || !type || !city || !area) {
		return res.status(400).json({ message: 'Title, description, category, type, city, and area are required' })
	}

	if (type === 'found' && (!verificationQuestion || !verificationAnswer)) {
		return res.status(400).json({ message: 'Found items require a verification question and answer' })
	}

	const uploadedImages = []
	if (req.files?.length) {
		if (!isCloudinaryConfigured) {
			return res.status(500).json({ message: 'Cloudinary credentials missing' })
		}
		for (const file of req.files) {
			const result = await uploadToCloudinary(file.buffer, 'lostlink/items', file.originalname)
			uploadedImages.push(result)
		}
	}

	const item = await ItemModel.create({
		title,
		description,
		category,
		type,
		location: { city, area },
		date: date ? new Date(date) : new Date(),
		images: uploadedImages,
		verificationQuestion: type === 'found' ? verificationQuestion : '',
		verificationAnswer: type === 'found' ? verificationAnswer : '',
		postedBy: req.user.userId,
		status: 'active',
	})

	res.status(201).json({ message: 'Item posted successfully', item })
})

// Update item details
itemApp.put('/items/:itemId', verifyToken('USER', 'ADMIN'), upload.array('images', 5), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to update this item' })
	}

	const { title, description, category, city, area, status } = req.body
	if (title) item.title = title
	if (description) item.description = description
	if (category) item.category = category
	if (city) item.location.city = city
	if (area) item.location.area = area
	if (status) item.status = status

	if (req.files?.length && isCloudinaryConfigured) {
		const newImages = []
		for (const file of req.files) {
			const result = await uploadToCloudinary(file.buffer, 'lostlink/items', file.originalname)
			newImages.push(result)
		}
		item.images = [...item.images, ...newImages]
	}

	await item.save()
	res.status(200).json({ message: 'Item updated successfully', item })
})

// Delete item
itemApp.delete('/items/:itemId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to delete this item' })
	}

	await item.deleteOne()
	res.status(200).json({ message: 'Item deleted successfully' })
})

export default itemApp
