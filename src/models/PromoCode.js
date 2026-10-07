import mongoose from 'mongoose'

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Promo code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [3, 'Promo code must be at least 3 characters'],
    maxlength: [30, 'Promo code cannot exceed 30 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  type: {
    type: String,
    enum: ['percent', 'fixed'],
    default: 'percent'
  },
  value: {
    type: Number,
    required: [true, 'Promo value is required'],
    min: [0, 'Promo value cannot be negative']
  },
  minOrderValue: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order value cannot be negative']
  },
  maxDiscount: {
    type: Number,
    default: null,
    min: [0, 'Max discount cannot be negative']
  },
  startsAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: null
  },
  maxRedemptions: {
    type: Number,
    default: null,
    min: [1, 'Max redemptions must be at least 1']
  },
  redemptionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  perUserLimit: {
    type: Number,
    default: 1,
    min: [1, 'Per user limit must be at least 1']
  },
  // Empty array = applies to the whole store (optional)
  categories: {
    type: [{ type: String, trim: true }],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
})

promoCodeSchema.index({ code: 1 }, { unique: true })
promoCodeSchema.index({ isActive: 1 })

const PromoCode = mongoose.model('PromoCode', promoCodeSchema)

export default PromoCode
