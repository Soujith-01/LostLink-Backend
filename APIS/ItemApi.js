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

const toLocationString = (location, city, area) => {
	const parts = [location, city, area].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
	return parts.join(', ')
}

const parsePagination = (value, fallback) => {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Fetch all lost/found items with filtering & search
itemApp.get(['/', '/items'], async (req, res) => {
	const { search, category, type, location, city, area, status = 'active', page = 1, limit = 10 } = req.query
	const query = { status }

	if (category) query.category = category
	if (type) query.type = type

	const normalizedLocation = toLocationString(location, city, area)
	if (normalizedLocation) {
		query.location = { $regex: normalizedLocation, $options: 'i' }
	}

	if (search) query.$text = { $search: search }

	const pageNumber = parsePagination(page, 1)
	const limitNumber = parsePagination(limit, 10)
	const skip = (pageNumber - 1) * limitNumber
	const items = await ItemModel.find(query)
		.populate('postedBy', 'name email avatar phone')
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limitNumber)

	const totalItems = await ItemModel.countDocuments(query)
	res.status(200).json({ items, totalItems, page: pageNumber, limit: limitNumber })
})

// Fetch items posted by current user
itemApp.get(['/my-items', '/my'], verifyToken('USER', 'ADMIN'), async (req, res) => {
	const items = await ItemModel.find({ postedBy: req.user.userId }).sort({ createdAt: -1 })
	res.status(200).json({ items, count: items.length })
})

// Fetch single item by ID
itemApp.get(['/:itemId', '/items/:itemId'], async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId).populate('postedBy', 'name email avatar phone')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	res.status(200).json({ item })
})

// Get candidate matches for a lost/found item
itemApp.get(['/:itemId/matches', '/items/:itemId/matches'], async (req, res) => {
	const matches = await findItemMatches(req.params.itemId)
	res.status(200).json({ itemId: req.params.itemId, matches, count: matches.length })
})

// Create a lost or found item
itemApp.post(['/', '/items'], verifyToken('USER', 'ADMIN'), upload.array('images', 5), async (req, res) => {
	const { title, description, category, type, location, city, area, date, verificationQuestion, verificationAnswer } = req.body
	const itemLocation = toLocationString(location, city, area)

	if (!title || !description || !category || !type || !itemLocation) {
		return res.status(400).json({ message: 'Title, description, category, type, and location are required' })
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
		location: itemLocation,
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
itemApp.put(['/:itemId', '/items/:itemId'], verifyToken('USER', 'ADMIN'), upload.array('images', 5), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to update this item' })
	}

	const { title, description, category, location, city, area, status } = req.body
	const itemLocation = toLocationString(location, city, area)

	if (title) item.title = title
	if (description) item.description = description
	if (category) item.category = category
	if (itemLocation) item.location = itemLocation
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
itemApp.delete(['/:itemId', '/items/:itemId'], verifyToken('USER', 'ADMIN'), async (req, res) => {
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
