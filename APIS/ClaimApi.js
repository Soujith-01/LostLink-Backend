import exp from 'express'
import { config } from 'dotenv'
import { verifyToken } from '../middlewares/verifyToken.js'
import ClaimModel from '../models/ClaimModel.js'
import ItemModel from '../models/ItemModel.js'

export const claimApp = exp.Router()
config()

// Submit a claim on a found item
claimApp.post('/claims/:itemId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const { answer, message } = req.body
	if (!answer) {
		return res.status(400).json({ message: 'Answer is required for claim verification' })
	}

	const item = await ItemModel.findById(req.params.itemId).select('+verificationAnswer')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (item.type !== 'found') {
		return res.status(400).json({ message: 'Only FOUND items can be claimed' })
	}

	if (item.status !== 'active') {
		return res.status(400).json({ message: `Item is ${item.status} and cannot accept claims` })
	}

	if (String(item.postedBy) === String(req.user.userId)) {
		return res.status(400).json({ message: 'You cannot claim an item you posted yourself' })
	}

	const existingClaim = await ClaimModel.findOne({
		item: req.params.itemId,
		claimant: req.user.userId,
		status: { $in: ['pending', 'approved'] },
	})

	if (existingClaim) {
		return res.status(400).json({ message: 'You already have an active claim for this item' })
	}

	const claim = await ClaimModel.create({
		item: req.params.itemId,
		claimant: req.user.userId,
		answer: String(answer).trim(),
		message: message || '',
		status: 'pending',
	})

	res.status(201).json({ message: 'Claim submitted successfully', claim })
})

// View claims submitted by current user
claimApp.get('/my-claims', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claims = await ClaimModel.find({ claimant: req.user.userId })
		.populate({
			path: 'item',
			select: 'title category location images status postedBy',
			populate: { path: 'postedBy', select: 'name email phone avatar' },
		})
		.sort({ createdAt: -1 })

	res.status(200).json({ claims, count: claims.length })
})

// View claims for a specific item (Item Owner or Admin)
claimApp.get('/item-claims/:itemId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId).select('+verificationAnswer')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to view claims for this item' })
	}

	const claims = await ClaimModel.find({ item: req.params.itemId })
		.populate('claimant', 'name email phone avatar')
		.sort({ createdAt: -1 })

	const evaluatedClaims = claims.map((c) => {
		const claimObj = c.toObject()
		const isAnswerMatch =
			item.verificationAnswer &&
			c.answer.toLowerCase().trim() === item.verificationAnswer.toLowerCase().trim()
		return { ...claimObj, isAnswerMatch }
	})

	res.status(200).json({
		item: { _id: item._id, title: item.title, verificationQuestion: item.verificationQuestion },
		claims: evaluatedClaims,
		count: claims.length,
	})
})

// Approve a claim
claimApp.patch('/claims/:claimId/approve', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to approve claims for this item' })
	}

	claim.status = 'approved'
	await claim.save()

	item.status = 'claimed'
	await item.save()

	await ClaimModel.updateMany(
		{ item: item._id, _id: { $ne: claim._id }, status: 'pending' },
		{ $set: { status: 'rejected' } }
	)

	res.status(200).json({ message: 'Claim approved successfully', claim, item })
})

// Reject a claim
claimApp.patch('/claims/:claimId/reject', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to reject claims for this item' })
	}

	claim.status = 'rejected'
	await claim.save()

	res.status(200).json({ message: 'Claim rejected successfully', claim })
})

export default claimApp
