import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide an item title'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a detailed description'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Please select a category'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['lost', 'found'],
      required: [true, 'Item type must be either lost or found'],
    },
    location: {
      city: { type: String, required: [true, 'Please specify city'], trim: true },
      area: { type: String, required: [true, 'Please specify area or landmark'], trim: true },
      coordinates: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    },
    date: {
      type: Date,
      required: [true, 'Please provide the date when the item was lost or found'],
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
    verificationQuestion: {
      type: String,
      default: '',
      trim: true,
    },
    verificationAnswer: {
      type: String,
      default: '',
      trim: true,
      select: false,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'claimed', 'closed'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

itemSchema.index({ type: 1, category: 1, status: 1 });
itemSchema.index({ title: 'text', description: 'text' });
itemSchema.index({ postedBy: 1 });
itemSchema.index({ createdAt: -1 });

const ItemModel = mongoose.model('Item', itemSchema);
export default ItemModel;
