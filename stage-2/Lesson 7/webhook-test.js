const express = require('express');
const app = express();
const cors = require('cors');
const PORT = 3000;


app.use(express.json());
app.use(cors());


app.post('/webhook/order', (req, res) => {
    const {orderId,customer,total} = req.body;
    
    res.status(200).json({
        success: true,
        "receivedOrder": orderId,
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});