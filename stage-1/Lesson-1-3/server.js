const express = require('express');
const app = express();
const cors = require('cors');
const PORT = 3000;


app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.post('/api/message', (req, res) => {
    const message = req.body.message;
    const name = req.body.name;
    if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message is required.' });
    }
    res.json({
        success: true, 
        customer: name,
        message: message });
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});