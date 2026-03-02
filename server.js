const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Static files serve karne ke liye

// Telegram Bot Configuration - YAHI PE SECURE HAI
const TELEGRAM_BOT_TOKEN = '8630246169:AAHjBwIdmKBAfmMF21gDYcfhkFTD-NBNXfk';
const TELEGRAM_CHAT_ID = '7798676542';

// Rate limiting ke liye simple object
const rateLimit = new Map();

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        // Basic validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format' 
            });
        }

        // Rate limiting - IP based (5 submissions per hour)
        const clientIp = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const hourInMs = 60 * 60 * 1000;
        
        if (rateLimit.has(clientIp)) {
            const userData = rateLimit.get(clientIp);
            if (now - userData.firstRequest < hourInMs && userData.count >= 5) {
                return res.status(429).json({
                    success: false,
                    error: 'Too many requests. Please try again later.'
                });
            }
            
            if (now - userData.firstRequest > hourInMs) {
                rateLimit.set(clientIp, { count: 1, firstRequest: now });
            } else {
                userData.count++;
                rateLimit.set(clientIp, userData);
            }
        } else {
            rateLimit.set(clientIp, { count: 1, firstRequest: now });
        }

        // Clean old rate limit entries (every hour)
        setInterval(() => {
            for (const [ip, data] of rateLimit) {
                if (now - data.firstRequest > hourInMs) {
                    rateLimit.delete(ip);
                }
            }
        }, hourInMs);

        // Telegram message format
        const telegramMessage = `
📬 **New Contact Form Submission**
━━━━━━━━━━━━━━━━
👤 **Name:** ${name}
📧 **Email:** ${email}
📝 **Subject:** ${subject}
💬 **Message:** ${message}
━━━━━━━━━━━━━━━━
🕐 **Time:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
📱 **IP:** ${clientIp}
        `;

        // Send to Telegram
        const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: 'Markdown'
            })
        });

        if (!telegramResponse.ok) {
            throw new Error('Telegram API error');
        }

        // Success response
        res.json({ 
            success: true, 
            message: 'Message sent successfully!' 
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error. Please try again later.' 
        });
    }
});

// Admin endpoint - check submissions count (optional)
app.get('/api/stats', (req, res) => {
    const stats = {
        totalSubmissions: Array.from(rateLimit.values()).reduce((acc, curr) => acc + curr.count, 0),
        activeIPs: rateLimit.size,
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
