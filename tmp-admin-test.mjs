import 'dotenv/config'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import User from './src/models/User.js'
import Product from './src/models/Product.js'

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })

let admin = await User.findOne({ email: 'tmp.admin@test.com' })
if (!admin) {
  admin = await User.create({
    firstName: 'Tmp',
    lastName: 'Admin',
    email: 'tmp.admin@test.com',
    password: 'password123',
    role: 'admin'
  })
}

const total = await Product.countDocuments()
const inactive = await Product.countDocuments({ isActive: false })
const active = await Product.countDocuments({ isActive: true })
console.log(JSON.stringify({ token: jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' }), total, active, inactive }))

await mongoose.disconnect()
