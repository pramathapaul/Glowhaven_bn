import dotenv from 'dotenv'

dotenv.config()

import app from './src/app.js'



const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`🚀 Glow Haven Server running on port ${PORT}`)
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 Server running on port ${PORT}`)
})

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString()
  });
});
