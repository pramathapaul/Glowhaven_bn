import mongoose from 'mongoose'
import PromoCode from '../models/PromoCode.js'
import PromoRedemption from '../models/PromoRedemption.js'
import Product, { PRODUCT_CATEGORIES } from '../models/Product.js'

const round = (n) => Math.round(n * 100) / 100

// Hydrate cart items (id + quantity) with price/category from the database
export const loadCartItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return null

  const ids = [...new Set(items.map(i => i && i.product).filter(Boolean))]
    .filter(id => mongoose.isValidObjectId(id))
  if (ids.length === 0) return null

  const products = await Product.find({ _id: { $in: ids } }).select('price category')
  const byId = new Map(products.map(p => [String(p._id), p]))

  const hydrated = []
  for (const item of items) {
    const product = byId.get(String(item.product))
    if (!product) return null
    hydrated.push({
      price: product.price,
      quantity: Number(item.quantity) || 1,
      category: product.category
    })
  }
  return hydrated
}

const normalizeCategories = (value) => {
  if (value === undefined || value === null || value === '') return { ok: true, categories: [] }
  if (!Array.isArray(value)) {
    return { ok: false, message: 'Categories must be a list' }
  }

  const categories = [...new Set(
    value.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim())
  )]

  const invalid = categories.filter(c => !PRODUCT_CATEGORIES.includes(c))
  if (invalid.length > 0) {
    return { ok: false, message: `Invalid category: ${invalid.join(', ')}` }
  }

  return { ok: true, categories }
}

// Shared validation used by both the validate endpoint and order creation
// cartItems: optional [{ price, quantity, category }] loaded from the database
export const evaluatePromo = async (rawCode, userId, subtotal, cartItems = null) => {
  const code = String(rawCode || '').trim().toUpperCase()

  if (!code) {
    return { ok: false, message: 'Promo code is required' }
  }

  const promo = await PromoCode.findOne({ code })
  if (!promo) {
    return { ok: false, message: 'Invalid promo code' }
  }

  if (!promo.isActive) {
    return { ok: false, message: 'This promo code is currently paused' }
  }

  const now = new Date()
  if (promo.startsAt && promo.startsAt > now) {
    return { ok: false, message: 'This promo code is not active yet' }
  }
  if (promo.expiresAt && promo.expiresAt < now) {
    return { ok: false, message: 'This promo code has expired' }
  }
  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
    return { ok: false, message: 'This promo code has reached its usage limit' }
  }

  const hasItems = Array.isArray(cartItems) && cartItems.length > 0
  const cartSubtotal = hasItems
    ? round(cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0))
    : Number(subtotal) || 0

  if (promo.minOrderValue > 0 && cartSubtotal < promo.minOrderValue) {
    return {
      ok: false,
      message: `Minimum order value of ₹${promo.minOrderValue.toFixed(2)} required`
    }
  }

  const promoCategories = promo.categories || []
  const appliesToAll = promoCategories.length === 0
  const categoryLabel = promoCategories.join(', ')

  if (!appliesToAll) {
    // Every item in the cart must belong to an allowed category,
    // otherwise the promo code does not apply at all.
    if (!hasItems) {
      return {
        ok: false,
        message: `This promo code applies only to: ${categoryLabel}`
      }
    }

    const ineligibleItems = cartItems.filter(item => !promoCategories.includes(item.category))
    if (ineligibleItems.length > 0) {
      return {
        ok: false,
        message: `This promo code applies only to: ${categoryLabel}. Remove items from other categories to use it.`
      }
    }
  }

  const eligibleSubtotal = appliesToAll
    ? cartSubtotal
    : round(cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0))

  if (eligibleSubtotal <= 0) {
    return {
      ok: false,
      message: `This promo code applies only to: ${categoryLabel}`
    }
  }

  if (userId) {
    const used = await PromoRedemption.exists({ promo: promo._id, user: userId })
    if (used) {
      return { ok: false, message: 'You have already used this promo code' }
    }
  }

  let discount = 0
  if (promo.type === 'percent') {
    discount = (eligibleSubtotal * promo.value) / 100
    if (promo.maxDiscount !== null) {
      discount = Math.min(discount, promo.maxDiscount)
    }
  } else {
    discount = promo.value
  }

  discount = Math.round(Math.min(discount, eligibleSubtotal) * 100) / 100

  if (discount <= 0) {
    return { ok: false, message: 'Promo code does not apply to this order' }
  }

  return { ok: true, promo, discount, cartSubtotal, eligibleSubtotal }
}

// POST /api/promo-codes/validate  (any logged-in user)
export const validatePromoCode = async (req, res) => {
  try {
    const { code, subtotal, items } = req.body
    const cartItems = await loadCartItems(items)
    const result = await evaluatePromo(code, req.user._id, subtotal, cartItems)

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message })
    }

    res.json({
      success: true,
      data: {
        code: result.promo.code,
        description: result.promo.description,
        type: result.promo.type,
        value: result.promo.value,
        discount: result.discount,
        categories: result.promo.categories || [],
        eligibleSubtotal: result.eligibleSubtotal
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/promo-codes  (admin/manager)
export const getPromoCodes = async (req, res) => {
  try {
    const { search } = req.query
    const filter = {}

    if (search) {
      const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ code: regex }, { description: regex }]
    }

    const promos = await PromoCode.find(filter)
      .sort({ createdAt: -1 })
      .lean()

    const redemptions = await PromoRedemption.find({ promo: { $in: promos.map(p => p._id) } })
      .select('promo user')
      .lean()

    const uniqueUsers = redemptions.reduce((acc, r) => {
      const key = `${r.promo}`
      if (!acc[key]) acc[key] = new Set()
      acc[key].add(`${r.user}`)
      return acc
    }, {})

    const data = promos.map(promo => ({
      ...promo,
      usedByUsers: uniqueUsers[`${promo._id}`] ? uniqueUsers[`${promo._id}`].size : 0
    }))

    res.json({ success: true, data })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// POST /api/promo-codes  (admin)
export const createPromoCode = async (req, res) => {
  try {
    const {
      code, description = '', type = 'percent', value,
      minOrderValue = 0, maxDiscount = null,
      startsAt, expiresAt = null, maxRedemptions = null,
      perUserLimit = 1, isActive = true, categories = []
    } = req.body

    const normalizedCode = String(code || '').trim().toUpperCase()
    if (normalizedCode.length < 3) {
      return res.status(400).json({ success: false, message: 'Promo code must be at least 3 characters' })
    }

    const categoryCheck = normalizeCategories(categories)
    if (!categoryCheck.ok) {
      return res.status(400).json({ success: false, message: categoryCheck.message })
    }

    const numericValue = Number(value)
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      return res.status(400).json({ success: false, message: 'Promo value must be greater than 0' })
    }
    if (type === 'percent' && numericValue > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100' })
    }

    const start = startsAt ? new Date(startsAt) : new Date()
    const end = expiresAt ? new Date(expiresAt) : null
    if (end && end <= start) {
      return res.status(400).json({ success: false, message: 'Expiry date must be after the start date' })
    }

    const existing = await PromoCode.findOne({ code: normalizedCode })
    if (existing) {
      return res.status(400).json({ success: false, message: 'A promo code with this code already exists' })
    }

    const promo = await PromoCode.create({
      code: normalizedCode,
      description,
      type,
      value: numericValue,
      minOrderValue: Number(minOrderValue) || 0,
      maxDiscount: maxDiscount === null || maxDiscount === '' ? null : Number(maxDiscount),
      startsAt: start,
      expiresAt: end,
      maxRedemptions: maxRedemptions === null || maxRedemptions === '' ? null : Number(maxRedemptions),
      perUserLimit: Number(perUserLimit) || 1,
      isActive: Boolean(isActive),
      categories: categoryCheck.categories,
      createdBy: req.user._id
    })

    res.status(201).json({ success: true, data: promo })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A promo code with this code already exists' })
    }
    res.status(400).json({ success: false, message: error.message })
  }
}

// PUT /api/promo-codes/:id  (admin) - edit fields / pause / resume
export const updatePromoCode = async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id)
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo code not found' })
    }

    const allowed = [
      'code', 'description', 'type', 'value', 'minOrderValue', 'maxDiscount',
      'startsAt', 'expiresAt', 'maxRedemptions', 'perUserLimit', 'isActive'
    ]

    if (req.body.categories !== undefined) {
      const categoryCheck = normalizeCategories(req.body.categories)
      if (!categoryCheck.ok) {
        return res.status(400).json({ success: false, message: categoryCheck.message })
      }
      promo.categories = categoryCheck.categories
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        promo[key] = req.body[key]
      }
    }

    if (promo.code) {
      promo.code = String(promo.code).trim().toUpperCase()
      if (promo.code.length < 3) {
        return res.status(400).json({ success: false, message: 'Promo code must be at least 3 characters' })
      }
    }

    if (promo.type === 'percent' && promo.value > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100' })
    }
    if (promo.value <= 0) {
      return res.status(400).json({ success: false, message: 'Promo value must be greater than 0' })
    }
    if (promo.expiresAt && promo.startsAt && promo.expiresAt <= promo.startsAt) {
      return res.status(400).json({ success: false, message: 'Expiry date must be after the start date' })
    }

    await promo.save()
    res.json({ success: true, data: promo })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A promo code with this code already exists' })
    }
    res.status(400).json({ success: false, message: error.message })
  }
}

// DELETE /api/promo-codes/:id  (admin)
export const deletePromoCode = async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id)
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo code not found' })
    }

    await PromoRedemption.deleteMany({ promo: promo._id })
    await promo.deleteOne()

    res.json({ success: true, message: 'Promo code deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
